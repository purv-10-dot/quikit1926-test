"""Goal data models."""

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class GoalStatus(Enum):
    """Status of a goal."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class GoalPriority(Enum):
    """Priority level of a goal."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class Goal:
    """Represents a trackable goal."""
    title: str
    description: str = ""
    status: GoalStatus = GoalStatus.NOT_STARTED
    priority: GoalPriority = GoalPriority.MEDIUM
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    due_date: Optional[datetime] = None
    tags: list[str] = field(default_factory=list)
    progress: int = 0  # 0-100

    def __post_init__(self):
        if not self.title.strip():
            raise ValueError("Goal title cannot be empty")
        if not 0 <= self.progress <= 100:
            raise ValueError("Progress must be between 0 and 100")

    def mark_in_progress(self):
        """Mark the goal as in progress."""
        self.status = GoalStatus.IN_PROGRESS
        self.updated_at = datetime.now()

    def mark_completed(self):
        """Mark the goal as completed."""
        self.status = GoalStatus.COMPLETED
        self.progress = 100
        self.updated_at = datetime.now()

    def mark_abandoned(self):
        """Mark the goal as abandoned."""
        self.status = GoalStatus.ABANDONED
        self.updated_at = datetime.now()

    def update_progress(self, progress: int):
        """Update goal progress percentage."""
        if not 0 <= progress <= 100:
            raise ValueError("Progress must be between 0 and 100")
        self.progress = progress
        if progress > 0 and self.status == GoalStatus.NOT_STARTED:
            self.status = GoalStatus.IN_PROGRESS
        if progress == 100:
            self.status = GoalStatus.COMPLETED
        self.updated_at = datetime.now()

    def to_dict(self) -> dict:
        """Serialize goal to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status.value,
            "priority": self.priority.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "tags": self.tags,
            "progress": self.progress,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Goal":
        """Deserialize goal from dictionary."""
        return cls(
            id=data["id"],
            title=data["title"],
            description=data.get("description", ""),
            status=GoalStatus(data["status"]),
            priority=GoalPriority(data["priority"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            due_date=datetime.fromisoformat(data["due_date"]) if data.get("due_date") else None,
            tags=data.get("tags", []),
            progress=data.get("progress", 0),
        )
