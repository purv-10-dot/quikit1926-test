"""Tests for goal store."""

import tempfile
import os

import pytest
from src.models import Goal, GoalPriority, GoalStatus
from src.store import GoalStore


@pytest.fixture
def store(tmp_path):
    """Create a temporary store."""
    return GoalStore(storage_path=str(tmp_path / "test_goals.json"))


class TestGoalStore:
    def test_add_and_get(self, store):
        goal = Goal(title="Test Goal")
        store.add(goal)
        retrieved = store.get(goal.id)
        assert retrieved is not None
        assert retrieved.title == "Test Goal"

    def test_list_all(self, store):
        store.add(Goal(title="Goal 1"))
        store.add(Goal(title="Goal 2"))
        assert len(store.list_all()) == 2

    def test_list_by_status(self, store):
        g1 = Goal(title="Goal 1")
        g2 = Goal(title="Goal 2")
        g2.mark_completed()
        store.add(g1)
        store.add(g2)
        assert len(store.list_by_status(GoalStatus.NOT_STARTED)) == 1
        assert len(store.list_by_status(GoalStatus.COMPLETED)) == 1

    def test_delete(self, store):
        goal = Goal(title="To Delete")
        store.add(goal)
        assert store.delete(goal.id) is True
        assert store.get(goal.id) is None
        assert store.delete("nonexistent") is False

    def test_search(self, store):
        store.add(Goal(title="Learn Python", description="Master the language"))
        store.add(Goal(title="Learn Rust"))
        results = store.search("python")
        assert len(results) == 1
        assert results[0].title == "Learn Python"

    def test_stats(self, store):
        g1 = Goal(title="G1")
        g2 = Goal(title="G2")
        g2.mark_completed()
        store.add(g1)
        store.add(g2)
        stats = store.stats()
        assert stats["total"] == 2
        assert stats["completed"] == 1
        assert stats["not_started"] == 1

    def test_persistence(self, tmp_path):
        path = str(tmp_path / "persist_test.json")
        store1 = GoalStore(storage_path=path)
        store1.add(Goal(title="Persistent Goal"))

        store2 = GoalStore(storage_path=path)
        assert store2.count == 1
        assert store2.list_all()[0].title == "Persistent Goal"

    def test_update(self, store):
        goal = Goal(title="Original")
        store.add(goal)
        goal.update_progress(75)
        store.update(goal)
        retrieved = store.get(goal.id)
        assert retrieved.progress == 75

    def test_update_nonexistent_raises(self, store):
        goal = Goal(title="Ghost")
        with pytest.raises(KeyError):
            store.update(goal)
