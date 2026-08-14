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

function del(): NextRequest {
  return new Request("http://test.local/api/org/roles/r1", {
    method: "DELETE",
  }) as unknown as NextRequest;
}

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

/**
 * The one-default invariant, defended at the route rather than repaired after.
 *
 * Zero defaults is not a neutral state: the Admin Portal's invite modal falls
 * back to `data[0]` ordered `isSystem DESC` — the `admin` role — so an org with
 * no default silently preselects ADMIN for every newly invited user.
 * `convergeDefaultRole` does repair it, but only on the next seed pass, up to
 * the 5-minute cache TTL later. These two routes are how the state gets created
 * in the first place.
 */
describe("one-default invariant", () => {
  const roleRow = {
    id: "r1",
    isSystem: false,
    name: "Member",
    appId: "app-qc",
  };

  it("PATCH 409s when clearing the only default", async () => {
    mockDb.qcAppRole.findFirst.mockResolvedValue(roleRow as never);
    mockDb.qcAppRole.count.mockResolvedValue(0 as never); // no OTHER default exists

    const res = (await PATCH(patch({ isDefault: false }), { params: { id: "r1" } }))!;

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/only default role/i);
    expect(mockDb.qcAppRole.update).not.toHaveBeenCalled();
  });

  it("PATCH allows clearing a default when another one remains", async () => {
    mockDb.qcAppRole.findFirst.mockResolvedValue(roleRow as never);
    mockDb.qcAppRole.count.mockResolvedValue(1 as never); // another default exists
    mockDb.qcAppRole.update.mockResolvedValue({
      id: "r1",
      name: "Member",
      description: null,
      isSystem: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const res = (await PATCH(patch({ isDefault: false }), { params: { id: "r1" } }))!;

    expect(res.status).toBe(200);
    expect(mockDb.qcAppRole.update).toHaveBeenCalled();
  });

  it("PATCH does not run the last-default check when setting a default", async () => {
    mockDb.qcAppRole.findFirst.mockResolvedValue(roleRow as never);
    mockDb.qcAppRole.findUnique.mockResolvedValue(null as never);
    mockDb.qcAppRole.updateMany.mockResolvedValue({ count: 1 } as never);
    mockDb.qcAppRole.update.mockResolvedValue({
      id: "r1",
      name: "Member",
      description: null,
      isSystem: false,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const res = (await PATCH(patch({ isDefault: true }), { params: { id: "r1" } }))!;

    expect(res.status).toBe(200);
    // Promoting demotes the others; it never counts them.
    expect(mockDb.qcAppRole.count).not.toHaveBeenCalled();
    expect(mockDb.qcAppRole.updateMany).toHaveBeenCalled();
  });

  // The path the brief did not mention: assertRoleDeletable guards isSystem and
  // admin-lockout, and has never looked at isDefault — so deleting the default
  // role reached the same zero-defaults state as the PATCH hole.
  it("DELETE 409s when the target role is the default", async () => {
    mockDb.qcAppRole.findFirst.mockResolvedValue({ isDefault: true } as never);

    const res = (await DELETE(del(), { params: { id: "r1" } }))!;

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/default role/i);
    expect(mockDb.qcAppRole.delete).not.toHaveBeenCalled();
  });

  it("DELETE proceeds for a non-default role", async () => {
    mockDb.qcAppRole.findFirst.mockResolvedValue({ isDefault: false } as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.qcAppRole.delete.mockResolvedValue({ id: "r1" } as never);

    const res = (await DELETE(del(), { params: { id: "r1" } }))!;

    expect(res.status).toBe(200);
    expect(mockDb.qcAppRole.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
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
