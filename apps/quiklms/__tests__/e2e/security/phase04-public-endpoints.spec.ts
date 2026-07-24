/**
 * PHASE 04 — Deep probe of the 8 genuinely public endpoints.
 *
 * Phase 02 excluded these from the unauthenticated sweep because they are
 * public by design. That makes them the most exposed code in the application:
 * they are the only routes an attacker can reach with no credential at all, so
 * every byte they return and every byte they accept is attack surface.
 *
 * What we are looking for, per endpoint:
 *   - does it return more than the caller needs (PII, internals)?
 *   - does it accept more than it should (no size cap, no schema)?
 *   - is the thing that identifies the resource guessable?
 *   - can caller-controlled input redirect it to another tenant's data?
 *
 * These are PROBES, not attacks: 2-3 requests per endpoint, no load testing,
 * no attempt to actually persist anything.
 */

import { test, expect } from "@playwright/test";
import { apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();

/**
 * The victim tenant's subdomain. The manifest carries `other.orgId` but not its
 * subdomain; the seed derives it as `<primary subdomain>-other`.
 */
const OTHER_SUBDOMAIN = `${m.subdomain}-other`;

test.describe("Phase 04 — (a) /api/health", () => {
  test("health does not leak infrastructure detail", async () => {
    const anon = await apiAnon();
    const res = await anon.get("/api/health", { timeout: 60_000 });
    const body = (await safeJson(res)) as Record<string, unknown>;
    const raw = JSON.stringify(body);

    expect(res.status()).toBe(200);

    // The healthy branch is a fixed literal — this asserts it stays that way.
    // The DEGRADED branch is the concern: app/api/health/route.ts:21 returns
    // `error: (err as Error).message` verbatim to an unauthenticated caller.
    // A Prisma connection failure message embeds the datasource URL, which
    // carries host, port, database name and — depending on the driver error —
    // the username. We cannot force that branch without taking the database
    // down, which an audit must not do, so this asserts the invariant on
    // whichever branch we get and the finding is recorded from source review.
    expect(
      raw,
      "health response must never contain a connection string",
    ).not.toMatch(/postgres(ql)?:\/\//i);
    expect(raw, "health response must never contain credentials").not.toMatch(/password|user=|@localhost:\d{4}/i);
    expect(raw, "health response must never contain a stack frame").not.toMatch(/\bat\s+\w+\s+\(/);

    // Present in the healthy branch; absent means we hit the degraded branch
    // and the assertions above just did the real work.
    if (res.status() === 200) expect(body.db).toBe("up");
    await anon.dispose();
  });
});

test.describe("Phase 04 — (b) /api/logs/client-error", () => {
  // This endpoint takes an unauthenticated POST, applies no zod schema, and
  // logs whatever it receives (app/api/logs/client-error/route.ts:12). Two
  // probes only — the point is to characterise the contract, not to flood it.

  test("accepts an oversized unauthenticated body with no schema or size cap", async () => {
    test.setTimeout(90_000);
    const anon = await apiAnon();

    // 1 MB — large enough to prove no cap exists, small enough to be a probe
    // rather than a denial-of-service attempt.
    const oversized = { message: "A".repeat(1_000_000) };
    const res = await anon.post("/api/logs/client-error", { data: oversized, timeout: 60_000 });

    console.log(`[INFO] 1MB unauthenticated log POST -> HTTP ${res.status()}`);

    // A 413 would mean a cap exists (good). A 200 means an unauthenticated
    // caller can write arbitrary volume into the application's stdout, which
    // is a log-cost and log-availability issue rather than a data breach.
    expect(
      [200, 201, 400, 413],
      `expected the endpoint to either accept or cap the body, got ${res.status()}`,
    ).toContain(res.status());
    if (res.status() === 200) {
      console.log("[FINDING] no size cap: 1MB body accepted (200) on an unauthenticated endpoint");
    }
    await anon.dispose();
  });

  test("log-injection payload is accepted without erroring", async () => {
    const anon = await apiAnon();

    // A BARE JSON STRING, not an object. That distinction is the whole probe:
    // `console.warn('[logs/client-error]', body)` renders an object through
    // util.inspect, which escapes newlines — but a top-level string argument is
    // printed verbatim. So this payload's newlines and ANSI escapes land raw in
    // the log stream, letting an unauthenticated caller forge log lines and
    // inject terminal control sequences into anyone tailing them.
    const injection =
      '\n[31m[FATAL] 2026-01-01T00:00:00Z forged log line injected by an unauthenticated caller[0m\n';
    const res = await anon.post("/api/logs/client-error", {
      data: JSON.stringify(injection),
      headers: { "content-type": "application/json" },
      timeout: 60_000,
    });

    console.log(`[INFO] log-injection payload -> HTTP ${res.status()}`);

    // The contract we assert is only that it must not crash the handler; the
    // injection itself is recorded as a finding from source review because the
    // test process cannot observe the server's stdout.
    expect(res.status(), "a malformed/hostile log payload must not 500").toBeLessThan(500);
    await anon.dispose();
  });
});

test.describe("Phase 04 — (c) /api/verify-certificate/[certificateId]", () => {
  // Seeded certificate for the E2E learner. If the seed changes, the tests skip
  // rather than fail — a missing fixture is not a security finding.
  const CERT_ID = "CERT-1784548583557-m13yvmg21";

  test("public certificate verification discloses learner PII", async () => {
    const anon = await apiAnon();
    const res = await anon.get(`/api/verify-certificate/${CERT_ID}`, { timeout: 60_000 });
    const body = (await safeJson(res)) as { success?: boolean; data?: Record<string, unknown> };

    if (!body?.data) {
      test.skip(true, `seeded certificate ${CERT_ID} not present — reseed to run this probe`);
      return;
    }

    const learner = body.data.learnerId as Record<string, unknown> | string;
    const raw = JSON.stringify(body.data);

    // Verifying a certificate requires: holder name, course, issue date, and
    // whether it is valid. It does NOT require the holder's email address or
    // their internal user id. Both are returned here to anyone who has the id.
    console.log(`[INFO] public certificate payload keys: ${Object.keys(body.data).join(", ")}`);
    if (typeof learner === "object" && learner) {
      console.log(`[INFO] learner sub-object keys: ${Object.keys(learner).join(", ")}`);
    }

    // VERIFIED FINDING — this assertion fails on purpose.
    // lib/services/certificates-service.ts:830 selects `email: true` on the
    // learner and the handler spreads the whole issued-certificate row
    // (app/api/verify-certificate/[certificateId]/route.ts:9), so an
    // unauthenticated caller holding only a certificate id receives the
    // holder's email address, internal user id, orgId, numeric score and
    // passing threshold. Minimum necessary disclosure for a public verifier is
    // name + course + issued date + valid/invalid.
    expect(
      raw,
      "PII LEAK: public certificate verification returns the holder's email address",
    ).not.toMatch(/@/);
  });

  test("certificate ids are not sequentially enumerable", async () => {
    const anon = await apiAnon();

    // The id format is `CERT-<epoch-ms>-<9 base36 chars>`
    // (lib/services/certificates-service.ts:169). The timestamp half is fully
    // predictable, so this probe checks whether the random half is actually
    // load-bearing: walk the timestamp by ±1ms keeping the suffix, and try the
    // timestamp alone. If either resolves, ids are enumerable outright.
    const [, ts, suffix] = CERT_ID.split("-");
    const neighbours = [
      `CERT-${Number(ts) + 1}-${suffix}`,
      `CERT-${Number(ts) - 1}-${suffix}`,
      `CERT-${ts}-000000000`,
    ];

    const hits: string[] = [];
    for (const candidate of neighbours) {
      const res = await anon.get(`/api/verify-certificate/${candidate}`, { timeout: 60_000 });
      const body = (await safeJson(res)) as { data?: unknown };
      if (body?.data) hits.push(candidate);
    }
    await anon.dispose();

    // The 9-char base36 suffix is ~46 bits, so brute force is infeasible even
    // though it comes from Math.random() rather than a CSPRNG. This asserts the
    // suffix genuinely gates access — that the timestamp alone is not enough.
    expect(
      hits,
      `ENUMERABLE: certificate ids resolved by varying only the timestamp: ${hits.join(", ")}`,
    ).toHaveLength(0);
  });
});

test.describe("Phase 04 — (d) /api/tenants/branding/public", () => {
  test("tenant selection cannot be redirected by a spoofed header", async () => {
    test.setTimeout(90_000);
    const anon = await apiAnon();

    // Baseline: no routing headers, requested via localhost (no subdomain), so
    // the route should resolve no tenant at all.
    const baseline = (await safeJson(
      await anon.get("/api/tenants/branding/public", { timeout: 60_000 }),
    )) as { data?: unknown };

    // A subdomain that does not exist — proves a null result is meaningful and
    // is not just this endpoint always returning null.
    const bogus = (await safeJson(
      await anon.get("/api/tenants/branding/public", {
        headers: { "x-tenant-subdomain": "definitely-not-a-tenant-xyz" },
        timeout: 60_000,
      }),
    )) as { data?: unknown };

    // The victim tenant, selected purely by an attacker-supplied header.
    const spoofedSubdomain = (await safeJson(
      await anon.get("/api/tenants/branding/public", {
        headers: { "x-tenant-subdomain": OTHER_SUBDOMAIN },
        timeout: 60_000,
      }),
    )) as { data?: unknown };

    await anon.dispose();

    console.log(
      `[INFO] branding baseline=${JSON.stringify(baseline?.data)} bogus=${JSON.stringify(bogus?.data)} ` +
        `spoofed(${OTHER_SUBDOMAIN})=${JSON.stringify(spoofedSubdomain?.data)}`,
    );

    // Control: a nonexistent subdomain must resolve nothing, otherwise the
    // assertion below would be meaningless.
    expect(bogus?.data, "control: a bogus subdomain must resolve no tenant").toBeNull();

    // VERIFIED FINDING — this assertion fails on purpose.
    // app/api/tenants/branding/public/route.ts:32-33 reads `x-tenant-key` and
    // `x-tenant-subdomain` straight off the inbound request. The route's own
    // doc comment (lines 17-19) asserts the tenant is derived from "WHERE THE
    // REQUEST CAME FROM, never from caller-supplied content" — that holds for
    // the Host fallback but NOT for these two headers, which any client can
    // set. Nothing strips an inbound copy before the handler sees it, so the
    // host-binding the comment relies on is not actually enforced.
    expect(
      spoofedSubdomain?.data,
      "TENANT SPOOF: an attacker-supplied x-tenant-subdomain header selected another tenant's branding",
    ).toBeNull();
  });

  test("tenant selection cannot be redirected by a spoofed x-tenant-key", async () => {
    const anon = await apiAnon();

    // Same defect via the higher-precedence header (checked first, at line 37).
    // A tenantKey is an unguessable `tk_<32 hex>` secret for real tenants, so
    // this path additionally requires knowing that value — which is why it is
    // probed separately from the subdomain path rather than lumped in with it.
    const res = await anon.get("/api/tenants/branding/public", {
      headers: { "x-tenant-key": "definitely-not-a-real-tenant-key" },
      timeout: 60_000,
    });
    const body = (await safeJson(res)) as { data?: unknown };
    await anon.dispose();

    // An unknown key must resolve nothing and must not error.
    expect(res.status()).toBe(200);
    expect(body?.data, "an unknown tenant key must resolve no tenant").toBeNull();
  });
});

test.describe("Phase 04 — (e) /api/meetings/webhook/zoom", () => {
  // This webhook mutates meeting state by `externalMeetingId` with no orgId
  // scoping, so the HMAC is the only thing standing between an anonymous caller
  // and any tenant's meetings. Both probes must be rejected.
  const EVENT = JSON.stringify({
    event: "meeting.ended",
    payload: { object: { id: "00000000000", uuid: "e2e-audit-probe" } },
  });

  test("an unsigned webhook payload is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.post("/api/meetings/webhook/zoom", {
      data: EVENT,
      headers: { "content-type": "application/json" },
      timeout: 60_000,
    });
    expect(
      res.status(),
      "an unsigned Zoom event must be refused — the HMAC is the only auth on this route",
    ).toBe(401);
    await anon.dispose();
  });

  test("a wrongly-signed webhook payload is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.post("/api/meetings/webhook/zoom", {
      data: EVENT,
      headers: {
        "content-type": "application/json",
        // Correctly shaped but computed with the wrong secret.
        "x-zm-signature": `v0=${"a".repeat(64)}`,
        "x-zm-request-timestamp": String(Date.now()),
      },
      timeout: 60_000,
    });
    expect(
      res.status(),
      "a forged signature must be refused, and via constant-time compare",
    ).toBe(401);
    await anon.dispose();
  });
});
