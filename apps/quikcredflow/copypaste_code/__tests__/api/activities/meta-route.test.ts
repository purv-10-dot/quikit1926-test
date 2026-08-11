import { describe, expect, it, beforeEach } from "vitest";
import { setSession } from "../../helpers/mockDb";

describe("Activities meta endpoints", () => {
  beforeEach(() => setSession(null));

  it("GET /api/activities/meta/lead-log returns activityCodes and outcomes", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@b.co", name: "A" });
    const { GET } = await import("@/app/api/activities/meta/lead-log/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.activityCodes)).toBe(true);
    expect(Array.isArray(body.data.outcomes)).toBe(true);
    expect(body.data.activityCodes.length).toBeGreaterThan(0);
  });

  it("GET /api/activities/smb-outreach/meta returns the disposition tree", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@b.co", name: "A" });
    const { GET } = await import("@/app/api/activities/smb-outreach/meta/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.dispositions[0]).toHaveProperty("value");
    expect(body.data.dispositions[0]).toHaveProperty("sub");
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/activities/meta/lead-log/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
