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

    await prisma.hrmsAuditLog.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: changes ? JSON.parse(JSON.stringify(changes)) : undefined,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
        ipAddress: ip,
        userAgent: ua ?? undefined,
      },
    });
  } catch (error) {
    console.error("Audit log creation failed:", error);
  }
}
