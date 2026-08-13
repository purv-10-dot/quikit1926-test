import { db } from "@/lib/db";

/**
 * Derives a human-readable trigger label from a workflow's `trigger` JSON.
 * Shape: { type: "event" | "cron" | "webhook", app?, event?, label? }.
 */
export function triggerLabel(trigger: unknown): string | null {
  if (!trigger || typeof trigger !== "object") return null;
  const t = trigger as Record<string, unknown>;
  if (typeof t.label === "string" && t.label) return t.label;
  if (typeof t.event === "string" && t.event) return t.event;
  if (t.type === "cron" && typeof t.cron === "string") return `Schedule · ${t.cron}`;
  if (typeof t.type === "string") return String(t.type);
  return null;
}

/**
 * Derives the primary action label from a workflow's `graphNodes` JSON —
 * the label of the first node whose kind is "action".
 */
export function actionLabel(graphNodes: unknown): string | null {
  if (!Array.isArray(graphNodes)) return null;
  const action = graphNodes.find(
    (n) => n && typeof n === "object" && (n as Record<string, unknown>).kind === "action",
  ) as Record<string, unknown> | undefined;
  if (action && typeof action.label === "string") return action.label;
  const count = graphNodes.filter(
    (n) => n && typeof n === "object" && (n as Record<string, unknown>).kind === "action",
  ).length;
  return count > 0 ? `${count} action${count > 1 ? "s" : ""}` : null;
}

/**
 * Resolves display names for a set of user ids (cross-schema lookup into the
 * `auth` User table). Returns a Map keyed by userId.
 */
export async function resolveOwnerNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(
    users.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unknown",
    ]),
  );
}
