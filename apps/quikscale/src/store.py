"""Goal persistence using JSON file storage."""

import json
import os
from pathlib import Path
from typing import Optional

from .models import Goal, GoalPriority, GoalStatus


class GoalStore:
    """File-based storage for goals."""

    def __init__(self, storage_path: str = "goals.json"):
        self.storage_path = Path(storage_path)
        self._goals: dict[str, Goal] = {}
        self._load()

    def _load(self):
        """Load goals from storage file."""
        if self.storage_path.exists():
            with open(self.storage_path, "r") as f:
                data = json.load(f)
            self._goals = {g["id"]: Goal.from_dict(g) for g in data.get("goals", [])}

    def _save(self):
        """Persist goals to storage file."""
        data = {"goals": [g.to_dict() for g in self._goals.values()]}
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)

    def add(self, goal: Goal) -> Goal:
        """Add a new goal."""
        self._goals[goal.id] = goal
        self._save()
        return goal

    def get(self, goal_id: str) -> Optional[Goal]:
        """Get a goal by ID."""
        return self._goals.get(goal_id)

    def list_all(self) -> list[Goal]:
        """List all goals."""
        return list(self._goals.values())

    def list_by_status(self, status: GoalStatus) -> list[Goal]:
        """List goals filtered by status."""
        return [g for g in self._goals.values() if g.status == status]

    def list_by_priority(self, priority: GoalPriority) -> list[Goal]:
        """List goals filtered by priority."""
        return [g for g in self._goals.values() if g.priority == priority]

    def update(self, goal: Goal) -> Goal:
        """Update an existing goal."""
        if goal.id not in self._goals:
            raise KeyError(f"Goal {goal.id} not found")
        self._goals[goal.id] = goal
        self._save()
        return goal

    def delete(self, goal_id: str) -> bool:
        """Delete a goal by ID."""
        if goal_id in self._goals:
            del self._goals[goal_id]
            self._save()
            return True
        return False

    def search(self, query: str) -> list[Goal]:
        """Search goals by title or description."""
        query_lower = query.lower()
        return [
            g for g in self._goals.values()
            if query_lower in g.title.lower() or query_lower in g.description.lower()
        ]

    @property
    def count(self) -> int:
        """Total number of goals."""
        return len(self._goals)

    def stats(self) -> dict:
        """Get summary statistics."""
        goals = self.list_all()
        return {
            "total": len(goals),
            "not_started": sum(1 for g in goals if g.status == GoalStatus.NOT_STARTED),
            "in_progress": sum(1 for g in goals if g.status == GoalStatus.IN_PROGRESS),
            "completed": sum(1 for g in goals if g.status == GoalStatus.COMPLETED),
            "abandoned": sum(1 for g in goals if g.status == GoalStatus.ABANDONED),
            "avg_progress": sum(g.progress for g in goals) / len(goals) if goals else 0,
        }
