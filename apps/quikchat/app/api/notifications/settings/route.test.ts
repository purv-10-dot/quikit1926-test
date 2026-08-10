// The settings PATCH input gate.
//
// This route hand-writes a per-field allow-list, which makes it easy to add a
// field to the DTO + the service and forget the line here — the PATCH then
// returns 200 while silently discarding the value. That is exactly how
// `callSoundsEnabled` shipped broken. The last test in this file is the
// structural guard: it PATCHes every boolean DTO field at once and asserts each
// one survives, so the next forgotten line fails here instead of in the UI.
//
// (app/api/notifications/routes.test.ts also covers this route but is DB-backed
// and excluded from Vitest — see vitest.config.ts — so it can't catch this.)
import type { NotificationSettingsDto } from "@/lib/shared";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "org-1";
const USER = "u1";

// withOrgAuth is the app's auth/rate-limit/module wrapper; unwrap it so the
// handler under test runs directly with a fixed org context.
vi.mock("@/lib/auth-shims", () => ({
  withOrgAuth:
    (handler: (req: NextRequest, ctx: { orgId: string; userId: string }) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(req, { orgId: ORG, userId: USER }),
}));

const service = {
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
};
vi.mock("@/lib/server/notifications.service", () => ({
  getSettings: (...a: unknown[]) => service.getSettings(...a),
  updateSettings: (...a: unknown[]) => service.updateSettings(...a),
}));

import { PATCH } from "./route";

function settings(over: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    defaultChannelLevel: "all",
    dmsLevel: "all",
    soundEnabled: true,
    callSoundsEnabled: true,
    desktopEnabled: true,
    emailEnabled: false,
    dndEnabled: false,
    dndStart: null,
    dndEnd: null,
    snoozedUntil: null,
    priorityDuringDnd: true,
    ...over,
  };
}

function patchReq(body: unknown): NextRequest {
  return new Request("http://test.local/api/notifications/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** The patch object the route actually forwarded to the service. */
const forwarded = () => service.updateSettings.mock.calls[0]![1] as Record<string, unknown>;

beforeEach(() => {
  service.updateSettings.mockReset();
  // Echo the patch back as the updated DTO, like the real service does.
  service.updateSettings.mockImplementation(async (_ctx, patch) =>
    settings(patch as Partial<NotificationSettingsDto>),
  );
});

describe("PATCH /api/notifications/settings — callSoundsEnabled", () => {
  it("forwards callSoundsEnabled:false and returns it (the round trip that was broken)", async () => {
    const res = await PATCH(patchReq({ callSoundsEnabled: false }), undefined as never);

    expect(forwarded()).toEqual({ callSoundsEnabled: false });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ callSoundsEnabled: false });
  });

  it("forwards callSoundsEnabled:true (not merely dropped as falsy)", async () => {
    await PATCH(patchReq({ callSoundsEnabled: true }), undefined as never);
    expect(forwarded()).toEqual({ callSoundsEnabled: true });
  });

  it("rejects a non-boolean callSoundsEnabled, like every other guarded field", async () => {
    await PATCH(patchReq({ callSoundsEnabled: "false" }), undefined as never);
    expect(forwarded()).not.toHaveProperty("callSoundsEnabled");
  });
});

describe("PATCH /api/notifications/settings — allow-list completeness", () => {
  // Structural guard. Enumerated from the DTO rather than hand-listed, so a new
  // boolean settings field is covered the moment it exists.
  const BOOLEAN_FIELDS = (
    Object.entries(settings()) as [keyof NotificationSettingsDto, unknown][]
  )
    .filter(([, v]) => typeof v === "boolean")
    .map(([k]) => k);

  it("every boolean DTO field survives the route's per-field chain", async () => {
    // Send the inverse of each default so a dropped field is unambiguous.
    const body = Object.fromEntries(BOOLEAN_FIELDS.map((k) => [k, !settings()[k]]));
    await PATCH(patchReq(body), undefined as never);

    const got = forwarded();
    const missing = BOOLEAN_FIELDS.filter((k) => !(k in got));
    // If this fails, a settings field was added to the DTO without a matching
    // `if (isBool(body.X)) patch.X = body.X` line in route.ts.
    expect(missing).toEqual([]);
    expect(got).toEqual(body);
  });

  it("sanity: the guard is actually enumerating fields", () => {
    expect(BOOLEAN_FIELDS).toContain("soundEnabled");
    expect(BOOLEAN_FIELDS).toContain("callSoundsEnabled");
    expect(BOOLEAN_FIELDS.length).toBeGreaterThanOrEqual(6);
  });

  it("ignores unknown keys entirely", async () => {
    await PATCH(patchReq({ soundEnabled: false, bogusField: true }), undefined as never);
    expect(forwarded()).toEqual({ soundEnabled: false });
  });
});
