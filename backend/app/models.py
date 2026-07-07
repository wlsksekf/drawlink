from sqlalchemy import Column, String, Integer, JSON, Float
from .database import Base

class Drawing(Base):
    __tablename__ = "drawings"

    id = Column(String, primary_key=True, index=True)
    board_id = Column(String, index=True, nullable=False)
    points = Column(JSON, nullable=False)  # Stored as a list of {"x": float, "y": float}
    color = Column(String, default="#000000")
    width = Column(Integer, default=2)
    user_id = Column(String, nullable=False)

class StickyNote(Base):
    __tablename__ = "sticky_notes"

    id = Column(String, primary_key=True, index=True)
    board_id = Column(String, index=True, nullable=False)
    x = Column(Float, default=100.0)
    y = Column(Float, default=100.0)
    text = Column(String, default="")
    color = Column(String, default="#fef3c7")
    user_id = Column(String, nullable=False)
