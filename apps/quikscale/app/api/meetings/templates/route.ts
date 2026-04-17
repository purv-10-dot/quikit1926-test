import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("meetings.templates");
import { createTemplateSchema } from "@/lib/schemas/meetingSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * Scaling Up / Rockefeller Habits canonical meeting templates.
 *
 * Seeded on-demand the first time a tenant visits `/api/meetings/templates`.
 * Idempotent — only creates rows that don't exist yet for this tenant.
 */
const SCALING_UP_DEFAULTS = [
  {
    name: "Daily Huddle",
    cadence: "daily",
    description:
      "5-15 min team standup. Shares yesterday's wins, today's priority, and stuck issues.",
    duration: 15,
    sections: [
      "Good news / wins",
      "Today's priority",
      "Stuck issues / blockers",
      "Daily KPI check",
    ],
  },
  {
    name: "Weekly Meeting",
    cadence: "weekly",
    description:
      "60-90 min per team. Review KPIs, customer & employee data, unblock issues, generate WWW items.",
    duration: 90,
    sections: [
      "Good news (5 min)",
      "KPI review (15 min)",
      "Customer feedback data (10 min)",
      "Employee feedback data (10 min)",
      "Priority progress (15 min)",
      "Stuck issues / one big idea (20 min)",
      "WWW — who/what/when (15 min)",
      "One-phrase close",
    ],
  },
  {
    name: "Monthly Management Meeting",
    cadence: "monthly",
    description:
      "Half-day learning session. Culture check-in, skill-building, coaching topic, open Q&A.",
    duration: 240,
    sections: [
      "Culture check-in (30 min)",
      "Financial / KPI trend review (30 min)",
      "Skill-building / training (90 min)",
      "Coaching topic / case study (45 min)",
      "Open Q&A / announcements (45 min)",
    ],
  },
  {
    name: "Quarterly Offsite",
    cadence: "quarterly",
    description:
      "1-2 day strategic review. Close out prior quarter, set new priorities, update OPSP, align on the next 13 weeks.",
    duration: 480,
    sections: [
      "Prior quarter review — what worked / what didn't (60 min)",
      "KPI scorecard deep dive (60 min)",
      "Priority / rock close-out (60 min)",
      "People & culture check-in (45 min)",
      "New quarterly priorities (90 min)",
      "OPSP review & update (60 min)",
      "Theme / one-phrase for next quarter (30 min)",
      "Who-What-When commitments (30 min)",
    ],
  },
  {
    name: "Annual Planning",
    cadence: "annual",
    description:
      "1-3 day offsite. Refresh 3-5 year vision, update BHAG, set 1-year goals, decide quarterly themes.",
    duration: 1440,
    sections: [
      "Year in review (120 min)",
      "3-5 year vision refresh (120 min)",
      "BHAG check & update (90 min)",
      "Core values alignment (60 min)",
      "1-year goals & brand promise (180 min)",
      "Q1 priorities kick-off (120 min)",
      "Quarterly themes (90 min)",
      "Commitments & accountability (60 min)",
    ],
  },
] as const;

async function seedIfEmpty(tenantId: string, userId: string) {
  const existingCount = await db.meetingTemplate.count({ where: { tenantId } });
  if (existingCount > 0) return;

  await db.meetingTemplate.createMany({
    data: SCALING_UP_DEFAULTS.map((t) => ({
      tenantId,
      name: t.name,
      cadence: t.cadence,
      description: t.description,
      sections: [...t.sections],
      defaultAttendees: [],
      duration: t.duration,
      createdBy: userId,
    })),
  });
}

/**
 * GET /api/meetings/templates — list all templates for the tenant.
 *
 * If the tenant has NO templates yet, seeds the 5 Scaling Up defaults on
 * the fly so new tenants get a working starting point without a separate
 * onboarding step. Subsequent calls return whatever the tenant has.
 */
export const GET = withTenantAuth(
  async ({ tenantId, userId }) => {
    await seedIfEmpty(tenantId, userId);

    const templates = await db.meetingTemplate.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        cadence: true,
        description: true,
        sections: true,
        defaultAttendees: true,
        duration: true,
        createdAt: true,
      },
      orderBy: [
        // Order by cadence frequency: daily → annual
        { cadence: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json({ success: true, data: templates });
  },
  { fallbackErrorMessage: "Failed to fetch meeting templates" },
);

/**
 * POST /api/meetings/templates — create a custom template.
 */
export const POST = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const parsed = createTemplateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const template = await db.meetingTemplate.create({
      data: {
        tenantId,
        name: input.name,
        cadence: input.cadence,
        description: input.description ?? null,
        sections: input.sections,
        defaultAttendees: input.defaultAttendees,
        duration: input.duration,
        createdBy: userId,
      },
      select: {
        id: true,
        name: true,
        cadence: true,
        description: true,
        sections: true,
        duration: true,
      },
    });

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "CREATE",
      entityType: "Meeting",
      entityId: template.id,
      newValues: template,
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  },
  { fallbackErrorMessage: "Failed to create meeting template" },
);
