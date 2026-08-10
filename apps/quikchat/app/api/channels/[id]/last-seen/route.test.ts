// GET /api/channels/[id]/last-seen — membership gate, DM-only guard, peer
// resolution and response shape.
//
// Deliberately mock-backed rather than DB-backed: every DB-backed route test in
// this app is excluded from Vitest (see vitest.config.ts — "pending re-home to
// Playwright"), so a DB-backed suite here would never actually run. The privacy
// matrix itself (mutual opt-out / appear_offline / no-Redis-call short-circuits)
// is covered against mocked Prisma in lib/server/presence.service.test.ts, which
// is where that logic lives.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb, resetMockDb } from "../../../../../__tests__/helpers/mockDb";
import { HttpError } from "@/lib/errors";

const ORG = "org-1";
const ME = "u1";
const PEER = "u2";
const CHANNEL = "c1";

// Unwrap withOrgAuth (the real one adds auth/rate-limit/module gating) but keep
// its HttpError → status mapping, which is what the 403/400 assertions rely on.
vi.mock("@/lib/auth-shims", async () => {
  const { HttpError: HE } = await import("@/lib/errors");
  return {
    HttpError: HE,
    withOrgAuth:
      (
        handler: (
          req: NextRequest,
          ctx: { orgId: string; userId: string },
          params: Record<string, string>,
        ) => Promise<Response>,
      ) =>
      async (req: NextRequest, arg?: { params?: Record<string, string> }) => {
        try {
          return await handler(req, { orgId: ORG, userId: ME }, arg?.params ?? {});
        } catch (e: unknown) {
          const status = e instanceof HE ? e.status : 500;
          return Response.json(
            { success: false, error: (e as Error).message },
            { status },
          );
        }
      },
  };
});

const assertMembership = vi.fn(async (_o: string, _c: string, _u: string) => undefined);
vi.mock("@/lib/authz", () => ({
  assertMembership: (...a: [string, string, string]) => assertMembership(...a),
}));

const getEffectiveLastSeen = vi.fn(async (_ctx: unknown, _u: string) => null as string | null);
vi.mock("@/lib/server/presence.service", () => ({
  getEffectiveLastSeen: (...a: [unknown, string]) => getEffectiveLastSeen(...a),
}));

import { GET } from "./route";

const SEEN = "2026-08-03T09:12:00.000Z";
const call = (id = CHANNEL) =>
  GET(new Request(`http://test.local/api/channels/${id}/last-seen`) as NextRequest, {
    params: { id },
  });

beforeEach(() => {
  resetMockDb();
  assertMembership.mockReset();
  assertMembership.mockResolvedValue(undefined);
  getEffectiveLastSeen.mockReset();
  getEffectiveLastSeen.mockResolvedValue(SEEN);
  mockDb.qcChannel.findUnique.mockResolvedValue({ type: "dm" } as never);
  mockDb.qcChannelMember.findMany.mockResolvedValue([{ userId: PEER }] as never);
});

describe("GET /api/channels/[id]/last-seen", () => {
  it("enforces channel membership before reading anything", async () => {
    await call();
    expect(assertMembership).toHaveBeenCalledWith(ORG, CHANNEL, ME);
  });

  it("propagates the membership rejection as 403 (non-member / cross-org)", async () => {
    assertMembership.mockRejectedValue(new HttpError(403, "Not a member of this channel"));
    const res = await call();
    expect(res.status).toBe(403);
    // Nothing is resolved once the gate rejects.
    expect(getEffectiveLastSeen).not.toHaveBeenCalled();
  });

  it("400s for a group channel — last seen is a 1:1 readout", async () => {
    mockDb.qcChannel.findUnique.mockResolvedValue({ type: "group" } as never);
    const res = await call();
    expect(res.status).toBe(400);
    expect(getEffectiveLastSeen).not.toHaveBeenCalled();
  });

  it("resolves the DM peer (never the caller) and returns the instant", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastSeen: SEEN });
    expect(getEffectiveLastSeen).toHaveBeenCalledWith({ orgId: ORG, userId: ME }, PEER);
    // The peer query excludes self, org-scoped.
    expect(mockDb.qcChannelMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG, channelId: CHANNEL, userId: { not: ME } },
      }),
    );
  });

  it("returns { lastSeen: null } when the resolver hides it — no other signal", async () => {
    getEffectiveLastSeen.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(200);
    // Identical shape to "never recorded": the response must not reveal which.
    expect(await res.json()).toEqual({ lastSeen: null });
  });

  it("returns null rather than 500 for a self-DM with no other member", async () => {
    mockDb.qcChannelMember.findMany.mockResolvedValue([] as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastSeen: null });
    expect(getEffectiveLastSeen).not.toHaveBeenCalled();
  });
});
