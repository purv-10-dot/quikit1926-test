import type { ActionContext, StepResult } from "./types";

/**
 * Action executor registry.
 *
 * `create_priority` and `notify_owner` are REAL — they call QuikScale's
 * internal, service-authed action endpoints (see
 * apps/quikscale/app/api/internal/actions/*). The remaining action ids are
 * still simulated. New real executors register here without touching the
 * runner (Open/Closed).
 */

export type ActionExecutor = (ctx: ActionContext) => Promise<StepResult>;

/** Default simulated executor — records the action id + config as output. */
const simulate: ActionExecutor = async (ctx) => {
  const actionId = (ctx.node.config?.actionId as string) ?? ctx.node.kind;
  return {
    status: "ok",
    output: {
      simulated: true,
      actionId,
      label: ctx.node.label ?? actionId,
      note: "Simulated — no external side effects.",
      event: ctx.event.event,
      app: ctx.event.app,
    },
  };
};

/** POST to a QuikScale internal action endpoint with the shared service secret. */
async function callQuikScale(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const base = process.env.QUIKSCALE_URL;
  const secret = process.env.INTERNAL_SECRET;
  if (!base || !secret) return { ok: false, error: "QUIKSCALE_URL / INTERNAL_SECRET not configured" };
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown>; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? `QuikScale responded ${res.status}` };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "QuikScale call failed" };
  }
}

/** Resolve the KPI owner from event data (individual owner, else first team owner). */
function resolveOwner(data: Record<string, unknown>): string | null {
  if (typeof data.ownerId === "string" && data.ownerId) return data.ownerId;
  if (Array.isArray(data.ownerIds) && typeof data.ownerIds[0] === "string") return data.ownerIds[0];
  return null;
}

/** REAL: create a QuikScale priority from the triggering KPI. */
const createPriority: ActionExecutor = async (ctx) => {
  const d = ctx.event.data;
  const owner = resolveOwner(d);
  const quarter = d.quarter;
  const year = d.year;
  // Manual "Run now" (or a non-KPI event) has no KPI context → skip cleanly.
  if (!owner || typeof quarter !== "string" || typeof year !== "number") {
    return { status: "ok", output: { skipped: true, reason: "No KPI owner/quarter/year in event (e.g. manual Run now)" } };
  }
  const kpiName = typeof d.name === "string" ? d.name : "KPI";
  const res = await callQuikScale("/api/internal/actions/create-priority", {
    orgId: ctx.orgId,
    actorId: owner,
    name: `Recover KPI: ${kpiName}`,
    owner,
    quarter,
    year,
    teamId: typeof d.teamId === "string" ? d.teamId : null,
    relatedKpiId: typeof d.kpiId === "string" ? d.kpiId : null,
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { created: true, priorityId: res.data?.id, name: `Recover KPI: ${kpiName}` } };
};

/** REAL: write an in-app notification to the KPI owner. */
const notifyOwner: ActionExecutor = async (ctx) => {
  const d = ctx.event.data;
  const owner = resolveOwner(d);
  if (!owner) {
    return { status: "ok", output: { skipped: true, reason: "No KPI owner in event (e.g. manual Run now)" } };
  }
  const kpiName = typeof d.name === "string" ? d.name : "KPI";
  const value = d.value ?? "?";
  const target = d.target ?? "?";
  const res = await callQuikScale("/api/internal/actions/notify", {
    orgId: ctx.orgId,
    userId: owner,
    title: `KPI below target: ${kpiName}`,
    message: `${kpiName} is below target (value ${value} vs target ${target}).`,
    relatedEntityId: typeof d.kpiId === "string" ? d.kpiId : null,
    relatedEntityType: "KPI",
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { notified: true, notificationId: res.data?.id, userId: owner } };
};

const REGISTRY: Record<string, ActionExecutor> = {
  notify_owner: notifyOwner,
  create_priority: createPriority,
  "notify.email.send": simulate,
  "notify.slack.send": simulate,
  "notify.teams.send": simulate,
  "kpi.update": simulate,
};

/** Resolve an executor for an action id, falling back to the simulator. */
export function getActionExecutor(actionId: string | undefined): ActionExecutor {
  if (actionId && REGISTRY[actionId]) return REGISTRY[actionId];
  return simulate;
}
