"""Tests for CLI interface."""

import pytest
from src.cli import run
from src.store import GoalStore


@pytest.fixture
def store(tmp_path):
    return GoalStore(storage_path=str(tmp_path / "cli_test.json"))


class TestCLI:
    def test_add_goal(self, store, capsys):
        result = run(["add", "My Goal", "-p", "high"], store=store)
        assert result == 0
        output = capsys.readouterr().out
        assert "Created goal:" in output
        assert store.count == 1

    def test_list_empty(self, store, capsys):
        result = run(["list"], store=store)
        assert result == 0
        assert "No goals found" in capsys.readouterr().out

    def test_list_goals(self, store, capsys):
        run(["add", "Goal A"], store=store)
        run(["add", "Goal B"], store=store)
        result = run(["list"], store=store)
        assert result == 0
        output = capsys.readouterr().out
        assert "Goal A" in output
        assert "Goal B" in output

    def test_stats(self, store, capsys):
        run(["add", "G1"], store=store)
        result = run(["stats"], store=store)
        assert result == 0
        output = capsys.readouterr().out
        assert "Total goals:" in output

    def test_search(self, store, capsys):
        run(["add", "Learn Python"], store=store)
        run(["add", "Learn Rust"], store=store)
        result = run(["search", "Python"], store=store)
        assert result == 0
        output = capsys.readouterr().out
        assert "Python" in output
        assert "Rust" not in output

    def test_no_command_shows_help(self, store, capsys):
        result = run([], store=store)
        assert result == 0
