import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const _db = mockDb();
void _db;

describe("GET /api/reports/canned", () => {
  beforeEach(() => {
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/reports/canned/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the 15 canned report summaries on the happy path", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@x.co", name: "A" });

    const { GET } = await import("@/app/api/reports/canned/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(15);
    const categories = new Set(body.data.items.map((i: { category: string }) => i.category));
    expect(categories).toEqual(
      new Set(["Pipeline", "Leads", "Activities", "Telephony", "Team"]),
    );
    // Each summary has the spec'd shape
    for (const item of body.data.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("blurb");
      expect(item).toHaveProperty("defaultDateRange");
    }
  });
});
