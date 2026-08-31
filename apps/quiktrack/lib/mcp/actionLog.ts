/**
 * QUIKTR-121 — MCP action audit log. Writes one row per mutating MCP tool
 * invocation to QtMcpActionLog, with the entity/payload/before-after
 * diff/result data QtMcpAccessLog (QUIKTR-119) doesn't carry.
 *
 * Never lets a logging failure break the actual tool call — e.g. if the
 * QtMcpActionLog migration (packages/database/prisma/migrations/
 * 20260817100000_quiktrack_mcp_action_log) hasn't been applied to this
 * database yet. Falls back to a structured console line so the action is
 * still observable even then.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const SENSITIVE_KEY = /token|secret|password|apikey|api_key|credential|authorization/i;

/** Defensive key-based redaction — none of today's write tools' params are
 *  credential-shaped, but this guards against a future field addition. */
function sanitize(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      SENSITIVE_KEY.test(k) ? [k, "[REDACTED]"] : [k, sanitize(v)],
    ),
  );
}

export interface ActionLogEntry {
  orgId: string;
  userId: string;
  actorType: "user" | "agent";
  projectId: string | null;
  tool: string;
  action: "CREATE" | "UPDATE" | "MOVE" | "DELETE";
  entityType: string;
  entityId: string | null;
  entityKey: string | null;
  payload?: unknown;
  before?: unknown;
  after?: unknown;
  result: "success" | "error";
  errorMessage?: string;
}

export async function logMcpAction(entry: ActionLogEntry): Promise<void> {
  try {
    await db.qtMcpActionLog.create({
      data: {
        orgId: entry.orgId,
        userId: entry.userId,
        actorType: entry.actorType,
        projectId: entry.projectId,
        tool: entry.tool,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityKey: entry.entityKey,
        payload: sanitize(entry.payload) as Prisma.InputJsonValue | undefined,
        before: sanitize(entry.before) as Prisma.InputJsonValue | undefined,
        after: sanitize(entry.after) as Prisma.InputJsonValue | undefined,
        result: entry.result,
        errorMessage: entry.errorMessage ?? null,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        at: "mcp.action.log_failed",
        tool: entry.tool,
        entityId: entry.entityId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
