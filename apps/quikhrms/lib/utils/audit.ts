import { prisma } from "@/lib/prisma";

interface AuditParams {
  orgId: string;
  userId: string;
  action: "Create" | "Update" | "Delete" | "Login" | "Logout" | "Export" | "Import" | "Approve" | "Reject" | "StatusChange";
  entityType: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  /**
   * Pass the incoming Request to auto-extract IP (x-forwarded-for / x-real-ip / cf-connecting-ip)
   * and User-Agent. Explicit ipAddress / userAgent always win.
   */
  request?: Request;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /**
   * Actor attribution (P2-1). Pass the route's AuthContext (it structurally
   * satisfies this) or just the actor fields. When `actorType === "ai_agent"`
   * — i.e. the AI Runtime acted on the employee's behalf via withServiceAuth —
   * the agent identity is stamped into metadata as
   * `metadata.actor = { type: "ai_agent", agentId }`, so AI-triggered
   * mutations are distinguishable from human ones in the audit trail. `userId`
   * remains the acting employee either way. Omit for normal user actions.
   */
  actor?: { actorType?: "user" | "ai_agent"; actingAgentId?: string };
}

function extractIp(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-client-ip") ??
    undefined
  );
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    const ip = params.ipAddress ?? (params.request ? extractIp(params.request) : undefined);
    const ua = params.userAgent ?? params.request?.headers.get("user-agent") ?? undefined;

    let changes = params.changes;
    if (!changes && params.before && params.after) {
      changes = diff(params.before, params.after) as Record<string, unknown>;
    } else if (params.before && params.after) {
      changes = { ...changes, _diff: diff(params.before, params.after) };
    }

    // Stamp agent attribution into metadata for AI-triggered mutations (P2-1),
    // leaving normal user actions' metadata untouched.
    let metadata = params.metadata;
    if (params.actor?.actorType === "ai_agent") {
      metadata = {
        ...metadata,
        actor: { type: "ai_agent", agentId: params.actor.actingAgentId ?? "unknown-agent" },
      };
    }

    await prisma.hrmsAuditLog.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: changes ? JSON.parse(JSON.stringify(changes)) : undefined,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        ipAddress: ip,
        userAgent: ua ?? undefined,
      },
    });
  } catch (error) {
    console.error("Audit log creation failed:", error);
  }
}
