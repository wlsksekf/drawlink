import json
import asyncio
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query, APIRouter
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
    # 데이터베이스 테이블이 없으면 초기화하여 생성합니다
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # 종료 시 데이터베이스 연결 풀을 정리(정상 종료)합니다
    await engine.dispose()

app = FastAPI(lifespan=lifespan, title="DrawLink API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter()

app.include_router(api_router, prefix="/api")

# 보드의 초기 상태를 가져오는 REST API 엔드포인트
@api_router.get("/boards/{board_id}/drawings", response_model=List[DrawingBase])
async def get_drawings(board_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Drawing).where(Drawing.board_id == board_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@api_router.get("/boards/{board_id}/stickies", response_model=List[StickyNoteBase])
async def get_stickies(board_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(StickyNote).where(StickyNote.board_id == board_id)
    result = await db.execute(stmt)
    return result.scalars().all()

# 보드의 모든 데이터를 삭제하고 초기화
@api_router.delete("/boards/{board_id}/clear")
async def clear_board(board_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Drawing).where(Drawing.board_id == board_id))
    await db.execute(delete(StickyNote).where(StickyNote.board_id == board_id))
    await db.commit()
    # 현재 연결된 클라이언트들에게 초기화 알림 전송
    await manager.broadcast(board_id, {"type": "clear_board", "data": {}})
    return {"status": "success", "message": f"Board {board_id} cleared"}

# Real-time WebSocket connection (경로가 자동으로 /api/ws/{board_id} 가 됨)
@api_router.websocket("/ws/{board_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    board_id: str,
    token: str = Query(None)
):
    # 토큰이 있으면 인증하고, 없으면 익명(게스트) 연결로 처리합니다
    user_payload = verify_ws_token(token)
    
    await manager.connect(board_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")
                msg_data = msg.get("data", {})
                
                # 데이터에 작성자 ID(user_id) 덮어쓰기 또는 추가
                if user_payload:
                    msg_data["user_id"] = user_payload.get("sub", "unknown")
                elif "user_id" not in msg_data:
                    msg_data["user_id"] = "anonymous"

                # 1. 다른 모든 연결된 클라이언트에게 즉시 브로드캐스트 (빠른 반응)
                await manager.broadcast(board_id, msg, exclude=websocket)

                # 2. 비동기 데이터베이스 저장 (웹소켓 속도 저하를 막기 위해 Non-blocking)
                if msg_type == "draw":
                    action = msg_data.get("action")
                    if action in ["draw_end", "clear"]:
                        asyncio.create_task(persist_drawing(board_id, msg_data))
                elif msg_type == "sticky":
                    asyncio.create_task(persist_sticky_note(board_id, msg_data))

            except json.JSONDecodeError:
                # 잘못된 형태의 JSON 데이터는 에러를 띄우지 않고 조용히 무시합니다
                pass
    except WebSocketDisconnect:
        manager.disconnect(board_id, websocket)

# 🔹 2. 최종적으로 마스터 라우터를 FastAPI 앱에 한 번에 바인딩!
app.include_router(api_router)