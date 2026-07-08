from sqlalchemy import Column, String, Integer, JSON, Float, BigInteger, Text, DateTime, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
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

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, index=True)
    email = Column(String, nullable=False)
    balance = Column(Integer, nullable=False, default=0)
    role = Column(String, nullable=False, default="USER")
    status = Column(String, nullable=False, default="ACTIVE")
    suspended_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())

class TossPayment(Base):
    __tablename__ = "toss_payments"

    payment_id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    order_id = Column(String, nullable=False, unique=True)
    payment_key = Column(String, nullable=True)
    amount = Column(Integer, nullable=False)
    account_number = Column(String, nullable=True)
    bank_code = Column(String, nullable=True)
    customer_name = Column(String, nullable=True)
    payment_status = Column(String, nullable=False, default="READY")
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())

class UiTest(Base):
    __tablename__ = "ui_tests"

    ui_test_id = Column(UUID(as_uuid=True), primary_key=True, default=func.gen_random_uuid(), server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    target_url = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="PENDING")
    report = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now(), onupdate=func.now())

class UiTestStep(Base):
    __tablename__ = "ui_test_steps"

    step_id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    ui_test_id = Column(UUID(as_uuid=True), ForeignKey("ui_tests.ui_test_id"), nullable=False)
    step_num = Column(Integer, nullable=False)
    action = Column(String, nullable=False)
    selector = Column(Text, nullable=True)
    input_text = Column(Text, nullable=True)
    url = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)
    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())

class Board(Base):
    __tablename__ = "boards"

    board_id = Column(UUID(as_uuid=True), primary_key=True, default=func.gen_random_uuid(), server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    title = Column(String, nullable=False, default="이름 없는 칠판")
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())

class Memo(Base):
    __tablename__ = "memos"

    memo_id = Column(UUID(as_uuid=True), primary_key=True, default=func.gen_random_uuid(), server_default=func.gen_random_uuid())
    board_id = Column(UUID(as_uuid=True), ForeignKey("boards.board_id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    content = Column(Text, nullable=True)
    x_position = Column(Numeric, nullable=False, default=0.0)
    y_position = Column(Numeric, nullable=False, default=0.0)
    color = Column(String, default="#FFFF00")
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now(), onupdate=func.now())

class AgentExplorationLog(Base):
    __tablename__ = "agent_exploration_logs"

    log_id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    ui_test_id = Column(UUID(as_uuid=True), ForeignKey("ui_tests.ui_test_id"), nullable=False)
    step_number = Column(Integer, nullable=False)
    current_url = Column(Text, nullable=False)
    extracted_dom = Column(JSON, nullable=False)  # mapped to jsonb
    ai_reasoning = Column(Text, nullable=False)
    action_taken = Column(String, nullable=False)
    target_selector = Column(Text, nullable=True)
    screenshot_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
