import { describe, it, expect, beforeEach, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../../../../../__tests__/helpers/mockDb";

// Bypass the admin gate — enforcement is out of scope for the mirror tests.
vi.mock("@/lib/authz/requireAdmin", () => ({
  requireAdmin: vi.fn(),
}));
// getQuikChatAppId → fixed app id.
vi.mock("@/lib/authz/permissions", () => ({
  getQuikChatAppId: vi.fn(async () => "app-qc"),
}));
// Never trip the admin-lockout guard in these tests.
vi.mock("@/lib/authz/preventAdminLockout", () => ({
  assertReconcileLeavesAdminPopulated: vi.fn(async () => undefined),
  AdminLockoutError: class AdminLockoutError extends Error {},
}));

import { requireAdmin } from "@/lib/authz/requireAdmin";
import type { NextRequest } from "next/server";
import { PUT } from "./route";

const ORG = "org-1";
const ACTOR = "actor-1";
const gate = requireAdmin as unknown as ReturnType<typeof vi.fn>;

function put(userIds: string[]): NextRequest {
  return new Request("http://test.local/api/org/roles/r-mod/members", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIds }),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetMockDb();
  gate.mockResolvedValue({ orgId: ORG, userId: ACTOR });
  mockDb.qcAppRole.findFirst.mockResolvedValue({
    id: "r-mod",
    appId: "app-qc",
    name: "Moderator",
  } as never);
  // Run the transaction callback inline against the same mock surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDb.$transaction.mockImplementation((cb: any) => cb(mockDb));
});

describe("PUT /api/org/roles/[id]/members — central-role mirror", () => {
  it("mirrors this role's name for attached users and the fallback for detached", async () => {
    // Current membership: u_keep + u_detach. Desired: u_keep + u_attach.
    mockDb.qcUserAppRole.findMany
      .mockResolvedValueOnce([{ userId: "u_keep" }, { userId: "u_detach" }] as never) // currentMembers
      .mockResolvedValueOnce([{ userId: "u_keep" }] as never); // existing (of eligible)
    // Both desired users have a QuikChat access row → eligible.
    mockDb.userAppAccess.findMany.mockResolvedValue([
      { userId: "u_keep" },
      { userId: "u_attach" },
    ] as never);
    mockDb.qcUserAppRole.deleteMany.mockResolvedValue({ count: 1 } as never);
    mockDb.qcUserAppRole.create.mockResolvedValue({ id: "uar-new" } as never);
    // fallback for the detached user → plain member → "Member".
    mockDb.orgMember.findMany.mockResolvedValue([{ userId: "u_detach", role: "member" }] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "u_detach", isSuperAdmin: false }] as never);

    const res = (await PUT(put(["u_keep", "u_attach"]), { params: { id: "r-mod" } }))!;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { attached: number; detached: number } };
    expect(body.data.attached).toBe(1);
    expect(body.data.detached).toBe(1);

    const calls = mockDb.userAppAccess.updateMany.mock.calls.map((c) => c[0]);
    // Attached user → mirrors THIS role's name.
    expect(calls).toContainEqual({
      where: { orgId: ORG, userId: "u_attach", appId: "app-qc" },
      data: { role: "Moderator" },
    });
    // Detached user → mirrors the fallback (default "Member").
    expect(calls).toContainEqual({
      where: { orgId: ORG, userId: "u_detach", appId: "app-qc" },
      data: { role: "Member" },
    });
  });

  it("mirrors 'admin' as the fallback for a detached org_admin", async () => {
    mockDb.qcUserAppRole.findMany
      .mockResolvedValueOnce([{ userId: "boss" }] as never) // currentMembers
      .mockResolvedValueOnce([] as never); // existing
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never); // desired empty → all detached
    mockDb.qcUserAppRole.deleteMany.mockResolvedValue({ count: 1 } as never);
    mockDb.orgMember.findMany.mockResolvedValue([{ userId: "boss", role: "org_admin" }] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "boss", isSuperAdmin: false }] as never);

    const res = (await PUT(put([]), { params: { id: "r-mod" } }))!;
    expect(res.status).toBe(200);
    expect(mockDb.userAppAccess.updateMany).toHaveBeenCalledWith({
      where: { orgId: ORG, userId: "boss", appId: "app-qc" },
      data: { role: "admin" },
    });
  });

  it("still succeeds (200) when the mirror throws — best-effort/non-fatal", async () => {
    mockDb.qcUserAppRole.findMany
      .mockResolvedValueOnce([] as never) // currentMembers
      .mockResolvedValueOnce([] as never); // existing
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u_attach" }] as never);
    mockDb.qcUserAppRole.deleteMany.mockResolvedValue({ count: 0 } as never);
    mockDb.qcUserAppRole.create.mockResolvedValue({ id: "uar-new" } as never);
    // The mirror step blows up — the reconcile must not fail.
    mockDb.userAppAccess.updateMany.mockRejectedValue(new Error("mirror down") as never);

    const res = (await PUT(put(["u_attach"]), { params: { id: "r-mod" } }))!;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { attached: number } };
    expect(body.data.attached).toBe(1);
  });
});
