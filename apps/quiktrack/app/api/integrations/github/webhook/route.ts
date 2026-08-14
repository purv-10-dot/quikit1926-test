/**
 * POST /api/integrations/github/webhook
 *
 * Receives GitHub App webhook deliveries. This route is intentionally NOT
 * wrapped in withOrgAuth — GitHub is the caller and has no QuikTrack session.
 * It is instead authenticated by verifying the X-Hub-Signature-256 HMAC over
 * the RAW request body (a sanctioned exception, like /api/auth/*). Any request
 * that fails the signature check is rejected 401 before its payload is trusted.
 *
 * The org is resolved from the payload's installation id (looked up against
 * QtGithubInstallation) — never from a client-supplied value.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignatureFromEnv } from "@/lib/services/github/webhook-signature";
import {
  handleBranchEvent,
  handlePushEvent,
  handlePullRequestEvent,
} from "@/lib/services/github/webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RepoNode {
  id?: number;
  full_name?: string;
}

function repoRef(repo: RepoNode | undefined) {
  if (!repo?.id || !repo.full_name) return null;
  return { repoId: String(repo.id), repoFullName: repo.full_name };
}

export async function POST(req: NextRequest) {
  // Read the raw body FIRST — the HMAC is computed over these exact bytes, so
  // re-serializing parsed JSON would change them and break verification.
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignatureFromEnv(raw, signature)) {
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  const event = req.headers.get("x-github-event") ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // Resolve org from the installation id (authoritative; never trust the body
  // for tenant identity beyond this lookup).
  const installation = payload.installation as { id?: number } | undefined;
  if (!installation?.id) {
    // Events without an installation (e.g. ping) — acknowledge and ignore.
    return NextResponse.json({ success: true, data: { ignored: event } });
  }
  const inst = await db.qtGithubInstallation.findFirst({
    where: { installationId: String(installation.id), status: "ACTIVE" },
    select: { orgId: true },
  });
  if (!inst) {
    return NextResponse.json({ success: true, data: { ignored: "unknown_installation" } });
  }
  const orgId = inst.orgId;

  const repo = repoRef(payload.repository as RepoNode | undefined);
  if (!repo) {
    return NextResponse.json({ success: true, data: { ignored: "no_repo" } });
  }

  try {
    let linked = 0;
    if (event === "push") {
      const commits = (payload.commits as Parameters<typeof handlePushEvent>[2]) ?? [];
      linked = await handlePushEvent(orgId, repo, commits);
    } else if (event === "pull_request") {
      const pr = payload.pull_request as
        | (Parameters<typeof handlePullRequestEvent>[2] & { head?: { ref?: string } })
        | undefined;
      if (pr) {
        // Surface GitHub's head.ref as headRef so the handler can key off the
        // branch name when the title/body has no work-item key.
        linked = await handlePullRequestEvent(
          orgId,
          repo,
          { ...pr, headRef: pr.headRef ?? pr.head?.ref ?? null },
          String(payload.action ?? ""),
        );
      }
    } else if (event === "create" || event === "delete") {
      const refType = String(payload.ref_type ?? "");
      const ref = String(payload.ref ?? "");
      linked = await handleBranchEvent(
        orgId,
        repo,
        refType,
        ref,
        event === "create" ? "created" : "deleted",
      );
    } else {
      return NextResponse.json({ success: true, data: { ignored: event } });
    }
    return NextResponse.json({ success: true, data: { event, linked } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
