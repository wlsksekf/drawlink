from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Point(BaseModel):
    x: float
    y: float

class DrawingBase(BaseModel):
    id: str
    board_id: str
    points: List[Point]
    color: str
    width: int
    user_id: str

    class Config:
        from_attributes = True

class StickyNoteBase(BaseModel):
    id: str
    board_id: str
    x: float
    y: float
    text: str
    color: str
    user_id: str

    class Config:
        from_attributes = True

# WebSocket payloads
class WSDrawingData(BaseModel):
    action: str  # "draw_start", "draw_progress", "draw_end", "clear"
    line_id: str
    points: Optional[List[Point]] = None
    color: Optional[str] = "#000000"
    width: Optional[int] = 2
    user_id: str

class WSStickyData(BaseModel):
    action: str  # "create", "update", "delete"
    note_id: str
    x: Optional[float] = None
    y: Optional[float] = None
    text: Optional[str] = ""
    color: Optional[str] = "#fef3c7"
    user_id: str

class WSMessage(BaseModel):
    type: str  # "draw" or "sticky" or "clear_board"
    data: Dict[str, Any]
