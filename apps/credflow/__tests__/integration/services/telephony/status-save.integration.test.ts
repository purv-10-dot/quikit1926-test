/**
 * FR-RE Stage 3-A — save a call from the agent's STATUS (Option Y).
 *
 * The agent no longer picks a disposition; Status is the single selection and
 * the disposition becomes an internal "Call" logging action. createCallLog must:
 *   - save WITHOUT a real callDispositionId (no 404),
 *   - write the Call activity with subject = "Call Disposition - <Status>",
 *   - leave outcome EMPTY (detailNotes already carries Status/Notes/etc.),
 *   - so the lead timeline renders one clean line "Call Disposition - <Status>"
 *     (no "Call · … · …" doubling),
 *   - and STILL record the actor's proper name (ownerName) + occurredAt
 *     (regression guard for the timeline's "Agent: <name>" + timestamp).
 *
 * RED until Stage 3-A:
 *   - createCallLog throws 404 when callDispositionId has no matching row, and
 *   - the Call activity subject is "Call · <name>" with outcome = <name>,
 *     which composes to "Call · Call Disposition - … · …" in the renderer.
 * The actor/time checks on the EXISTING real-disposition path are intentionally
 * GREEN now (they guard behavior we must preserve).
 *
 * Requires: local Postgres + .env.local with DATABASE_URL. Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma, cleanupTenant } from "../../helpers/integrationDb";
import { createCallLog } from "@/lib/services/telephony/disposition-engine";
// The REAL renderer composition — same function lead-activity-timeline.tsx uses.
// No local mirror: a wrong branch makes the helper double up and FAILS the test.
import { activityHeadline } from "@/lib/utils/activity-headline";

const TENANT = `int_s3a_${Date.now()}`;
const OWNER_ID = "user_s3a_1";
const OWNER_NAME = "Dev Pallav";
const STATUS = "Renewal Done";
const PAST_DT = new Date("2026-06-02T05:48:00.000Z");

let leadId: string;
let realDispositionId: string;

beforeAll(async () => {
  const lead = await integrationPrisma.crmLead.create({
    data: { tenantId: TENANT, name: "Stage 3-A Lead" },
  });
  leadId = lead.id;

  // A real disposition only so the no-regression / actor-time-on-existing-path
  // checks have something to call. The Option-Y save path must NOT need this.
  const disp = await integrationPrisma.crmCallDisposition.create({
    data: { tenantId: TENANT, code: "interested_s3a", label: "Interested", name: "Interested" },
  });
  realDispositionId = disp.id;
});

afterAll(async () => {
  await cleanupTenant(TENANT);
  await integrationPrisma.$disconnect();
});

describe("FR-RE Stage 3-A — save from Status (Option Y)", () => {
  it("saves WITHOUT a real callDispositionId (no 404) when a Status is supplied", async () => {
    await expect(
      createCallLog(TENANT, OWNER_ID, OWNER_NAME, {
        source: "dialer",
        toNumber: "9888800001",
        callDispositionId: "", // Option Y: agent never picks a disposition
        linkedLeadId: leadId,
        status: STATUS,
        activityDateTime: PAST_DT.toISOString(),
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it('Call activity subject === "Call Disposition - <Status>" and outcome is empty', async () => {
    await createCallLog(TENANT, OWNER_ID, OWNER_NAME, {
      source: "dialer",
      toNumber: "9888800002",
      callDispositionId: "",
      linkedLeadId: leadId,
      status: STATUS,
      activityDateTime: PAST_DT.toISOString(),
    });

    const activity = await integrationPrisma.crmActivity.findFirst({
      where: { tenantId: TENANT, type: "Call", leadId },
      orderBy: { createdAt: "desc" },
      select: { type: true, subject: true, outcome: true, ownerName: true, occurredAt: true },
    });

    expect(activity).not.toBeNull();
    expect(activity!.subject).toBe(`Call Disposition - ${STATUS}`);
    expect(activity!.outcome ?? "").toBe("");

    // The RENDERED timeline line must be the single clean string — no doubling.
    expect(activityHeadline(activity!)).toBe(`Call Disposition - ${STATUS}`);

    // Actor/time regression guard on the Option-Y save itself.
    expect(activity!.ownerName).toBe(OWNER_NAME); // proper name, not a raw id
    expect(activity!.occurredAt?.toISOString()).toBe(PAST_DT.toISOString());
  });

  it("REGRESSION (green now): existing real-disposition save records actor name + occurredAt", async () => {
    await createCallLog(TENANT, OWNER_ID, OWNER_NAME, {
      source: "dialer",
      toNumber: "9888800003",
      callDispositionId: realDispositionId,
      linkedLeadId: leadId,
      status: STATUS,
      activityDateTime: PAST_DT.toISOString(),
    });

    const activity = await integrationPrisma.crmActivity.findFirst({
      where: { tenantId: TENANT, type: "Call", leadId },
      orderBy: { createdAt: "desc" },
      select: { ownerName: true, occurredAt: true },
    });

    expect(activity).not.toBeNull();
    expect(activity!.ownerName).toBe(OWNER_NAME);
    expect(activity!.occurredAt?.toISOString()).toBe(PAST_DT.toISOString());
  });
});
