/**
 * Stage B — updateTask stamps completedAt on the status transition (RED→GREEN).
 *
 * updateTask is the SOLE status→Completed write path (grep-confirmed: snoozeTask
 * sets only dueDate; lead-convert updateMany sets only relatedKind/Id; all creates
 * are status:Open). So stamping here covers 100% of completions.
 *
 * Rule (locked 2026-06-25), keyed on existing.status vs patch.status:
 *   - Open/InProgress → Completed : completedAt = now() (a Date)
 *   - already Completed, edited    : completedAt ABSENT from update data (no re-stamp)
 *   - Completed → non-Completed    : completedAt = null (clear on un-complete)
 *   - non-status / non-completing  : completedAt ABSENT (untouched)
 *
 * Asserts the `data` payload passed to prisma.crmTask.update — absent vs null vs
 * Date is the precise contract (absent = leave untouched; null = clear).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { updateTask } from "@/lib/services/tasks/index";

const USER = { userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" } as never;

function existingTask(status: string) {
  (prismaMock.crmTask.findFirst as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    id: "task1", orgId: "t1", status, subject: "x", assignedToUserId: "u1",
    leadId: null, relatedKind: null, relatedObjectId: null, priority: "Medium", dueDate: null,
  });
}
function lastUpdateData(): Record<string, unknown> {
  const calls = (prismaMock.crmTask.update as unknown as { mock: { calls: { 0: { data: Record<string, unknown> } }[] } }).mock.calls;
  return calls[calls.length - 1]![0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.crmTask.update as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    id: "task1", orgId: "t1", status: "Completed", subject: "x", assignedToUserId: "u1", dueDate: null, priority: "Medium",
  });
  // Post-update audit side-effects (writeStatusChangeActivity/writeReassignmentActivity
  // → crmActivity.create) must not throw on the mock or mask the data assertion.
  (prismaMock.crmActivity.create as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ id: "act1" });
});

describe("updateTask — completedAt stamping (Stage B)", () => {
  it("Open → Completed: stamps completedAt to a Date (now)", async () => {
    existingTask("Open");
    await updateTask(USER, "task1", { status: "Completed" });
    expect(lastUpdateData().completedAt).toBeInstanceOf(Date);
  });

  it("InProgress → Completed: stamps completedAt", async () => {
    existingTask("InProgress");
    await updateTask(USER, "task1", { status: "Completed" });
    expect(lastUpdateData().completedAt).toBeInstanceOf(Date);
  });

  it("already Completed, edited (status still Completed): does NOT re-stamp (completedAt ABSENT)", async () => {
    existingTask("Completed");
    await updateTask(USER, "task1", { status: "Completed", subject: "renamed" });
    expect(lastUpdateData()).not.toHaveProperty("completedAt");
  });

  it("Completed → Open (un-complete): clears completedAt to null", async () => {
    existingTask("Completed");
    await updateTask(USER, "task1", { status: "Open" });
    expect(lastUpdateData().completedAt).toBeNull();
  });

  it("Completed → Cancelled (also un-complete): clears completedAt to null", async () => {
    existingTask("Completed");
    await updateTask(USER, "task1", { status: "Cancelled" });
    expect(lastUpdateData().completedAt).toBeNull();
  });

  it("non-status edit (no status in patch): never touches completedAt (ABSENT)", async () => {
    existingTask("Open");
    await updateTask(USER, "task1", { subject: "renamed" });
    expect(lastUpdateData()).not.toHaveProperty("completedAt");
  });

  it("Open → InProgress (status change, neither side Completed): completedAt ABSENT", async () => {
    existingTask("Open");
    await updateTask(USER, "task1", { status: "InProgress" });
    expect(lastUpdateData()).not.toHaveProperty("completedAt");
  });
});
