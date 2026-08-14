import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the admin guard so we control the auth outcome per test.
const requireAdmin = vi.fn();
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: () => requireAdmin() }));

// Mock the service so no DB is touched; assert org-scoping via its args.
const disconnectInstallation = vi.fn();
const listInstallations = vi.fn();
vi.mock("@/lib/services/github/installation-service", () => ({
  disconnectInstallation: (...a: unknown[]) => disconnectInstallation(...a),
  listInstallations: (...a: unknown[]) => listInstallations(...a),
}));
vi.mock("@/lib/services/github/config", () => ({ isGithubAppConfigured: () => true }));

import { DELETE } from "@/app/api/integrations/github/connections/route";

const ORG = "org_1";
const INSTALL = "inst_1";

function del(qs: string) {
  return DELETE(
    new NextRequest(`http://localhost/api/integrations/github/connections${qs}`, {
      method: "DELETE",
    }),
  );
}

beforeEach(() => {
  requireAdmin.mockReset();
  disconnectInstallation.mockReset();
});

describe("DELETE /api/integrations/github/connections", () => {
  it("returns the guard's error response when not an admin", async () => {
    const errResp = new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403 });
    requireAdmin.mockResolvedValue({ error: errResp });
    const res = await del(`?installationId=${INSTALL}`);
    expect(res.status).toBe(403);
    expect(disconnectInstallation).not.toHaveBeenCalled();
  });

  it("400 when installationId is missing", async () => {
    requireAdmin.mockResolvedValue({ orgId: ORG, userId: "u1" });
    const res = await del("");
    expect(res.status).toBe(400);
    expect(disconnectInstallation).not.toHaveBeenCalled();
  });

  it("404 when the connection is not in the caller's org", async () => {
    requireAdmin.mockResolvedValue({ orgId: ORG, userId: "u1" });
    disconnectInstallation.mockResolvedValue({ removed: false });
    const res = await del(`?installationId=${INSTALL}`);
    expect(res.status).toBe(404);
    // Must be scoped by the caller's org.
    expect(disconnectInstallation).toHaveBeenCalledWith(ORG, INSTALL);
  });

  it("disconnects when the connection exists (happy path)", async () => {
    requireAdmin.mockResolvedValue({ orgId: ORG, userId: "u1" });
    disconnectInstallation.mockResolvedValue({ removed: true });
    const res = await del(`?installationId=${INSTALL}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(disconnectInstallation).toHaveBeenCalledWith(ORG, INSTALL);
  });
});
