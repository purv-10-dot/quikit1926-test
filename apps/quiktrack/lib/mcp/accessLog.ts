/**
 * QUIKTR-119 — MCP access-decision audit log. Writes one row per gate check
 * (both allow and deny, not just denials) to QtMcpAccessLog so there's a
 * full request trail for security review.
 *
 * Never lets a logging failure break the actual tool call — e.g. if the
 * QtMcpAccessLog migration (packages/database/prisma/migrations/
 * 20260813120000_quiktrack_mcp_access_log) hasn't been applied to this
 * database yet. Falls back to a structured console line so the decision is
 * still observable even then.
 */
import { db } from "@/lib/db";

export interface AccessLogEntry {
  orgId: string;
  userId: string;
  projectId: string | null;
  tool: string;
  resource?: string;
  action?: string;
  decision: "allow" | "deny";
  reason: string;
}

export async function logAccessDecision(entry: AccessLogEntry): Promise<void> {
  try {
    await db.qtMcpAccessLog.create({
      data: {
        orgId: entry.orgId,
        userId: entry.userId,
        projectId: entry.projectId,
        tool: entry.tool,
        resource: entry.resource ?? null,
        action: entry.action ?? null,
        decision: entry.decision,
        reason: entry.reason,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        at: "mcp.access.log_failed",
        ...entry,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
