from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Sensitivity = Literal["standard", "proprietary", "financial"]
Method = Literal["voice", "tap"]


class VoiceRequest(BaseModel):
    audio: str  # Base64-encoded audio
    language: str = "en"


class VoiceResponse(BaseModel):
    text: str
    audio: Optional[str] = None  # Base64-encoded TTS audio


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    language: str = "en"


class ChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    session_id: str = Field(default="default", max_length=64)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    goal: str = Field(min_length=1, max_length=8000)
    lane: str = "lane1"  # ignored: Marcus decides the lane
    deadline: Optional[datetime] = None
    sensitivity: Sensitivity = "standard"
    directorate: Optional[str] = Field(default=None, max_length=100)

    @field_validator("deadline")
    @classmethod
    def _deadline_has_offset(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v.tzinfo is None:
            raise ValueError("deadline must include a time zone offset")
        return v


class ApprovalCreate(BaseModel):
    task_id: UUID
    content_hash: str
    method: Method = "voice"


class EchelonApproval(BaseModel):
    approval_id: UUID
    approved_at: datetime
    method: Method
    content_hash: str


class EchelonHandoffCreate(BaseModel):
    """Exactly the fields ECHELON accepts. Anything else is rejected there."""

    client_operation_id: UUID
    title: str
    goal: str
    deadline: Optional[str] = None  # the exact string that was hashed
    requested_for: Literal["victor"] = "victor"
    approval: EchelonApproval
    sensitivity: Sensitivity = "standard"
    directorate: Optional[str] = None


class ResumeRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    layer: Literal["layer1", "layer2", "layer3"] = "layer3"
    source: Literal["voice", "text", "task", "call"] = "text"
    provenance: str = Field(default="", max_length=100)


class SpendLogCreate(BaseModel):
    amount_usd: float = Field(gt=0)
    description: str
    category: str = "money"


class TimezoneUpdate(BaseModel):
    timezone: str
