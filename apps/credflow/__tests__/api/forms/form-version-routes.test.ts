/**
 * FR-RE Unit 7 — version route GATING (not exhaustive). The clone/publish logic
 * is covered by form-version.integration.test.ts; here we only prove the two
 * endpoints are not ungated: unauthenticated => 401, and assertModule is wired.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

mockDb();

function req() {
  return new Request("http://test/api/forms", { method: "POST" }) as unknown as import("next/server").NextRequest;
}
const versionParams = { params: Promise.resolve({ versionId: "ver_1" }) };

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
});

describe("version routes — unauthenticated => 401", () => {
  it("POST /versions/[versionId]/clone", async () => {
    const { POST } = await import("@/app/api/forms/versions/[versionId]/clone/route");
    expect((await POST(req(), versionParams)).status).toBe(401);
  });
  it("POST /versions/[versionId]/publish", async () => {
    const { POST } = await import("@/app/api/forms/versions/[versionId]/publish/route");
    expect((await POST(req(), versionParams)).status).toBe(401);
  });
});

describe("version routes — assertModule gate is wired (denied => 403)", () => {
  it("POST /versions/[versionId]/publish calls assertModule and surfaces 403", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser", email: "u@b.co", name: "U" });
    vi.mocked(assertModule).mockRejectedValue(Object.assign(new Error("Forbidden"), { statusCode: 403 }));
    const { POST } = await import("@/app/api/forms/versions/[versionId]/publish/route");
    const res = await POST(req(), versionParams);
    expect(assertModule).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), "settings", "edit");
    expect(res.status).toBe(403);
  });
});
