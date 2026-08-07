/**
 * [P3.B2] send_email action — real-DB proof against seeded autotest DB.
 * Merge-field substitution renders per-lead values; suppression skips
 * DNE/unsubscribed/no-email leads (recorded, not dispatched); a mailable lead
 * sends. SPEC §5.1, §8.
 *
 * ─── SAFETY (Constraint 1.1) ────────────────────────────────────────────────
 * Captured "console" transport ONLY (forced at load + beforeAll; the mailable
 * case asserts a "sent" row with no live provider). All leads are throwaway rows
 * under a synthetic tenant with *.example.test addresses — never a real lead.
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.EMAIL_PROVIDER = "console"; // GUARD: captured transport before any dispatch

import { integrationPrisma } from "../../helpers/integrationDb";
import { executeSendEmail } from "@/lib/services/automation/email-action";
import type { QcfLead } from "@quikit/database";

const TENANT = `int_b2_${Date.now()}`;

async function mkLead(overrides: Partial<QcfLead>): Promise<QcfLead> {
  return integrationPrisma.qcfLead.create({
    data: { orgId: TENANT, name: "B2 Lead", stage: "New", status: "Open", ...overrides } as never,
  });
}

beforeAll(() => {
  process.env.EMAIL_PROVIDER = "console";
});

afterAll(async () => {
  await integrationPrisma.qcfOutboundMessageLog.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfLead.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.$disconnect();
});

describe("B2 send_email action · real DB (captured transport)", () => {
  it("renders {merge} fields per-lead and sends a mailable lead", async () => {
    const lead = await mkLead({ firstName: "Ada", email: "ada+b2@example.test" });
    const res = await executeSendEmail({
      orgId: TENANT,
      lead,
      cfg: { subject: "Hello {firstName}", body: "Your name is {name}." },
    });

    expect(res.status).toBe("sent");
    const row = await integrationPrisma.qcfOutboundMessageLog.findUnique({ where: { id: res.logId } });
    expect(row?.subject).toBe("Hello Ada");
    expect(row?.body).toBe("Your name is B2 Lead.");
    expect(row?.status).toBe("sent");
    expect((row?.metadata as Record<string, unknown>)?.driver).toBe("console");
  });

  it("SKIPS a Do-Not-Email lead — recorded, not dispatched", async () => {
    const lead = await mkLead({ email: "dne+b2@example.test", doNotEmail: true });
    const res = await executeSendEmail({ orgId: TENANT, lead, cfg: { subject: "s", body: "b" } });
    expect(res).toMatchObject({ status: "skipped", reason: "do-not-email" });
    const row = await integrationPrisma.qcfOutboundMessageLog.findUnique({ where: { id: res.logId } });
    expect(row?.status).toBe("skipped");
    expect(row?.sentAt).toBeNull();
  });

  it("SKIPS an unsubscribed lead", async () => {
    const lead = await mkLead({ email: "unsub+b2@example.test", unsubscribed: true });
    const res = await executeSendEmail({ orgId: TENANT, lead, cfg: {} });
    expect(res).toMatchObject({ status: "skipped", reason: "unsubscribed" });
  });

  it("SKIPS a lead with no valid email", async () => {
    const lead = await mkLead({ email: null });
    const res = await executeSendEmail({ orgId: TENANT, lead, cfg: {} });
    expect(res).toMatchObject({ status: "skipped", reason: "no-valid-email" });
  });
});
