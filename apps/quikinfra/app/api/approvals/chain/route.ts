import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { resolveApproverChain, resolveNextApprover } from "@/lib/approvals/approver-chain";

/**
 * GET /api/approvals/chain
 *
 * Returns the role-based escalation chain for a given context:
 *   Site Admin (for this project) → HO User (for this module) → Admin.
 *
 * Query params:
 *   projectId? — project the request is for. Site-admin level is skipped
 *                when absent or when no site admin is assigned to that project.
 *   module?    — module key (e.g. "purchase"). HO-user level is filtered to
 *                those who have this module assigned.
 *   next=1     — when set, returns the single next approver instead of the
 *                full chain. Useful for "this PR will go to X" labels.
 *
 * Response (default):
 *   { chain: [ { level, label, candidates: [...] }, ... ] }
 * Response (next=1):
 *   { approver: { id, fullName, email, mobile, department, userType } | null }
 *
 * Callers: the PR / Indent / PO submit forms (to show the auto-resolved
 * approver), the Approvals inbox (to display routing), admin tooling.
 */
export async function GET(req: NextRequest) {
  const ctxOrResponse = await getTenantContext();
  if (!ctxOrResponse) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const ctx = ctxOrResponse;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const module = searchParams.get("module") ?? undefined;
  const nextOnly = searchParams.get("next") === "1";

  if (nextOnly) {
    const approver = await resolveNextApprover({
      orgId: ctx.orgId,
      requesterId: ctx.userId,
      projectId,
      module,
    });
    return NextResponse.json({ approver });
  }

  const chain = await resolveApproverChain({
    orgId: ctx.orgId,
    requesterId: ctx.userId,
    projectId,
    module,
  });
  return NextResponse.json({ chain });
}
