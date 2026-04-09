"""Command-line interface for goal management."""

import argparse
import sys

from .models import Goal, GoalPriority, GoalStatus
from .store import GoalStore


def create_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="goals",
        description="Goal tracking and management tool",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Add goal
    add_parser = subparsers.add_parser("add", help="Add a new goal")
    add_parser.add_argument("title", help="Goal title")
    add_parser.add_argument("-d", "--description", default="", help="Goal description")
    add_parser.add_argument(
        "-p", "--priority",
        choices=["low", "medium", "high", "critical"],
        default="medium",
        help="Goal priority",
    )
    add_parser.add_argument("-t", "--tags", nargs="*", default=[], help="Goal tags")

    # List goals
    list_parser = subparsers.add_parser("list", help="List goals")
    list_parser.add_argument(
        "-s", "--status",
        choices=["not_started", "in_progress", "completed", "abandoned"],
        help="Filter by status",
    )
    list_parser.add_argument(
        "-p", "--priority",
        choices=["low", "medium", "high", "critical"],
        help="Filter by priority",
    )

    # Update goal
    update_parser = subparsers.add_parser("update", help="Update a goal")
    update_parser.add_argument("id", help="Goal ID")
    update_parser.add_argument("--progress", type=int, help="Progress (0-100)")
    update_parser.add_argument(
        "--status",
        choices=["not_started", "in_progress", "completed", "abandoned"],
        help="New status",
    )

    # Delete goal
    delete_parser = subparsers.add_parser("delete", help="Delete a goal")
    delete_parser.add_argument("id", help="Goal ID")

    # Search
    search_parser = subparsers.add_parser("search", help="Search goals")
    search_parser.add_argument("query", help="Search query")

    # Stats
    subparsers.add_parser("stats", help="Show goal statistics")

    return parser


def format_goal(goal: Goal) -> str:
    """Format a goal for display."""
    status_icons = {
        GoalStatus.NOT_STARTED: "[ ]",
        GoalStatus.IN_PROGRESS: "[~]",
        GoalStatus.COMPLETED: "[x]",
        GoalStatus.ABANDONED: "[-]",
    }
    icon = status_icons[goal.status]
    priority_label = goal.priority.value.upper()
    tags = f" [{', '.join(goal.tags)}]" if goal.tags else ""
    return f"{icon} {goal.title} ({priority_label}, {goal.progress}%){tags}\n    ID: {goal.id}"


def run(args: list[str] | None = None, store: GoalStore | None = None) -> int:
    """Run the CLI with given arguments."""
    parser = create_parser()
    parsed = parser.parse_args(args)

    if not parsed.command:
        parser.print_help()
        return 0

    if store is None:
        store = GoalStore()

    if parsed.command == "add":
        goal = Goal(
            title=parsed.title,
            description=parsed.description,
            priority=GoalPriority(parsed.priority),
            tags=parsed.tags,
        )
        store.add(goal)
        print(f"Created goal: {goal.id}")
        return 0

    if parsed.command == "list":
        if parsed.status:
            goals = store.list_by_status(GoalStatus(parsed.status))
        elif parsed.priority:
            goals = store.list_by_priority(GoalPriority(parsed.priority))
        else:
            goals = store.list_all()

        if not goals:
            print("No goals found.")
            return 0

        for goal in goals:
            print(format_goal(goal))
        return 0

    if parsed.command == "update":
        goal = store.get(parsed.id)
        if not goal:
            print(f"Goal {parsed.id} not found.", file=sys.stderr)
            return 1
        if parsed.progress is not None:
            goal.update_progress(parsed.progress)
        if parsed.status:
            status = GoalStatus(parsed.status)
            if status == GoalStatus.COMPLETED:
                goal.mark_completed()
            elif status == GoalStatus.IN_PROGRESS:
                goal.mark_in_progress()
            elif status == GoalStatus.ABANDONED:
                goal.mark_abandoned()
            else:
                goal.status = status
        store.update(goal)
        print(f"Updated goal: {goal.id}")
        return 0

    if parsed.command == "delete":
        if store.delete(parsed.id):
            print(f"Deleted goal: {parsed.id}")
            return 0
        print(f"Goal {parsed.id} not found.", file=sys.stderr)
        return 1

    if parsed.command == "search":
        results = store.search(parsed.query)
        if not results:
            print("No matching goals found.")
            return 0
        for goal in results:
            print(format_goal(goal))
        return 0

    if parsed.command == "stats":
        s = store.stats()
        print(f"Total goals:  {s['total']}")
        print(f"Not started:  {s['not_started']}")
        print(f"In progress:  {s['in_progress']}")
        print(f"Completed:    {s['completed']}")
        print(f"Abandoned:    {s['abandoned']}")
        print(f"Avg progress: {s['avg_progress']:.1f}%")
        return 0

    return 0


def main():
    """Entry point."""
    sys.exit(run())


if __name__ == "__main__":
    main()
