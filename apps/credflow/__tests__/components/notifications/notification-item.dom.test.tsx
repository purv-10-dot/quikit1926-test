// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NotificationRow } from "@/lib/notifications/types";

// next/navigation's useRouter is the only external dependency of the row.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { NotificationItem } from "@/components/notifications/notification-item";

/**
 * The activity-feed row turns a notification's `metadata.type` + fields into a
 * "<bold actor> <action> <target>" line. These tests pin every supported type,
 * the system/cron (no-actor) variants, the unknown-type fallback, defensive
 * handling of missing metadata, and the click / mark-read behavior.
 */

function row(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    id: "n1",
    tenantId: "t1",
    userId: "u1",
    title: "Fallback title",
    body: "Fallback body",
    category: "task",
    link: "/tasks",
    readAt: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const noop = () => {};

function renderItem(n: NotificationRow, opts: { onMarkRead?: (id: string) => void; onClose?: () => void } = {}) {
  return render(
    <NotificationItem
      notification={n}
      isLast
      onMarkRead={opts.onMarkRead ?? noop}
      onClose={opts.onClose ?? noop}
    />,
  );
}

afterEach(() => {
  cleanup();
});
beforeEach(() => {
  push.mockClear();
});

describe("NotificationItem — activity mapping", () => {
  it("task_assigned (new) → actor + 'assigned you a task' + subject", () => {
    renderItem(
      row({
        metadata: { type: "task_assigned", taskSubject: "Follow up with Acme", assignedByName: "Aman", priority: "High" },
      }),
    );
    expect(screen.getByText("Aman")).toBeInTheDocument();
    expect(screen.getByText("assigned you a task")).toBeInTheDocument();
    expect(screen.getByText("Follow up with Acme")).toBeInTheDocument();
    expect(screen.getByText(/High priority/i)).toBeInTheDocument();
  });

  it("task_assigned (reassignment) → 'reassigned a task to you'", () => {
    renderItem(
      row({
        metadata: { type: "task_assigned", taskSubject: "Call vendor", assignedByName: "Priya", isReassignment: true },
      }),
    );
    expect(screen.getByText("reassigned a task to you")).toBeInTheDocument();
  });

  it("task_completed → actor + 'completed your task', no priority/due secondary", () => {
    renderItem(
      row({
        title: "Task completed",
        metadata: { type: "task_completed", taskSubject: "Send proposal", completedByName: "Sam", priority: "High" },
      }),
    );
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("completed your task")).toBeInTheDocument();
    expect(screen.getByText("Send proposal")).toBeInTheDocument();
    // task_completed deliberately has no secondary line (the primary says it all).
    expect(screen.queryByText(/High priority/i)).toBeNull();
  });

  it("task_due_today → no actor, 'Task due today' + subject (system event)", () => {
    renderItem(
      row({
        metadata: { type: "task_due_today", taskSubject: "Quarterly review", priority: "Medium" },
      }),
    );
    expect(screen.getByText("Task due today")).toBeInTheDocument();
    expect(screen.getByText("Quarterly review")).toBeInTheDocument();
    expect(screen.getByText(/Medium priority/i)).toBeInTheDocument();
  });

  it("task_overdue → 'Task overdue'", () => {
    renderItem(row({ metadata: { type: "task_overdue", taskSubject: "Renew contract" } }));
    expect(screen.getByText("Task overdue")).toBeInTheDocument();
    expect(screen.getByText("Renew contract")).toBeInTheDocument();
  });

  it("lead_assigned → actor + 'assigned you a lead' + lead name", () => {
    renderItem(
      row({
        link: "/leads/abc",
        metadata: { type: "lead_assigned", leadName: "Globex", assignedByName: "Dana" },
      }),
    );
    expect(screen.getByText("Dana")).toBeInTheDocument();
    expect(screen.getByText("assigned you a lead")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("lead_stage_changed → 'moved a lead' + 'from → to' secondary", () => {
    renderItem(
      row({
        metadata: { type: "lead_stage_changed", leadName: "Initech", actorName: "Ravi", fromStage: "Contacted", toStage: "Qualified" },
      }),
    );
    expect(screen.getByText("moved a lead")).toBeInTheDocument();
    expect(screen.getByText(/Contacted → Qualified/)).toBeInTheDocument();
  });

  it("lead_converted → 'converted a lead'", () => {
    renderItem(row({ metadata: { type: "lead_converted", leadName: "Stark Inc", convertedByName: "Meera" } }));
    expect(screen.getByText("converted a lead")).toBeInTheDocument();
    expect(screen.getByText("Stark Inc")).toBeInTheDocument();
  });

  it("unknown type → falls back to title + body", () => {
    renderItem(
      row({
        title: "Opportunity won",
        body: "Acme deal closed for ₹2L",
        metadata: { type: "opportunity_won" },
      }),
    );
    expect(screen.getByText("Opportunity won")).toBeInTheDocument();
    expect(screen.getByText("Acme deal closed for ₹2L")).toBeInTheDocument();
  });

  it("null metadata → falls back to title without crashing", () => {
    renderItem(row({ title: "Something happened", metadata: null }));
    expect(screen.getByText("Something happened")).toBeInTheDocument();
  });
});

describe("NotificationItem — interaction", () => {
  it("clicking the row marks read (if unread) and navigates to the deep link", () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    renderItem(
      row({ link: "/tasks", metadata: { type: "task_assigned", taskSubject: "X", assignedByName: "A" } }),
      { onMarkRead, onClose },
    );
    fireEvent.click(screen.getByText("assigned you a task"));
    expect(onMarkRead).toHaveBeenCalledWith("n1");
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/tasks");
  });

  it("the hover 'Mark read' control marks read WITHOUT navigating", () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    renderItem(
      row({ link: "/tasks", metadata: { type: "task_assigned", taskSubject: "X", assignedByName: "A" } }),
      { onMarkRead, onClose },
    );
    fireEvent.click(screen.getByLabelText("Mark as read"));
    expect(onMarkRead).toHaveBeenCalledWith("n1");
    // stopPropagation → no navigation, panel stays open.
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a read notification shows no 'Mark read' control", () => {
    renderItem(
      row({
        readAt: new Date().toISOString(),
        metadata: { type: "task_assigned", taskSubject: "X", assignedByName: "A" },
      }),
    );
    expect(screen.queryByLabelText("Mark as read")).toBeNull();
  });

  it("keyboard Enter activates the row", () => {
    const onClose = vi.fn();
    renderItem(
      row({ link: "/leads/x", metadata: { type: "lead_assigned", leadName: "L", assignedByName: "A" } }),
      { onClose },
    );
    fireEvent.keyDown(screen.getByText("assigned you a lead"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/leads/x");
  });
});
