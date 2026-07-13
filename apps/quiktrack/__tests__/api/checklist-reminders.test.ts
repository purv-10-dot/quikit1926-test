import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { materializeDueChecklistReminders } from "@/lib/checklist/queries";

const USER = "user_1";
const TENANT = "tenant_1";

beforeEach(() => {
  resetMockDb();
});

describe("materializeDueChecklistReminders", () => {
  it("creates one notification per due item it wins the claim for", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { id: "chk_1", name: "Draft report" },
      { id: "chk_2", name: "Email client" },
    ] as never);
    mockDb.$executeRaw.mockResolvedValue(1 as never); // claim succeeds
    mockDb.qtNotification.create.mockResolvedValue({ id: "n" } as never);

    const fired = await materializeDueChecklistReminders(TENANT, USER);

    expect(fired).toBe(2);
    expect(mockDb.qtNotification.create).toHaveBeenCalledTimes(2);
    const arg = mockDb.qtNotification.create.mock.calls[0]?.[0] as {
      data: { recipientId: string; type: string; orgId: string };
    };
    expect(arg.data.recipientId).toBe(USER);
    expect(arg.data.orgId).toBe(TENANT);
    expect(arg.data.type).toBe("checklist_due");
  });

  it("skips items already claimed by a concurrent poll (claim returns 0)", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "chk_1", name: "Draft report" }] as never);
    mockDb.$executeRaw.mockResolvedValue(0 as never); // lost the claim
    mockDb.qtNotification.create.mockResolvedValue({ id: "n" } as never);

    const fired = await materializeDueChecklistReminders(TENANT, USER);

    expect(fired).toBe(0);
    expect(mockDb.qtNotification.create).not.toHaveBeenCalled();
  });

  it("does nothing when no items are due", async () => {
    mockDb.$queryRaw.mockResolvedValue([] as never);
    const fired = await materializeDueChecklistReminders(TENANT, USER);
    expect(fired).toBe(0);
    expect(mockDb.qtNotification.create).not.toHaveBeenCalled();
  });
});
