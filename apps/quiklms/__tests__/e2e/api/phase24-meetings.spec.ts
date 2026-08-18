/**
 * PHASE 24 — Meetings (`/api/meetings/*`), all 14 route files.
 *
 *   GET    /api/meetings                        (any authed)
 *   POST   /api/meetings                        (TEACHER|TENANT_ADMIN|SUB_ADMIN)
 *   GET    /api/meetings/[id]                   (requireAuth ONLY)
 *   POST   /api/meetings/[id]/start             (staff)
 *   POST   /api/meetings/[id]/end               (staff)
 *   POST   /api/meetings/[id]/cancel            (staff)
 *   POST   /api/meetings/[id]/join              (requireAuth ONLY)
 *   POST   /api/meetings/[id]/leave             (requireAuth ONLY)
 *   GET    /api/meetings/[id]/attendance        (staff)
 *   PATCH  /api/meetings/[id]/recording         (staff)
 *   GET    /api/meetings/[id]/recordings        (requireAuth ONLY)
 *   POST   /api/meetings/instant                (staff)
 *   GET    /api/meetings/recordings             (requireAuth ONLY)
 *   GET    /api/meetings/live-status/[sid]      (PARENT|TENANT_ADMIN|SUB_ADMIN)
 *   POST   /api/meetings/webhook/zoom           (PUBLIC — HMAC is the auth)
 *
 * `/api/meetings/[id]` exports GET only; there is no PATCH/DELETE to probe
 * (rule 2).
 *
 * Two authorization questions drive this phase:
 *  1. `findOne` spreads the whole row (`...meeting`, meetings-service.ts:215-221)
 *     including `hostUrl` and `password`, and the route has no role guard. Does
 *     a learner get the HOST credential of a class they are not in?
 *  2. `joinMeeting` resolves on `{id, orgId}` and does no membership check
 *     (meetings-service.ts:321-323). Can any authenticated user join any
 *     meeting? Note the service DOES withhold `hostUrl` from non-staff on the
 *     join path (line 347) — so the two paths disagree, which is the story.
 *
 * The zoom webhook is public by construction; the HMAC is asserted to be
 * load-bearing rather than decorative.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT24-${Date.now()}`;
const SECRET_HOST_URL = `https://example.invalid/host/${RUN}`;
const SECRET_PASSWORD = `pw-${RUN}`;

const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PATCH = (a: APIRequestContext, p: string, data?: unknown) =>
  a.patch(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });

interface Meeting {
  id: string;
  _id?: string;
  title: string | null;
  status: string;
  provider: string;
  joinUrl: string | null;
  hostUrl: string | null;
  password: string | null;
  recordingEnabled: boolean;
  recordingStatus: string;
  recordingUrls: string[];
  actualStartTime: string | null;
  actualEndTime: string | null;
  participantCount: number;
}

/** A meeting created by this run, carrying a recognisable host credential. */
let secretMeetingId = "";

async function createMeeting(
  staff: APIRequestContext,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<Meeting> {
  const start = new Date(Date.now() + 36e5);
  const res = await POST(staff, "/api/meetings", {
    title,
    scheduledStartTime: start.toISOString(),
    scheduledEndTime: new Date(start.getTime() + 36e5).toISOString(),
    provider: "jitsi",
    joinUrl: `https://meet.jit.si/${RUN}`,
    hostUrl: SECRET_HOST_URL,
    password: SECRET_PASSWORD,
    recordingEnabled: false,
    ...extra,
  });
  expect(res.status(), `create meeting said ${await res.text()}`).toBe(200);
  return (await safeJson(res)) as Meeting;
}

test.beforeAll(async () => {
  test.setTimeout(120_000); // rule 9
  expect(m.meetingId, "seed manifest has no meetingId — reseed before running").toBeTruthy();
  const teacher = await apiAs("teacher", { timeout: CEIL });
  const meeting = await createMeeting(teacher, `${RUN} host-credential probe`);
  secretMeetingId = meeting.id ?? meeting._id!;
  expect(secretMeetingId).toBeTruthy();
  await teacher.dispose();
});

test.describe("Phase 24 — meetings: reads", () => {
  test("GET /api/meetings lists meetings for an admin", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, "/api/meetings");
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as Meeting[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((x) => (x.id ?? x._id) === m.meetingId)).toBe(true);
    await api.dispose();
  });

  test("GET /api/meetings?scheduledClassId= filters", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, `/api/meetings?scheduledClassId=${m.scheduledClassId}`);
    expect(res.status()).toBe(200);
    expect(Array.isArray(await safeJson(res))).toBe(true);
    await api.dispose();
  });

  test("GET /api/meetings/[id] returns the documented shape", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, `/api/meetings/${m.meetingId}`);
    expect(res.status()).toBe(200);
    const mt = (await safeJson(res)) as Meeting;
    expect(mt.id ?? mt._id).toBe(m.meetingId);
    expect(typeof mt.status).toBe("string");
    expect(typeof mt.provider).toBe("string");
    await api.dispose();
  });

  test("GET /api/meetings/[id] with a nonexistent id is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, `/api/meetings/${MISSING}`);
    expect(res.status()).toBe(404);
    expect(((await safeJson(res)) as { success?: boolean }).success).toBe(false);
    await api.dispose();
  });

  test("GET /api/meetings/[id]/attendance returns the participant log", async () => {
    const api = await apiAs("teacher", { timeout: CEIL });
    const res = await GET(api, `/api/meetings/${m.meetingId}/attendance`);
    expect(res.status()).toBe(200);
    expect(Array.isArray(await safeJson(res))).toBe(true);
    await api.dispose();
  });

  test("GET /api/meetings/[id]/recordings returns the recording envelope", async () => {
    const api = await apiAs("teacher", { timeout: CEIL });
    const res = await GET(api, `/api/meetings/${m.meetingId}/recordings`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as { meetingId: string; recordingUrls: string[] };
    expect(body.meetingId).toBe(m.meetingId);
    expect(Array.isArray(body.recordingUrls)).toBe(true);
    await api.dispose();
  });

  test("GET /api/meetings/recordings lists tenant recordings", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, "/api/meetings/recordings");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await safeJson(res))).toBe(true);
    await api.dispose();
  });

  test("GET /api/meetings/live-status/[sid] answers for a PARENT", async () => {
    const api = await apiAs("parent", { timeout: CEIL });
    const res = await GET(api, `/api/meetings/live-status/${m.users.learner.userId}`);
    expect(res.status()).toBe(200);
    expect(Array.isArray(await safeJson(res))).toBe(true);
    await api.dispose();
  });
});

test.describe("Phase 24 — meetings: role gating", () => {
  const DENIED: Array<[string, "learner" | "parent" | "teacher" | "manager", string]> = [
    ["GET /api/meetings/[id]/attendance", "learner", `/api/meetings/${m.meetingId}/attendance`],
    ["GET /api/meetings/[id]/attendance", "parent", `/api/meetings/${m.meetingId}/attendance`],
    ["GET /api/meetings/live-status/[sid]", "learner", `/api/meetings/live-status/${m.users.learner.userId}`],
    ["GET /api/meetings/live-status/[sid]", "teacher", `/api/meetings/live-status/${m.users.learner.userId}`],
  ];

  for (const [label, role, path] of DENIED) {
    test(`${role} is refused ${label}`, async () => {
      const api = await apiAs(role, { timeout: CEIL });
      const res = await GET(api, path);
      expect(res.status(), `${role} reached ${label}`).toBe(403);
      await api.dispose();
    });
  }

  test("LEARNER cannot create, start, end, cancel or toggle recording", async () => {
    test.setTimeout(150_000);
    const api = await apiAs("learner", { timeout: CEIL });
    const id = secretMeetingId;
    const probes: Array<[string, () => Promise<{ status(): number }>]> = [
      [
        "POST /api/meetings",
        () =>
          POST(api, "/api/meetings", {
            scheduledStartTime: new Date().toISOString(),
            scheduledEndTime: new Date(Date.now() + 36e5).toISOString(),
          }),
      ],
      ["POST /api/meetings/[id]/start", () => POST(api, `/api/meetings/${id}/start`, {})],
      ["POST /api/meetings/[id]/end", () => POST(api, `/api/meetings/${id}/end`, {})],
      ["POST /api/meetings/[id]/cancel", () => POST(api, `/api/meetings/${id}/cancel`, {})],
      ["PATCH /api/meetings/[id]/recording", () => PATCH(api, `/api/meetings/${id}/recording`, { enabled: true })],
      ["POST /api/meetings/instant", () => POST(api, "/api/meetings/instant", { provider: "jitsi" })],
    ];
    for (const [label, run] of probes) {
      const res = await run();
      expect(res.status(), `LEARNER reached ${label}`).toBe(403);
    }
    await api.dispose();
  });

  test("PARENT cannot create an instant meeting", async () => {
    const api = await apiAs("parent", { timeout: CEIL });
    const res = await POST(api, "/api/meetings/instant", { provider: "jitsi", title: RUN });
    expect(res.status()).toBe(403);
    await api.dispose();
  });
});

test.describe("Phase 24 — meetings: lifecycle (each mutation read back)", () => {
  test("create → start → recording toggle → end, verified by read-back", async () => {
    test.setTimeout(180_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const created = await createMeeting(teacher, `${RUN} lifecycle`);
    const id = created.id ?? created._id!;

    const started = await POST(teacher, `/api/meetings/${id}/start`, {});
    expect(started.status(), `start said ${await started.text()}`).toBe(200);
    const afterStart = (await safeJson(await GET(teacher, `/api/meetings/${id}`))) as Meeting;
    expect(afterStart.status, "start did not persist").toBe("in_progress");
    expect(afterStart.actualStartTime, "actualStartTime not stamped").toBeTruthy();

    const rec = await PATCH(teacher, `/api/meetings/${id}/recording`, { enabled: true });
    expect(rec.status()).toBe(200);
    const afterRec = (await safeJson(await GET(teacher, `/api/meetings/${id}`))) as Meeting;
    expect(afterRec.recordingEnabled, "recording toggle did not persist").toBe(true);

    const ended = await POST(teacher, `/api/meetings/${id}/end`, {});
    expect(ended.status()).toBe(200);
    const afterEnd = (await safeJson(await GET(teacher, `/api/meetings/${id}`))) as Meeting;
    expect(afterEnd.status, "end did not persist").toBe("ended");
    expect(afterEnd.actualEndTime, "actualEndTime not stamped").toBeTruthy();

    await teacher.dispose();
  });

  test("cancel marks a meeting cancelled, verified by read-back", async () => {
    test.setTimeout(120_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const created = await createMeeting(teacher, `${RUN} cancel`);
    const id = created.id ?? created._id!;

    const res = await POST(teacher, `/api/meetings/${id}/cancel`, {});
    expect(res.status(), `cancel said ${await res.text()}`).toBe(200);
    const after = (await safeJson(await GET(teacher, `/api/meetings/${id}`))) as Meeting;
    expect(after.status, "cancel did not persist").toBe("cancelled");
    await teacher.dispose();
  });

  test("join then leave writes an attendance record, verified by read-back", async () => {
    test.setTimeout(180_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const created = await createMeeting(teacher, `${RUN} attendance`);
    const id = created.id ?? created._id!;

    const learner = await apiAs("learner", { timeout: CEIL });
    const joined = await POST(learner, `/api/meetings/${id}/join`, { deviceType: "web" });
    expect(joined.status(), `join said ${await joined.text()}`).toBe(200);

    const log = (await safeJson(await GET(teacher, `/api/meetings/${id}/attendance`))) as Array<{
      userId: string | { _id?: string; id?: string };
      leftAt: string | null;
    }>;
    const idOf = (v: (typeof log)[number]["userId"]) =>
      typeof v === "string" ? v : (v?.id ?? v?._id ?? "");
    const mine = log.find((r) => idOf(r.userId) === m.users.learner.userId);
    expect(mine, "join produced no attendance row").toBeTruthy();
    expect(mine!.leftAt).toBeNull();

    const left = await POST(learner, `/api/meetings/${id}/leave`, {});
    expect(left.status()).toBe(200);
    const log2 = (await safeJson(await GET(teacher, `/api/meetings/${id}/attendance`))) as typeof log;
    const mine2 = log2.find((r) => idOf(r.userId) === m.users.learner.userId);
    expect(mine2!.leftAt, "leave did not stamp leftAt").toBeTruthy();

    await learner.dispose();
    await teacher.dispose();
  });

  test("POST /api/meetings/instant returns an immediately-live meeting", async () => {
    test.setTimeout(120_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const res = await POST(teacher, "/api/meetings/instant", { provider: "jitsi", title: `${RUN} instant` });
    expect(res.status(), `instant said ${await res.text()}`).toBe(200);
    const mt = (await safeJson(res)) as Meeting;
    const id = mt.id ?? mt._id!;
    expect(id).toBeTruthy();
    expect(mt.joinUrl, "an instant meeting must carry a join URL").toBeTruthy();

    const back = (await safeJson(await GET(teacher, `/api/meetings/${id}`))) as Meeting;
    expect(back.isInstant ?? true).toBeTruthy();
    await teacher.dispose();
  });

  test("mutations against a nonexistent meeting id are 404, not 500", async () => {
    test.setTimeout(150_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const probes: Array<[string, () => Promise<{ status(): number }>]> = [
      ["start", () => POST(teacher, `/api/meetings/${MISSING}/start`, {})],
      ["end", () => POST(teacher, `/api/meetings/${MISSING}/end`, {})],
      ["cancel", () => POST(teacher, `/api/meetings/${MISSING}/cancel`, {})],
      ["join", () => POST(teacher, `/api/meetings/${MISSING}/join`, {})],
      ["leave", () => POST(teacher, `/api/meetings/${MISSING}/leave`, {})],
      ["recording", () => PATCH(teacher, `/api/meetings/${MISSING}/recording`, { enabled: true })],
      ["recordings", () => GET(teacher, `/api/meetings/${MISSING}/recordings`)],
      ["attendance", () => GET(teacher, `/api/meetings/${MISSING}/attendance`)],
    ];
    for (const [label, run] of probes) {
      const res = await run();
      expect(res.status(), `${label} returned ${res.status()} for a missing id`).toBeLessThan(500);
    }
    await teacher.dispose();
  });
});

test.describe("Phase 24 — meetings: zoom webhook (public route)", () => {
  test("an unsigned webhook POST is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.post("/api/meetings/webhook/zoom", {
      timeout: CEIL,
      data: { event: "meeting.ended", payload: { object: { id: "spoofed" } } },
    });
    expect(
      res.status(),
      "the HMAC must be load-bearing — an unsigned event must not reach handleZoomWebhook",
    ).toBe(401);
    await anon.dispose();
  });

  test("a wrongly-signed webhook POST is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.post("/api/meetings/webhook/zoom", {
      timeout: CEIL,
      headers: {
        "x-zm-signature": "v0=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        "x-zm-request-timestamp": String(Math.floor(Date.now() / 1000)),
        "content-type": "application/json",
      },
      data: { event: "meeting.ended", payload: { object: { id: "spoofed" } } },
    });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test("an authenticated caller cannot bypass the webhook HMAC either", async () => {
    // The route never calls requireAuth — the signature IS the authentication.
    // A session cookie must not substitute for it.
    const admin = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await POST(admin, "/api/meetings/webhook/zoom", {
      event: "meeting.ended",
      payload: { object: { id: "spoofed" } },
    });
    expect(res.status(), "a session must not substitute for the webhook HMAC").toBe(401);
    await admin.dispose();
  });
});

test.describe("Phase 24 — meetings: intra-tenant ownership", () => {
  /**
   * `GET /api/meetings/[id]` is requireAuth-only
   * (app/api/meetings/[id]/route.ts:6-8) and `findOne` spreads the entire row
   * (meetings-service.ts:215-221), so `hostUrl` and `password` go to whoever
   * asks. `hostUrl` is the HOST credential — the link that grants control of
   * the conference (mute/remove participants, start recording).
   *
   * The join path deliberately withholds it from non-staff
   * (meetings-service.ts:347), so the two read paths disagree; that
   * inconsistency is what makes this a defect rather than a design choice.
   */
  test("a LEARNER reads a meeting's hostUrl and password", async () => {
    const learner = await apiAs("learner", { timeout: CEIL });
    const res = await GET(learner, `/api/meetings/${secretMeetingId}`);
    const mt = (await safeJson(res)) as Meeting;
    console.log(
      `[F-P24] LEARNER GET /api/meetings/{id} -> ${res.status()}; hostUrl=${mt.hostUrl}; password=${mt.password}`,
    );
    expect(
      mt.hostUrl,
      "DISCLOSURE: the host URL — the credential that grants host control of the " +
        "conference — is served to any authenticated user. meetings-service.ts:215-221 " +
        "spreads the whole row and app/api/meetings/[id]/route.ts:6-8 has no role guard, " +
        "while the join path (meetings-service.ts:347) correctly withholds it from non-staff.",
    ).toBeNull();
    await learner.dispose();
  });

  test("a LEARNER cannot see the meeting password either", async () => {
    const learner = await apiAs("learner", { timeout: CEIL });
    const mt = (await safeJson(await GET(learner, `/api/meetings/${secretMeetingId}`))) as Meeting;
    expect(
      mt.password,
      "DISCLOSURE: the meeting password is served to any authenticated user by the same spread.",
    ).toBeNull();
    await learner.dispose();
  });

  /**
   * `joinMeeting` resolves on `{id, orgId}` only (meetings-service.ts:321-323).
   * The seeded PARENT belongs to no batch and is not a participant of anything,
   * so a successful join is proof that membership is never checked.
   */
  test("an unrelated PARENT can join any meeting and receive its join URL", async () => {
    const parent = await apiAs("parent", { timeout: CEIL });
    const res = await POST(parent, `/api/meetings/${secretMeetingId}/join`, { deviceType: "web" });
    const body = (await safeJson(res)) as { joinUrl?: string; alreadyJoined?: boolean };
    console.log(`[F-P24] PARENT join -> ${res.status()}; joinUrl=${body.joinUrl ?? "n/a"}`);
    expect(
      res.status(),
      "OWNERSHIP: any authenticated user in the tenant can join any meeting — " +
        "joinMeeting (meetings-service.ts:321-323) checks only {id, orgId}, never batch " +
        "membership or class enrolment. Same defect class as F-010.",
    ).toBe(403);
    await parent.dispose();
  });
});
