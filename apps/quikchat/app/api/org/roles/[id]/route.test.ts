import { describe, it, expect, beforeEach, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../../../../__tests__/helpers/mockDb";

vi.mock("@/lib/authz/requireAdmin", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/authz/permissions", () => ({
  getQuikChatAppId: vi.fn(async () => "app-qc"),
}));
// assertRoleDeletable → deletable with a known member count; never lock out.
vi.mock("@/lib/authz/preventAdminLockout", () => ({
  assertRoleDeletable: vi.fn(async () => ({ memberCount: 2 })),
  AdminLockoutError: class AdminLockoutError extends Error {},
}));

import { requireAdmin } from "@/lib/authz/requireAdmin";
import type { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";

const ORG = "org-1";
const gate = requireAdmin as unknown as ReturnType<typeof vi.fn>;

function patch(body: unknown): NextRequest {
  return new Request("http://test.local/api/org/roles/r1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetMockDb();
  gate.mockResolvedValue({ orgId: ORG, userId: "actor-1" });
});

describe("PATCH /api/org/roles/[id] — re-mirror on rename", () => {
  beforeEach(() => {
    mockDb.qcAppRole.findFirst.mockResolvedValue({
      id: "r1",
      isSystem: false,
      name: "Old",
      appId: "app-qc",
    } as never);
    mockDb.qcAppRole.findUnique.mockResolvedValue(null as never); // no name clash
    mockDb.qcAppRole.update.mockResolvedValue({
      id: "r1",
      name: "New",
      description: null,
      isSystem: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  it("re-mirrors the new name onto every current member", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ] as never);

    const res = (await PATCH(patch({ name: "New" }), { params: { id: "r1" } }))!;
    expect(res.status).toBe(200);

    const calls = mockDb.userAppAccess.updateMany.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual({
      where: { orgId: ORG, userId: "u1", appId: "app-qc" },
      data: { role: "New" },
    });
    expect(calls).toContainEqual({
      where: { orgId: ORG, userId: "u2", appId: "app-qc" },
      data: { role: "New" },
    });
  });

  it("does NOT re-mirror when the name is unchanged (description-only edit)", async () => {
    const res = (await PATCH(patch({ description: "tweak" }), { params: { id: "r1" } }))!;
    expect(res.status).toBe(200);
    expect(mockDb.userAppAccess.updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/org/roles/[id] — re-mirror affected members", () => {
  it("mirrors each affected member's fallback role after delete", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ] as never);
    mockDb.qcAppRole.delete.mockResolvedValue({ id: "r1" } as never);
    // u1 is an org_admin → fallback "admin"; u2 a plain member → "Member".
    mockDb.orgMember.findMany.mockResolvedValue([
      { userId: "u1", role: "org_admin" },
      { userId: "u2", role: "member" },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", isSuperAdmin: false },
      { id: "u2", isSuperAdmin: false },
    ] as never);

    const res = (await DELETE(
      new Request("http://test.local/api/org/roles/r1", { method: "DELETE" }) as unknown as NextRequest,
      { params: { id: "r1" } },
    ))!;
    expect(res.status).toBe(200);

    const calls = mockDb.userAppAccess.updateMany.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual({
      where: { orgId: ORG, userId: "u1", appId: "app-qc" },
      data: { role: "admin" },
    });
    expect(calls).toContainEqual({
      where: { orgId: ORG, userId: "u2", appId: "app-qc" },
      data: { role: "Member" },
    });
  });
});
