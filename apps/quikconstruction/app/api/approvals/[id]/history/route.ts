import { NextRequest, NextResponse } from "next/server";
import { listHistoryForInstance } from "@/lib/workflow/approval-history-repository";

/**
 * GET /api/approvals/:id/history
 *
 * Returns the audit trail for a single approval instance — every action
 * (approve / reject / return / reverse) recorded against it, with the
 * actor's display name. Sourced from `approval_history`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const data = await listHistoryForInstance(params.id);
  return NextResponse.json({ data });
}
