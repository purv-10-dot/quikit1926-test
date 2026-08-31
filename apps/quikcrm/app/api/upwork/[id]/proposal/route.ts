/**
 * POST /api/upwork/[id]/proposal — attach submitted-proposal data (the Connects
 * actually spent) to a captured Upwork job.
 *
 * Called by the browser extension after the user CONFIRMED, in the panel, which
 * captured job the open proposal belongs to. The job is taken from the URL path
 * and never inferred from the payload, so a mis-scrape cannot re-target the write.
 *
 * Gated on `upwork.create`, matching ai-analysis: a rep who can capture a job can
 * annotate it without being granted edit rights over the CRM copy.
 *
 * Creates no new storage and no new row: the proposal is four nullable columns on
 * the job itself, so re-extracting the same proposal overwrites them in place.
 * Nothing here participates in the (orgId, dedupeKey) duplicate guard.
 *
 * This route stores RAW Connects only. It deliberately performs no cost maths and
 * does not touch the Sales Cost module — converting Connects to currency needs a
 * cost-per-Connect rate that does not exist in the system yet.
 */

import { type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { upworkProposalSchema } from "@/lib/validators/upwork";
import { getUpworkJob, saveUpworkProposal } from "@/lib/services/upwork/upwork-service";
import {
  resolveUpworkUser,
  upworkOwnerScope,
} from "@/lib/services/upwork/resolve-upwork-user";
import { logUpworkActivity } from "@/lib/services/activities/log-upwork-activity";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await resolveUpworkUser(req);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "create");

    const existing = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
    if (!existing) return fail(404, "Upwork job not found");

    const parsed = upworkProposalSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }
    const dto = parsed.data;

    // CONNECTS COME FROM THE SELECTED CRM JOB, NOT THE PROPOSAL PAGE.
    //
    // Business rule: the Connects a proposal costs are the ones the job listing
    // stated when the job was captured, so the authoritative figure is the
    // `requiredConnects` already stored on the job the user picked in the panel
    // — `existing` above, fetched by the path id and org-scoped.
    //
    // The proposal page is deliberately NOT scraped for this: it exposes the
    // account wallet balance ("Available Connects"), which would be a
    // plausible-looking wrong answer.
    //
    // `requiredConnects` is a scraped TEXT column ("22"), so it is parsed here.
    // A non-numeric or absent value yields undefined, which leaves any stored
    // `connectsUsed` untouched rather than writing a wrong number or a 0 — "we
    // do not know" must stay distinguishable from "zero Connects were spent".
    // The column itself is only READ here and is never modified.
    const requiredConnects = Number.parseInt(existing.requiredConnects ?? "", 10);
    const connectsFromJob = Number.isFinite(requiredConnects) && requiredConnects >= 0
      ? requiredConnects
      : undefined;

    const job = await saveUpworkProposal({
      orgId: user.orgId,
      id,
      userId: user.userId,
      input: {
        proposalId: dto.proposalId,
        // Three-way, not a truthy ternary: `undefined` (Upwork showed no date)
        // must leave any stored value alone, while an explicit `null` clears it.
        // Collapsing the two would let a re-extraction that failed to read the
        // date silently wipe a good one.
        proposalSubmittedAt:
          dto.proposalSubmittedAt === undefined
            ? undefined
            : dto.proposalSubmittedAt === null
              ? null
              : new Date(dto.proposalSubmittedAt),
        // From the selected CRM job's `requiredConnects` (see above), not from
        // the request body — the extension no longer decides this figure.
        connectsUsed: connectsFromJob,
        // Unchanged: boost is still whatever the extension reported, and stays
        // separate from the base spend rather than being summed into it.
        boostConnects: dto.boostConnects,
        proposalCoverLetter: dto.proposalCoverLetter,
      },
    });
    if (!job) return fail(404, "Upwork job not found");

    // Timeline entry, logged ONLY once the save above actually returned a row —
    // a failed or 404'd save never reaches here, so no activity is written for
    // one. Reuses the same writer as UPWORK_JOB_SAVED; no new activity system.
    //
    // Non-blocking, exactly as /api/upwork POST does it: the proposal IS saved,
    // and a logging failure must not turn that into an error response.
    //
    // Re-saving the same proposal writes no second row: UPWORK_PROPOSAL_SAVED is
    // oncePerJob, so its externalId is `<jobId>:UPWORK_PROPOSAL_SAVED` and
    // logActivity() upserts on (orgId, sourceSystem, externalId).
    void logUpworkActivity({
      orgId: user.orgId,
      userId: user.userId,
      jobId: job.id,
      jobTitle: job.jobTitle,
      jobUrl: job.jobUrl,
      clientLocation: job.clientLocation,
      activityType: "UPWORK_PROPOSAL_SAVED",
    }).catch((err: unknown) =>
      console.error("[api/upwork/:id/proposal POST] logUpworkActivity failed", err),
    );

    return ok({
      jobId: job.id,
      jobTitle: job.jobTitle,
      proposalId: job.proposalId,
      connectsUsed: job.connectsUsed,
      boostConnects: job.boostConnects,
      proposalSubmittedAt: job.proposalSubmittedAt,
      // Length only, not the text: the response is logged by the extension, and
      // a cover letter is long and belongs to the client relationship.
      coverLetterLength: job.proposalCoverLetter
        ? job.proposalCoverLetter.length
        : 0,
    });
  } catch (error: unknown) {
    return failFromError(
      error,
      "api/upwork/:id/proposal POST",
      "Failed to save Upwork proposal",
    );
  }
}
