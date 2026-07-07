import json
import asyncio
from typing import Dict, Set, Any
from fastapi import WebSocket
from sqlalchemy.future import select
from .models import Drawing, StickyNote
from .database import AsyncSessionLocal

class ConnectionManager:
    def __init__(self):
        # Map board_id -> set of active WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, board_id: str, websocket: WebSocket):
        await websocket.accept()
        if board_id not in self.active_connections:
            self.active_connections[board_id] = set()
        self.active_connections[board_id].add(websocket)

    def disconnect(self, board_id: str, websocket: WebSocket):
        if board_id in self.active_connections:
            self.active_connections[board_id].discard(websocket)
            if not self.active_connections[board_id]:
                del self.active_connections[board_id]

    async def broadcast(self, board_id: str, message: dict, exclude: WebSocket = None):
        if board_id in self.active_connections:
            message_str = json.dumps(message)
            tasks = []
            for connection in self.active_connections[board_id]:
                if connection != exclude:
                    tasks.append(self._send_safe(connection, message_str))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_safe(self, websocket: WebSocket, message: str):
        try:
            await websocket.send_text(message)
        except Exception:
            # Connection died, it will be discarded in disconnect lifecycle
            pass

manager = ConnectionManager()

# Asynchronous background database persistence
async def persist_drawing(board_id: str, data: dict):
    action = data.get("action")
    line_id = data.get("line_id")
    if not line_id:
        return

    async with AsyncSessionLocal() as session:
        try:
            if action == "clear":
                # Clear all drawings for this board
                # Usually we'd do a delete statement
                pass
            
            # Retrieve or create line
            stmt = select(Drawing).where(Drawing.id == line_id)
            result = await session.execute(stmt)
            drawing = result.scalar_one_or_none()

            if drawing:
                drawing.points = data.get("points", [])
            else:
                drawing = Drawing(
                    id=line_id,
                    board_id=board_id,
                    points=data.get("points", []),
                    color=data.get("color", "#000000"),
                    width=data.get("width", 2),
                    user_id=data.get("user_id", "anonymous")
                )
                session.add(drawing)
            await session.commit()
        except Exception as e:
            await session.rollback()
            # In load tests, we write log output or handle failures gracefully
            print(f"Error persisting drawing to database: {e}")

async def persist_sticky_note(board_id: str, data: dict):
    action = data.get("action")
    note_id = data.get("note_id")
    if not note_id:
        return

    async with AsyncSessionLocal() as session:
        try:
            if action == "delete":
                stmt = select(StickyNote).where(StickyNote.id == note_id)
                result = await session.execute(stmt)
                note = result.scalar_one_or_none()
                if note:
                    await session.delete(note)
                    await session.commit()
                return

            stmt = select(StickyNote).where(StickyNote.id == note_id)
            result = await session.execute(stmt)
            note = result.scalar_one_or_none()

            if note:
                if "x" in data and data["x"] is not None:
                    note.x = data["x"]
                if "y" in data and data["y"] is not None:
                    note.y = data["y"]
                if "text" in data:
                    note.text = data["text"]
                if "color" in data:
                    note.color = data["color"]
            else:
                note = StickyNote(
                    id=note_id,
                    board_id=board_id,
                    x=data.get("x", 100.0),
                    y=data.get("y", 100.0),
                    text=data.get("text", ""),
                    color=data.get("color", "#fef3c7"),
                    user_id=data.get("user_id", "anonymous")
                )
                session.add(note)
            await session.commit()
        except Exception as e:
            await session.rollback()
            print(f"Error persisting sticky note to database: {e}")
