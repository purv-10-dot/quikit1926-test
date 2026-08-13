/**
 * [P3.B1] Email dispatch — real-DB proof against the seeded autotest DB.
 *
 * Proves the SURVEY #7 gap is closed: a queued QceOutboundMessageLog row is
 * consumed by `dispatchOutboundMessage`, actually dispatched, and the row
 * transitions queued→sent; a send failure records "failed" and does not throw.
 *
 * ─── SAFETY (Constraint 1.1) ────────────────────────────────────────────────
 * This test uses the CAPTURED "console" transport ONLY. Three independent
 * guards ensure no real mail can leave:
 *   1. EMAIL_PROVIDER is forced to "console" at module load (after the
 *      integration setup loaded .env.local's office365) and again in beforeAll.
 *   2. The recipient is a synthetic *.example.test address on a throwaway lead
 *      under a synthetic tenant — never a seeded/real lead.
 *   3. The test asserts the returned driver === "console"; a real provider
 *      would fail this assertion instead of silently sending.
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// GUARD 1 — force the captured transport before anything can dispatch.
process.env.EMAIL_PROVIDER = "console";

import { integrationPrisma } from "../../helpers/integrationDb";
import { dispatchOutboundMessage } from "@/lib/services/automation/email-dispatch";

const TENANT = `int_b1_${Date.now()}`;

beforeAll(() => {
  process.env.EMAIL_PROVIDER = "console"; // re-assert (belt & suspenders)
});

afterAll(async () => {
  await integrationPrisma.qceOutboundMessageLog.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.$disconnect();
});

describe("B1 email dispatch · real DB (captured transport)", () => {
  it("consumes a queued row → dispatches via console driver → status queued→sent", async () => {
    const row = await integrationPrisma.qceOutboundMessageLog.create({
      data: {
        orgId: TENANT,
        channel: "email",
        to: "captured+b1@example.test", // synthetic, never a real lead
        subject: "B1 dispatch test",
        body: "Captured-only body.",
        status: "queued",
      },
    });

    const res = await dispatchOutboundMessage(TENANT, row.id);

    expect(res.outcome).toBe("sent");
    expect(res.driver).toBe("console"); // GUARD 3: proves no live provider ran

    const after = await integrationPrisma.qceOutboundMessageLog.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe("sent");
    expect(after?.sentAt).toBeInstanceOf(Date);
    expect((after?.metadata as Record<string, unknown>)?.driver).toBe("console");
  });

  it("records failed (no throw) when the recipient is invalid", async () => {
    // Empty recipient → ensureRecipients throws inside the driver → recorded failed.
    const row = await integrationPrisma.qceOutboundMessageLog.create({
      data: { orgId: TENANT, channel: "email", to: "", subject: "x", body: "y", status: "queued" },
    });

    const res = await dispatchOutboundMessage(TENANT, row.id);

    expect(res.outcome).toBe("failed");
    const after = await integrationPrisma.qceOutboundMessageLog.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe("failed");
    expect((after?.metadata as Record<string, unknown>)?.error).toBeTruthy();
  });

  it("skips a non-queued row (idempotent — never double-sends)", async () => {
    const row = await integrationPrisma.qceOutboundMessageLog.create({
      data: { orgId: TENANT, channel: "email", to: "captured@example.test", subject: "x", body: "y", status: "sent" },
    });
    const res = await dispatchOutboundMessage(TENANT, row.id);
    expect(res.outcome).toBe("skipped");
  });
});
