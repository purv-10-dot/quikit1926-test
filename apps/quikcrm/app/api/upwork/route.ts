/**
 * GET  /api/upwork  — list captured Upwork jobs (paginated, searchable)
 * POST /api/upwork  — capture a scraped job ("Add to CRM" in the extension)
 *
 * Auth/permission pattern cloned from /api/icp: resolve caller → assertModule →
 * validate → org-scoped service call.
 *
 * POST is the endpoint the Upwork browser extension calls, so both verbs accept
 * EITHER a cookie session (CRM UI) or the extension's Bearer token — see
 * resolveUpworkUser.
 *
 * This route never touches CrmLead / CrmProspect / CrmAccount / CrmContact /
 * CrmOpportunity. Captured jobs live only in CrmUpworkJob.
 */

import { type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createUpworkJobSchema,
  listUpworkJobsQuerySchema,
} from "@/lib/validators/upwork";
import { createUpworkJob, listUpworkJobs } from "@/lib/services/upwork/upwork-service";
import {
  resolveUpworkUser,
  upworkOwnerScope,
} from "@/lib/services/upwork/resolve-upwork-user";
import { logUpworkActivity } from "@/lib/services/activities/log-upwork-activity";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const user = await resolveUpworkUser(req, searchParams.get("orgId") ?? undefined);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "view");

    const parsed = listUpworkJobsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listUpworkJobs({
      orgId: user.orgId,
      ownerUserId: upworkOwnerScope(user),
      ...parsed.data,
    });
    return ok(result);
  } catch (error: unknown) {
    return failFromError(error, "api/upwork GET", "Failed to list Upwork jobs");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return fail(400, "Invalid JSON body");
    }

    const requestedOrgId =
      typeof (body as { orgId?: unknown }).orgId === "string"
        ? (body as { orgId: string }).orgId
        : undefined;

    const user = await resolveUpworkUser(req, requestedOrgId);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "create");

    const parsed = createUpworkJobSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    const { job, duplicate } = await createUpworkJob({
      orgId: user.orgId,
      userId: user.userId,
      input: parsed.data,
    });

    // Log a CRM activity for the capture, so it counts toward the saver's
    // activity total (Activity Targets and the dashboards count CrmActivity rows
    // by orgId + occurredAt + owner with no type whitelist, so this is picked up
    // automatically) and appears on the job's timeline.
    //
    // Skipped entirely on a duplicate: the job already exists, so re-adding it is
    // not a new piece of work and must not inflate anyone's activity count. The
    // externalId upsert in logActivity() would collapse the row anyway — this is
    // the cheaper, more explicit guard.
    //
    // Non-blocking, exactly as /api/leads/from-linkedin does it: the job IS
    // saved, and a logging failure must not turn that into an error response.
    if (!duplicate) {
      void logUpworkActivity({
        orgId: user.orgId,
        userId: user.userId,
        jobId: job.id,
        jobTitle: job.jobTitle,
        jobUrl: job.jobUrl,
        clientLocation: job.clientLocation,
        activityType: "UPWORK_JOB_SAVED",
      }).catch((err: unknown) =>
        console.error("[api/upwork POST] logUpworkActivity failed", err),
      );
    }

    // A duplicate is a successful, idempotent outcome — 200 with the existing
    // row, so the extension can say "already in CRM" and link to it. Only a
    // genuinely new row gets 201.
    return ok({ job, duplicate }, { status: duplicate ? 200 : 201 });
  } catch (error: unknown) {
    return failFromError(error, "api/upwork POST", "Failed to save Upwork job");
  }
}
