from sqlalchemy import Column, String, Text, DateTime, Float, Boolean, JSON, Integer
from sqlalchemy import Uuid
from sqlalchemy.sql import func
from database import Base
from pgvector.sqlalchemy import Vector
import uuid


class User(Base):
    __tablename__ = "users"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(100))
    email = Column(String(100), unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid)
    task_id = Column(Uuid)
    content_hash = Column(String(64))  # SHA-256, see services/hashing.py
    method = Column(String(10))  # voice | tap
    status = Column(String(20))  # pending | approved | rejected
    used = Column(Boolean, default=False)
    approved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    __tablename__ = "tasks"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid)
    title = Column(String(200))
    goal = Column(Text)
    lane = Column(String(10))  # lane1 | lane2 | lane3
    # pending | frozen | handed_off | awaiting_confirmation | blocked | done | failed | cancelled
    status = Column(String(32), default="pending")
    prev_status = Column(String(32))  # status held before a freeze
    deadline = Column(DateTime(timezone=True))
    deadline_str = Column(String(64))  # exact ISO string hashed and sent to ECHELON
    sensitivity = Column(String(20))  # standard | proprietary | financial
    directorate = Column(String(100))
    client_operation_id = Column(Uuid, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Memory(Base):
    __tablename__ = "memory"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid)
    layer = Column(String(10))  # layer1 | layer2 | layer3
    content = Column(Text)
    source = Column(String(20))  # voice | text | task | call
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    provenance = Column(String(100))
    embedding = Column(Vector(1536))  # text-embedding-3-small dimension


class SpendLog(Base):
    __tablename__ = "spend_log"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid)
    amount_usd = Column(Float)
    description = Column(Text)
    category = Column(String(50))  # llm | embedding | money | proprietary
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EchelonHandoff(Base):
    __tablename__ = "echelon_handoffs"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id = Column(Uuid)
    approval_id = Column(Uuid)  # the first approval used for this handoff
    echelon_task_id = Column(String(100))
    # mirrors ECHELON: received | routed | in_progress | done | reconfirmation_required |
    # blocked | paused | frozen | failed | cancelled | rejected
    status = Column(String(32))
    response = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ActionTrust(Base):
    __tablename__ = "action_trust"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    action_type = Column(String(100))  # e.g. "lane1_action", "echelon_handoff"
    clean_count = Column(Integer, default=0)  # approvals completed without reversal
    trusted = Column(Boolean, default=False)
    revoked_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ControlState(Base):
    """One row (id=1). The kill switch lives here so it survives a restart."""

    __tablename__ = "control_state"
    id = Column(Integer, primary_key=True)
    frozen = Column(Boolean, default=False, nullable=False)
    changed_at = Column(DateTime(timezone=True))


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text)


class Briefing(Base):
    """Briefings and alerts stored for the frontend to fetch."""

    __tablename__ = "briefings"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    kind = Column(String(30))  # morning | evening | weekend | memory_review | alert
    key = Column(String(120), index=True)  # dedupe key for alerts
    text = Column(Text)
    delivered = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id = Column(String(64), index=True)
    role = Column(String(10))  # user | assistant
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
