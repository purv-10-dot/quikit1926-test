/**
 * POST /api/prospects — create a prospect from the CRM UI.
 *
 * Prospects were previously only creatable by the LinkedIn extension
 * (/api/leads/from-linkedin, Bearer-authed and keyed on linkedinUrl). This is
 * the cookie-session counterpart used by the shared prospect form, so any
 * in-app entry point — the Upwork "Convert to Prospect" flow today, a plain
 * "New Prospect" button tomorrow — goes through one validated path.
 *
 * Upwork conversion specifics:
 *   - `upworkJobId` is a REFERENCE. The job row is never modified or deleted
 *     here, and none of its fields are copied onto the prospect beyond what the
 *     user submitted in the form.
 *   - The job must belong to the caller's org, or the reference is rejected.
 *   - One prospect per job: pre-checked for a friendly message, and guaranteed
 *     by @@unique([orgId, upworkJobId]) under concurrent clicks.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createProspectSchema } from "@/lib/validators/prospect";
import { logUpworkActivity } from "@/lib/services/activities/log-upwork-activity";

export const runtime = "nodejs";

function fail(status: number, error: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Prospects are surfaced under the Leads module in this app's navigation,
    // so creation is gated on the same permission the Prospects screen uses.
    await assertModule(user, "leads", "create");

    const parsed = createProspectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const fieldErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat)) if (v?.length) fieldErrors[k] = v[0]!;
      return fail(400, "Validation failed", fieldErrors);
    }
    const input = parsed.data;

    // ── Upwork origin: verify + duplicate guard ──────────────────────────────
    // Held for the conversion activity below, so the timeline entry can name the
    // job without a second query.
    let upworkJob: { id: string; jobTitle: string; jobUrl: string | null } | null = null;

    if (input.upworkJobId) {
      // Org check first. A job id from another tenant must not be linkable, and
      // must not reveal that it exists.
      const job = await prisma.crmUpworkJob.findFirst({
        where: { id: input.upworkJobId, orgId: user.orgId, deletedAt: null },
        select: { id: true, jobTitle: true, jobUrl: true },
      });
      if (!job) return fail(404, "Upwork job not found");
      upworkJob = job;

      // Org-wide, not owner-scoped: a job converted by a colleague is still
      // converted, and a second prospect for it would break the 1:1 reference.
      const existing = await prisma.crmProspect.findFirst({
        where: { orgId: user.orgId, upworkJobId: input.upworkJobId },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: "This Upwork job has already been converted to a prospect.",
            data: { prospectId: existing.id, prospectName: existing.name },
          },
          { status: 409 },
        );
      }
    }

    if (input.icpId) {
      const icp = await prisma.crmIcpProfile.findFirst({
        where: { id: input.icpId, orgId: user.orgId },
        select: { id: true },
      });
      if (!icp) return fail(400, "Selected ICP was not found", { icpId: "Unknown ICP" });
    }

    try {
      const prospect = await prisma.crmProspect.create({
        data: {
          orgId: user.orgId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          title: input.title ?? null,
          company: input.company ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          shortSummary: input.shortSummary ?? null,
          icpId: input.icpId ?? null,
          upworkJobId: input.upworkJobId ?? null,
          savedById: user.userId,
          savedByName: user.name || user.email || null,
        },
        select: { id: true, name: true, upworkJobId: true },
      });

      // Conversion activity. Only for Upwork-originated prospects — a plain
      // prospect creation is not a conversion and gets no row.
      //
      // Goes through the SAME shared logActivity path as every other Upwork
      // activity, so it counts toward Activity Targets and appears on the job's
      // timeline. Idempotent on <jobId>:UPWORK_CONVERTED_TO_PROSPECT, and the
      // conversion itself is already one-per-job, so it cannot duplicate.
      //
      // Non-blocking, matching the capture activity: the prospect IS created,
      // and a logging failure must not turn that into an error response.
      if (upworkJob) {
        void logUpworkActivity({
          orgId: user.orgId,
          userId: user.userId,
          jobId: upworkJob.id,
          jobTitle: upworkJob.jobTitle,
          jobUrl: upworkJob.jobUrl,
          activityType: "UPWORK_CONVERTED_TO_PROSPECT",
          prospect: { id: prospect.id, name: prospect.name },
        }).catch((err: unknown) =>
          console.error("[api/prospects POST] logUpworkActivity failed", err),
        );
      }

      return NextResponse.json({ success: true, data: prospect }, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        // Lost the race on the Upwork guard — resolve to the winner.
        if (target.includes("upwork") && input.upworkJobId) {
          const winner = await prisma.crmProspect.findFirst({
            where: { orgId: user.orgId, upworkJobId: input.upworkJobId },
            select: { id: true, name: true },
          });
          return NextResponse.json(
            {
              success: false,
              error: "This Upwork job has already been converted to a prospect.",
              data: winner ? { prospectId: winner.id, prospectName: winner.name } : undefined,
            },
            { status: 409 },
          );
        }
        if (target.includes("linkedin")) {
          return fail(409, "A prospect with this LinkedIn URL already exists.", {
            linkedinUrl: "Already used by another prospect",
          });
        }
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
