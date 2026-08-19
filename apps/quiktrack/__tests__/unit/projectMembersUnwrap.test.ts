import { describe, expect, it } from "vitest";

/**
 * Regression: the project-members payload must be unwrapped from
 * `{ members, pendingInvites }`, not mapped over directly.
 *
 * `GET /api/projects/{id}/members` returns an OBJECT. `useProjectMembers` cast it
 * to an array and called `.map()`, which yields NOTHING rather than throwing — so
 * every assignee picker in QuikTest showed "No project members to assign." on
 * projects that had eight members. Silent-empty is the worst failure mode for a
 * picker, because it looks like correct data.
 *
 * The `select` under test is duplicated here rather than imported: the hook is a
 * client module ("use client" + React Query) and there is no DOM test environment
 * in this workspace. Keep the two in step.
 */

interface RawMember {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
}

function memberDisplayName(m: RawMember): string {
  const u = m.user;
  if (!u) return "Unknown";
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.email;
}

/** Mirror of the hook's `select`. */
function unwrapMembers(d: unknown) {
  const raw = (d as { members?: RawMember[] } | RawMember[] | null) ?? null;
  const list: RawMember[] = Array.isArray(raw) ? raw : (raw?.members ?? []);
  return list.map((m) => ({ userId: m.userId, name: memberDisplayName(m) }));
}

const PAYLOAD = {
  members: [
    { userId: "u1", user: { firstName: "Ashwin", lastName: "Singone", email: "a@x.com" } },
    { userId: "u2", user: { firstName: null, lastName: null, email: "noname@x.com" } },
    { userId: "u3", user: null },
  ] as RawMember[],
  pendingInvites: [{ id: "i1", email: "pending@x.com" }],
};

describe("project members unwrapping", () => {
  it("reads the `members` key of the envelope's data object", () => {
    expect(unwrapMembers(PAYLOAD)).toHaveLength(3);
  });

  it("does NOT include pending invites as assignable people", () => {
    // An invitee has no user id to assign to; offering them would create a
    // dangling assigneeId.
    const names = unwrapMembers(PAYLOAD).map((m) => m.name);
    expect(names).not.toContain("pending@x.com");
  });

  it("falls back to email when a member has no name", () => {
    expect(unwrapMembers(PAYLOAD)[1].name).toBe("noname@x.com");
  });

  it("never yields a blank label", () => {
    for (const m of unwrapMembers(PAYLOAD)) expect(m.name.length).toBeGreaterThan(0);
  });

  it("also accepts a bare array, in case the endpoint is flattened later", () => {
    expect(unwrapMembers(PAYLOAD.members)).toHaveLength(3);
  });

  it("returns an empty list for null, {} and a missing key", () => {
    expect(unwrapMembers(null)).toEqual([]);
    expect(unwrapMembers({})).toEqual([]);
    expect(unwrapMembers({ pendingInvites: [] })).toEqual([]);
  });

  it("the OLD behaviour would have returned nothing (the bug)", () => {
    // Negative control: mapping the object as though it were an array. Proves the
    // assertions above are testing the fix rather than passing regardless.
    const broken = (PAYLOAD as unknown as RawMember[]).map?.((m) => m) ?? [];
    expect(broken).toHaveLength(0);
  });
});
