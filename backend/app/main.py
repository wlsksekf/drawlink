import json
import asyncio
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete

from .database import engine, Base, get_db
from .models import Drawing, StickyNote
from .schemas import DrawingBase, StickyNoteBase
from .websocket_manager import manager, persist_drawing, persist_sticky_note
from .auth import verify_ws_token

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database tables if they do not exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup database connection pool on shutdown
    await engine.dispose()

app = FastAPI(lifespan=lifespan, title="DrawLink API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST endpoints to retrieve board initial state
@app.get("/boards/{board_id}/drawings", response_model=List[DrawingBase])
async def get_drawings(board_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Drawing).where(Drawing.board_id == board_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@app.get("/boards/{board_id}/stickies", response_model=List[StickyNoteBase])
async def get_stickies(board_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(StickyNote).where(StickyNote.board_id == board_id)
    result = await db.execute(stmt)
    return result.scalars().all()

# Delete and reset board
@app.delete("/boards/{board_id}/clear")
async def clear_board(board_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Drawing).where(Drawing.board_id == board_id))
    await db.execute(delete(StickyNote).where(StickyNote.board_id == board_id))
    await db.commit()
    # Notify active clients
    await manager.broadcast(board_id, {"type": "clear_board", "data": {}})
    return {"status": "success", "message": f"Board {board_id} cleared"}

# Real-time WebSocket connection
@app.websocket("/ws/{board_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    board_id: str,
    token: str = Query(None)
):
    # Authenticate token if present, else fallback to anonymous connection
    user_payload = verify_ws_token(token)
    
    await manager.connect(board_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")
                msg_data = msg.get("data", {})
                
                # Overwrite or populate user_id
                if user_payload:
                    msg_data["user_id"] = user_payload.get("sub", "unknown")
                elif "user_id" not in msg_data:
                    msg_data["user_id"] = "anonymous"

                # 1. Broadcast immediately to all other connected clients
                await manager.broadcast(board_id, msg, exclude=websocket)

                # 2. Async database write (non-blocking for websocket speed)
                if msg_type == "draw":
                    action = msg_data.get("action")
                    # To minimize DB strain, only write final lines (draw_end) or clear commands.
                    # Coordinates generated during drag (draw_progress) are transient and only broadcasted.
                    if action in ["draw_end", "clear"]:
                        asyncio.create_task(persist_drawing(board_id, msg_data))
                elif msg_type == "sticky":
                    asyncio.create_task(persist_sticky_note(board_id, msg_data))

            except json.JSONDecodeError:
                # Silently discard malformed JSON payloads
                pass
    except WebSocketDisconnect:
        manager.disconnect(board_id, websocket)
