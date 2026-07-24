import type { ActionContext, StepResult } from "./types";
import { moduleForEvent } from "@/lib/catalog";

/**
 * Action executor registry.
 *
 * `create_priority`, `notify_owner`, `create_www`, and the record-mutation
 * actions (priority.complete / www.complete / priority.reassign) are REAL —
 * they call QuikScale's internal, service-authed action endpoints (see
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

/** First non-empty string among candidates. */
function firstString(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return null;
}

/**
 * REAL: create a QuikScale WWW action item. Prefers the node's resolved params
 * (what / owner / when — with {{tokens}} + relative dates already resolved by
 * the runner), falling back to sensible values derived from the trigger record
 * so a param-less action still does something useful.
 */
const createWww: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const d = ctx.event.data;
  const owner = firstString(p.owner, d.owner, d.ownerId, resolveOwner(d) ?? undefined);
  if (!owner) {
    return { status: "ok", output: { skipped: true, reason: "No owner resolved for WWW item" } };
  }
  const sourceName = firstString(d.name) ?? "item";
  const what = firstString(p.what) ?? `Follow up: ${sourceName}`;
  // Default due date = +7 days when the param didn't supply one.
  const when =
    firstString(p.when) ?? new Date(Date.now() + 7 * 86_400_000).toISOString();

  const res = await callQuikScale("/api/internal/actions/create-www", {
    orgId: ctx.orgId,
    actorId: owner,
    who: owner,
    what,
    when,
    category: firstString(p.category),
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { created: true, wwwId: res.data?.id, what } };
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

/**
 * Resolve the target record id for a mutation action: an explicit param
 * (recordId / <module>Id) wins; otherwise the triggering record when the
 * trigger's own module matches the action's module.
 */
function resolveTargetId(ctx: ActionContext, moduleKey: string): string | null {
  const p = ctx.params ?? {};
  const explicit = firstString(p.recordId, p[`${moduleKey}Id`], p.priority_id, p.www_id);
  if (explicit) return explicit;
  const triggerModule = moduleForEvent(ctx.event.event)?.key;
  if (triggerModule === moduleKey) {
    const d = ctx.event.data;
    return firstString(d.recordId, d[`${moduleKey}Id`], d.id);
  }
  return null;
}

/** Actor for automation writes — the resolved owner, else a system principal. */
function actorFor(ctx: ActionContext): string {
  return resolveOwner(ctx.event.data) ?? firstString(ctx.event.data.ownerId) ?? "system:quikflow";
}

/** POST a whitelisted patch to QuikScale's generic update-record endpoint. */
async function updateRecord(
  ctx: ActionContext,
  moduleKey: "priority" | "www" | "goal",
  recordId: string,
  patch: { status?: string; owner?: string },
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  return callQuikScale("/api/internal/actions/update-record", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    module: moduleKey,
    recordId,
    patch,
  });
}

/** REAL: mark the triggering (or param-specified) Priority complete. */
const completePriority: ActionExecutor = async (ctx) => {
  const id = resolveTargetId(ctx, "priority");
  if (!id) return { status: "ok", output: { skipped: true, reason: "No target priority to complete" } };
  const res = await updateRecord(ctx, "priority", id, { status: "completed" });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { completed: true, priorityId: id } };
};

/** REAL: mark the triggering (or param-specified) WWW item complete. */
const completeWww: ActionExecutor = async (ctx) => {
  const id = resolveTargetId(ctx, "www");
  if (!id) return { status: "ok", output: { skipped: true, reason: "No target WWW item to complete" } };
  const res = await updateRecord(ctx, "www", id, { status: "completed" });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { completed: true, wwwId: id } };
};

/** REAL: reassign the triggering (or param-specified) Priority to a new owner. */
const reassignPriority: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const owner = firstString(p.owner, p.new_owner_id, p.userId);
  if (!owner) return { status: "ok", output: { skipped: true, reason: "No new owner provided" } };
  const id = resolveTargetId(ctx, "priority");
  if (!id) return { status: "ok", output: { skipped: true, reason: "No target priority to reassign" } };
  const res = await updateRecord(ctx, "priority", id, { owner });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { reassigned: true, priorityId: id, owner } };
};

/** Cloud metadata IP — blocked to avoid the most common SSRF target. */
const METADATA_IP = "169.254.169.254";

/** Basic egress guard for outbound webhooks (scheme + metadata host). */
function isAllowedWebhookUrl(raw: string): { ok: boolean; error?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid webhook URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "Webhook URL must be http(s)" };
  }
  if (u.hostname === METADATA_IP) return { ok: false, error: "Webhook host is not allowed" };
  return { ok: true };
}

/**
 * REAL: POST to an external webhook (Data-Level Design "http_request" / Zapier
 * hook). Runs in the engine itself — no QuikScale hop. `payload` defaults to a
 * standard event envelope; params are already token-resolved by the runner, so
 * `{{trigger.kpi.name}}` etc. work inside the body. 10s timeout; captures the
 * response status + a snippet for Run History.
 */
const postWebhook: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const url = firstString(p.url);
  if (!url) return { status: "ok", output: { skipped: true, reason: "No webhook URL configured" } };
  const guard = isAllowedWebhookUrl(url);
  if (!guard.ok) return { status: "failed", error: guard.error };

  const payload =
    p.payload && typeof p.payload === "object"
      ? p.payload
      : { event: ctx.event.event, app: ctx.event.app, orgId: ctx.orgId, data: ctx.event.data };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.headers && typeof p.headers === "object") {
    for (const [k, v] of Object.entries(p.headers as Record<string, unknown>)) headers[k] = String(v);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await res.text().catch(() => "")).slice(0, 500);
    if (!res.ok) return { status: "failed", error: `Webhook responded ${res.status}`, output: { status: res.status, body } };
    return { status: "ok", output: { posted: true, status: res.status, body } };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Webhook POST failed" };
  } finally {
    clearTimeout(timeout);
  }
};

const REGISTRY: Record<string, ActionExecutor> = {
  // Legacy ids (existing saved workflows) + spec ids (builder catalog) both map
  // to the real executors so either authoring path actually fires.
  notify_owner: notifyOwner,
  "notify.inapp.send": notifyOwner,
  create_priority: createPriority,
  "priority.create": createPriority,
  create_www: createWww,
  "www.create": createWww,
  "priority.complete": completePriority,
  "www.complete": completeWww,
  "priority.reassign": reassignPriority,
  "webhook.post": postWebhook,
};

/** Resolve an executor for an action id, falling back to the simulator. */
export function getActionExecutor(actionId: string | undefined): ActionExecutor {
  if (actionId && REGISTRY[actionId]) return REGISTRY[actionId];
  return simulate;
}
