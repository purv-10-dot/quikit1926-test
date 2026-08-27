/**
 * POST /api/upwork/[id]/conversation — save an Upwork Messages thread against a
 * captured job.
 *
 * Called by the browser extension after the user has CONFIRMED, in the panel,
 * which captured job the open Messages room belongs to. Upwork's message room
 * does not reliably expose the job ticket id, so the association is a human
 * decision; this route therefore takes the job from the URL path and never
 * infers it from the payload.
 *
 * Gated on `upwork.create` for the same reason as ai-analysis: a rep who can
 * capture a job can annotate it, without being granted edit rights over the CRM
 * copy.
 *
 * Creates no new storage. Each message becomes an ordinary standalone
 * CrmActivity carrying the `<jobId>:` externalId prefix, so the whole thread
 * appears on the job's existing timeline and counts toward Activity Targets like
 * any other activity. Re-posting the same thread upserts the same rows (see
 * buildUpworkMessageExternalId), so extraction is safe to repeat.
 */

import { type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { upworkConversationSchema } from "@/lib/validators/upwork";
import { getUpworkJob } from "@/lib/services/upwork/upwork-service";
import {
  resolveUpworkUser,
  upworkOwnerScope,
} from "@/lib/services/upwork/resolve-upwork-user";
import { logUpworkConversationMessage } from "@/lib/services/activities/log-upwork-activity";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await resolveUpworkUser(req);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "create");

    const job = await getUpworkJob(user.orgId, id, upworkOwnerScope(user));
    if (!job) return fail(404, "Upwork job not found");

    const parsed = upworkConversationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }
    const dto = parsed.data;

    // Drop messages that repeat an id within one payload. Upwork's virtualized
    // list can render the same node twice mid-scroll; without this the upsert
    // would fire twice for one row in a single request, which Postgres rejects
    // inside a batch rather than silently collapsing.
    const seen = new Set<string>();
    const messages = dto.messages.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sequential, not Promise.all: these are upserts on one unique index, and a
    // concurrent batch on the same key deadlocks under load. A thread is at most
    // a few hundred rows, so ordering costs little and keeps failures attributable.
    let saved = 0;
    const failures: string[] = [];
    for (const message of messages) {
      try {
        await logUpworkConversationMessage({
          orgId: user.orgId,
          userId: user.userId,
          jobId: job.id,
          jobTitle: job.jobTitle,
          message: {
            id: message.id,
            text: message.text,
            senderName: message.senderName ?? null,
            senderType: message.senderType ?? null,
            sentAt: message.sentAt ? new Date(message.sentAt) : null,
            order: message.order ?? null,
          },
          conversation: {
            threadId: dto.threadId ?? null,
            url: dto.conversationUrl ?? null,
            clientName: dto.clientName ?? null,
          },
        });
        saved += 1;
      } catch (err: unknown) {
        // Never swallowed: a per-message failure is logged and reported back in
        // the response so the panel can say "8 of 10 saved" instead of claiming
        // success. One bad message must not lose the other nine.
        console.error(
          "[api/upwork/:id/conversation] message save failed",
          { jobId: job.id, messageId: message.id },
          err,
        );
        failures.push(message.id);
      }
    }

    if (saved === 0) {
      return fail(500, "Could not save any messages from this conversation.");
    }

    return ok({
      jobId: job.id,
      jobTitle: job.jobTitle,
      received: dto.messages.length,
      saved,
      failed: failures.length,
    });
  } catch (error: unknown) {
    return failFromError(
      error,
      "api/upwork/:id/conversation POST",
      "Failed to save Upwork conversation",
    );
  }
}
