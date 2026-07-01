import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { POST } from "@/app/api/cron/purge-trashed-projects/route";

const SECRET = "test-cron-secret";

function req(token?: string) {
  return new NextRequest("http://localhost/api/cron/purge-trashed-projects", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  resetMockDb();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cron/purge-trashed-projects", () => {
  it("503 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(req(SECRET));
    expect(res.status).toBe(503);
  });

  it("401 when the bearer token is missing or wrong", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("nope"))).status).toBe(401);
  });

  it("hard-deletes projects trashed beyond the retention window", async () => {
    mockDb.qtProject.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ] as never);
    mockDb.qtProject.delete.mockResolvedValue({ id: "x" } as never);

    const res = await POST(req(SECRET));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.purged).toBe(2);

    // Only soft-deleted, old-enough projects are targeted.
    const where = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: { isDeleted: boolean; updatedAt: { lt: Date } };
    };
    expect(where.where.isDeleted).toBe(true);
    expect(where.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(mockDb.qtProject.delete).toHaveBeenCalledTimes(2);
  });

  it("isolates a failed delete without aborting the sweep", async () => {
    mockDb.qtProject.findMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ] as never);
    mockDb.qtProject.delete
      .mockRejectedValueOnce(new Error("fk") as never)
      .mockResolvedValueOnce({ id: "p2" } as never);

    const res = await POST(req(SECRET));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.purged).toBe(1);
    expect(body.failed).toBe(1);
  });
});
