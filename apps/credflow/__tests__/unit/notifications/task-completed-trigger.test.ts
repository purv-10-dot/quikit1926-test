import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotification } from "@/lib/notifications/service";
import { notifyTaskCompleted } from "@/lib/notifications/task-triggers";

/**
 * notifyTaskCompleted notifies the task CREATOR/assigner (not the assignee)
 * when a different user marks the task complete.
 */
vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn() }));

const mockCreate = vi.mocked(createNotification);

describe("notifyTaskCompleted — recipient is the creator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies the creator when a different user completes the task", async () => {
    await notifyTaskCompleted({
      tenantId: "t1",
      taskId: "task-1",
      taskSubject: "Call Acme",
      completedByUserId: "u-other",
      completedByName: "Other User",
      taskCreatorUserId: "u-creator",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.userId).toBe("u-creator");
    expect(payload.metadata?.type).toBe("task_completed");
  });

  it("is suppressed when the creator completes their own task", async () => {
    await notifyTaskCompleted({
      tenantId: "t1",
      taskId: "task-1",
      taskSubject: "Call Acme",
      completedByUserId: "u-creator",
      completedByName: "Creator User",
      taskCreatorUserId: "u-creator",
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("is suppressed when taskCreatorUserId is null/undefined", async () => {
    await notifyTaskCompleted({
      tenantId: "t1",
      taskId: "task-1",
      taskSubject: "Call Acme",
      completedByUserId: "u-other",
      completedByName: "Other User",
      taskCreatorUserId: null,
    });
    await notifyTaskCompleted({
      tenantId: "t1",
      taskId: "task-1",
      taskSubject: "Call Acme",
      completedByUserId: "u-other",
      completedByName: "Other User",
      taskCreatorUserId: undefined,
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
