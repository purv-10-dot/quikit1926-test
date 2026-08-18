import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { createNotification } from "@/lib/notifications/service";
import {
  runEveningTaskNotifications,
  runMorningTaskNotifications,
} from "@/lib/notifications/task-cron";

/**
 * The morning + evening sweeps dedupe via Prisma JSON path filtering on
 * QceNotification.metadata (prisma.qceNotification.count). count === 0 means
 * "not yet sent" → notify; count > 0 means "already sent" → skip.
 */
vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn() }));

const db = mockDb();
const mockCreate = vi.mocked(createNotification);

function dueTodayTask() {
  return {
    id: "task-today",
    orgId: "t1",
    subject: "Call Acme",
    priority: "High",
    dueDate: new Date(),
    assignedToUserId: "u-assignee",
  };
}

function overdueTask() {
  return {
    id: "task-overdue",
    orgId: "t1",
    subject: "Overdue follow-up",
    priority: "High",
    dueDate: new Date(Date.now() - 86_400_000),
    assignedToUserId: "u-assignee",
  };
}

describe("task-cron dedupe — morning sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies due-today task when no prior notification exists (count=0)", async () => {
    // findMany is called twice (due-today, due-tomorrow) via Promise.all.
    db.qceTask.findMany.mockResolvedValueOnce([dueTodayTask()] as never);
    db.qceTask.findMany.mockResolvedValueOnce([] as never);
    db.qceNotification.count.mockResolvedValue(0 as never);

    const result = await runMorningTaskNotifications();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].metadata?.type).toBe("task_due_today");
    expect(result.dueTodayCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });

  it("skips due-today task when a notification already exists (count=1)", async () => {
    db.qceTask.findMany.mockResolvedValueOnce([dueTodayTask()] as never);
    db.qceTask.findMany.mockResolvedValueOnce([] as never);
    db.qceNotification.count.mockResolvedValue(1 as never);

    const result = await runMorningTaskNotifications();

    expect(mockCreate).not.toHaveBeenCalled();
    // dueTodayCount stays the count of tasks FOUND, not sent.
    expect(result.dueTodayCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });
});

describe("task-cron dedupe — evening sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies overdue task when not previously sent (count=0)", async () => {
    db.qceTask.findMany.mockResolvedValue([overdueTask()] as never);
    db.qceNotification.count.mockResolvedValue(0 as never);

    const result = await runEveningTaskNotifications();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].metadata?.type).toBe("task_overdue");
    expect(result.overdueNotified).toBe(1);
    expect(result.overdueSkipped).toBe(0);
  });

  it("skips overdue task when already sent (count=1)", async () => {
    db.qceTask.findMany.mockResolvedValue([overdueTask()] as never);
    db.qceNotification.count.mockResolvedValue(1 as never);

    const result = await runEveningTaskNotifications();

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.overdueNotified).toBe(0);
    expect(result.overdueSkipped).toBe(1);
  });
});
