/**
 * Reusable audit service.
 *
 * One call records a single business action as an `AuditEvent` plus a batch of
 * `AuditChange` rows (only the changed fields). Designed so any API route can
 * adopt it without duplicating diff/insert logic:
 *
 *   await audit.log({
 *     entityType: "KPI",
 *     entityId: kpi.id,
 *     action: "UPDATE",
 *     before: existingKPI,
 *     after: updatedKPI,
 *     actor: { userId, orgId, teamId },
 *     diffOptions: { exclude: KPI_AUDIT_EXCLUDE },
 *     ...requestContext(req),
 *   });
 *
 * Audit failures are swallowed (logged, never thrown) so a logging glitch can
 * never break the primary mutation — matching the existing writeAuditLog
 * contract. Pass `tx` to make the audit write atomic with the mutation.
 */
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { toAuditInfo } from "@/lib/api/auditUsers";
import { diffFields, type DiffOptions, type FieldChange } from "./diff";
import type { AuditAction } from "./actions";

export type AuditSource = "web" | "api" | "system" | "import";

export interface AuditActor {
  userId: string;
  orgId: string;
  teamId?: string | null;
  /** Pre-resolved display name. When omitted, resolved from the DB once. */
  name?: string | null;
}

export interface AuditLogParams {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actor: AuditActor;
  /** Diffed against `after` to produce AuditChange rows. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Explicit changes; when provided, `before`/`after` are not diffed. */
  changes?: FieldChange[];
  diffOptions?: DiffOptions;
  source?: AuditSource;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Optional full post-state snapshot for forensics. */
  snapshot?: unknown;
  /** Transaction client to make the audit write atomic with the mutation. */
  tx?: Prisma.TransactionClient;
  /** Skip writing when there are zero field changes (default false). */
  skipIfNoChanges?: boolean;
}

type DbLike = Pick<typeof db, "auditEvent"> & { user: typeof db.user };

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

async function resolveActorName(
  client: DbLike,
  actor: AuditActor,
): Promise<string> {
  if (actor.name && actor.name.trim()) return actor.name.trim();
  try {
    const user = await client.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true },
    });
    return toAuditInfo(user?.firstName, user?.lastName).name;
  } catch {
    return "—";
  }
}

/** Extract IP + user-agent from a request, normalized to null when unknown. */
export function requestContext(req: {
  headers: { get(name: string): string | null };
}): { ipAddress: string | null; userAgent: string | null } {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : req.headers.get("x-real-ip")?.trim();
  return {
    ipAddress: ip && ip.length > 0 ? ip : null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const audit = {
  /**
   * Record one audit event. Returns the new AuditEvent id, or null if the
   * write was skipped (no changes) or failed (failures are never thrown).
   */
  async log(params: AuditLogParams): Promise<string | null> {
    try {
      const client = (params.tx ?? db) as unknown as DbLike;

      const changes =
        params.changes ??
        diffFields(params.before ?? {}, params.after ?? {}, params.diffOptions);

      if (params.skipIfNoChanges && changes.length === 0) return null;

      const actorName = await resolveActorName(client, params.actor);

      const event = await client.auditEvent.create({
        data: {
          orgId: params.actor.orgId,
          teamId: params.actor.teamId ?? null,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          actorUserId: params.actor.userId,
          actorName,
          source: params.source ?? "web",
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          reason: params.reason ?? null,
          snapshot:
            params.snapshot === undefined ? Prisma.JsonNull : toJson(params.snapshot),
          changes:
            changes.length > 0
              ? {
                  createMany: {
                    data: changes.map((c) => ({
                      fieldName: c.fieldName,
                      oldValue: toJson(c.oldValue),
                      newValue: toJson(c.newValue),
                    })),
                  },
                }
              : undefined,
        },
        select: { id: true },
      });
      return event.id;
    } catch (error) {
      // Never bubble — a compliance-log glitch must not break the mutation.
      // eslint-disable-next-line no-console
      console.error("[audit.log] failed:", error);
      return null;
    }
  },
};
