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
    db.crmLead.findUnique.mockResolvedValue(null);
    createCrmLead.mockResolvedValue({
      id: "lead-1",
      tenantId: "t1",
      source: "Web",
      createdAt: new Date(),
    });
  });

  it("creates via createCrmLead with csv_import channel on new row", async () => {
    await upsertImportedLeadRow(
      { tenantId: "t1", name: "Import Lead", source: "Web" },
      { channel: "csv_import", fileName: "batch.csv", userId: "u1" },
    );

    expect(createCrmLead).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Import Lead", tenantId: "t1" }),
      expect.objectContaining({
        creation: expect.objectContaining({
          channel: "csv_import",
          userId: "u1",
        }),
      }),
    );
  });
});
