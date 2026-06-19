"""Tests for goal models."""

import pytest
from src.models import Goal, GoalPriority, GoalStatus


class TestGoal:
    def test_create_goal(self):
        goal = Goal(title="Learn Python")
        assert goal.title == "Learn Python"
        assert goal.status == GoalStatus.NOT_STARTED
        assert goal.priority == GoalPriority.MEDIUM
        assert goal.progress == 0

    def test_empty_title_raises(self):
        with pytest.raises(ValueError, match="title cannot be empty"):
            Goal(title="   ")

    def test_invalid_progress_raises(self):
        with pytest.raises(ValueError, match="Progress must be between"):
            Goal(title="Test", progress=150)

    def test_mark_completed(self):
        goal = Goal(title="Test")
        goal.mark_completed()
        assert goal.status == GoalStatus.COMPLETED
        assert goal.progress == 100

    def test_mark_in_progress(self):
        goal = Goal(title="Test")
        goal.mark_in_progress()
        assert goal.status == GoalStatus.IN_PROGRESS

    def test_mark_abandoned(self):
        goal = Goal(title="Test")
        goal.mark_abandoned()
        assert goal.status == GoalStatus.ABANDONED

    def test_update_progress(self):
        goal = Goal(title="Test")
        goal.update_progress(50)
        assert goal.progress == 50
        assert goal.status == GoalStatus.IN_PROGRESS

    def test_update_progress_to_100_completes(self):
        goal = Goal(title="Test")
        goal.update_progress(100)
        assert goal.status == GoalStatus.COMPLETED

    def test_update_progress_invalid(self):
        goal = Goal(title="Test")
        with pytest.raises(ValueError):
            goal.update_progress(-1)

    def test_serialization_roundtrip(self):
        goal = Goal(title="Test", description="A test goal", tags=["test", "demo"])
        data = goal.to_dict()
        restored = Goal.from_dict(data)
        assert restored.title == goal.title
        assert restored.description == goal.description
        assert restored.id == goal.id
        assert restored.tags == goal.tags
        assert restored.status == goal.status
