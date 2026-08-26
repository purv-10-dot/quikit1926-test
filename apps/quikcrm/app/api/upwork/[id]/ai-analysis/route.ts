/**
 * POST /api/upwork/[id]/ai-analysis — attach the Upwork AI chain's output to a
 * captured job.
 *
 * Called by the browser extension right after its AI step returns. Separate from
 * PATCH /api/upwork/[id] because it is a different actor writing a different
 * kind of data, and it is gated on `upwork.create` rather than `upwork.edit`:
 * a rep who can capture a job can annotate the row they just created, without
 * being granted edit rights over the CRM copy.
 *
 * The AI step is optional and skippable in the panel, so a partial payload — or
 * no call at all — is a normal outcome, not an error.
 */

import { type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { upworkAiAnalysisSchema } from "@/lib/validators/upwork";
import {
  getUpworkJob,
  saveUpworkAiAnalysis,
} from "@/lib/services/upwork/upwork-service";
import {
  resolveUpworkUser,
  upworkOwnerScope,
} from "@/lib/services/upwork/resolve-upwork-user";
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

    const body = await req.json().catch(() => null);
    const parsed = upworkAiAnalysisSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    const job = await saveUpworkAiAnalysis({
      orgId: user.orgId,
      id,
      userId: user.userId,
      input: parsed.data,
    });
    if (!job) return fail(404, "Upwork job not found");
    return ok(job);
  } catch (error: unknown) {
    return failFromError(
      error,
      "api/upwork/:id/ai-analysis POST",
      "Failed to save AI analysis",
    );
  }
}
