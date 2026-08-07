import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@quikit/database";

const createCrmLead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));
vi.mock("@/lib/services/leads/create-record", () => ({
  createCrmLead,
}));

import { prisma } from "@/lib/db/prisma";
import { upsertImportedLeadRow } from "@/lib/services/import/lead-import-row";

const db = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

describe("upsertImportedLeadRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.qcfLead.findUnique.mockResolvedValue(null);
    createCrmLead.mockResolvedValue({
      id: "lead-1",
      orgId: "t1",
      source: "Web",
      createdAt: new Date(),
    });
  });

  it("creates via createCrmLead with csv_import channel on new row", async () => {
    const res = await upsertImportedLeadRow(
      { orgId: "t1", name: "Import Lead", source: "Web" },
      { channel: "csv_import", fileName: "batch.csv", userId: "u1" },
    );
    expect(res.action).toBe("created");

    expect(createCrmLead).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Import Lead", orgId: "t1" }),
      expect.objectContaining({
        creation: expect.objectContaining({
          channel: "csv_import",
          userId: "u1",
        }),
      }),
    );
  });

  it("writes dynamicFields and extra standard columns onto the created lead", async () => {
    await upsertImportedLeadRow(
      {
        orgId: "t1",
        name: "Dyn Lead",
        standardExtra: { industry: "SaaS", stage: "Qualified" },
        dynamicFields: { budget: 5000, interests: ["X", "Y"] },
      },
      { channel: "csv_import", userId: "u1" },
    );

    const row = createCrmLead.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.industry).toBe("SaaS");
    expect(row.stage).toBe("Qualified");
    expect(row.dynamicFields).toEqual({ budget: 5000, interests: ["X", "Y"] });
  });

  it("omits dynamicFields entirely when there are no custom values", async () => {
    await upsertImportedLeadRow(
      { orgId: "t1", name: "No Dyn", dynamicFields: {} },
      { channel: "csv_import", userId: "u1" },
    );
    const row = createCrmLead.mock.calls[0]![0] as Record<string, unknown>;
    expect("dynamicFields" in row).toBe(false);
  });
});
