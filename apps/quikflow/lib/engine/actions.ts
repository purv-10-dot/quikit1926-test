import type { ActionContext, StepResult } from "./types";
import { moduleForEvent } from "@/lib/catalog";
import { sendMailForOrg } from "@/lib/connectors";
import type { MailProviderId } from "@/lib/connectors";

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

/** A recorded no-op step (action authorable but nothing to act on this run). */
function skipStep(reason: string): StepResult {
  return { status: "ok", output: { skipped: true, reason } };
}

/** Coerce assorted truthy param encodings ("true"/true/1) to a boolean. */
function boolParam(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * REAL: send an email from a connected mailbox. `providerHint` pins the provider
 * (gmail.send / outlook.send); null uses the org's oldest connected mailbox
 * (the provider-agnostic notify.email.send). Params are token-resolved by the
 * runner, so `to`/`subject`/`body` may contain {{trigger.*}} tokens. Skips
 * cleanly when there's no recipient or no connected account.
 */
function mailSend(providerHint: MailProviderId | null): ActionExecutor {
  return async (ctx) => {
    const p = ctx.params ?? {};
    const to = firstString(p.to, p.recipient, p.email);
    if (!to) return skipStep("No recipient (to) for the email");
    const subject = firstString(p.subject) ?? "(no subject)";
    const body = firstString(p.body, p.message, p.text) ?? "";
    try {
      const sent = await sendMailForOrg(
        ctx.orgId,
        providerHint,
        {
          to,
          subject,
          body,
          cc: firstString(p.cc) ?? undefined,
          bcc: firstString(p.bcc) ?? undefined,
          html: boolParam(p.html),
        },
        { connectionId: firstString(p.from_connection) ?? undefined },
      );
      if (!sent) {
        return skipStep(`No connected ${providerHint ?? "mail"} account for this org`);
      }
      return {
        status: "ok",
        output: { sent: true, messageId: sent.id, from: sent.from, provider: sent.provider, to },
      };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "Email send failed" };
    }
  };
}

/** Coerce a param to a number, or null when blank/non-numeric. */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Parse a `fields{}` param that may arrive as an object or a JSON string. */
function parseObjectParam(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim()) {
    try {
      const o: unknown = JSON.parse(v);
      if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch {
      /* not JSON → no fields */
    }
  }
  return {};
}

/** REAL: record a weekly KPI reading (reuses QuikScale's upsert+recalc → RAG). */
const enterKpiValue: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const kpiId = firstString(p.kpi_id, p.kpiId, resolveTargetId(ctx, "kpi"));
  if (!kpiId) return skipStep("No KPI id to enter a value for");
  const weekNumber = numOrNull(p.week_number ?? p.weekNumber ?? ctx.event.data.weekNumber);
  if (weekNumber === null) return skipStep("No week number to enter a value for");
  const res = await callQuikScale("/api/internal/actions/enter-kpi-value", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    kpiId,
    weekNumber,
    value: numOrNull(p.value),
    userId: firstString(p.user_id) ?? undefined,
    notes: firstString(p.note) ?? null,
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { entered: true, kpiId, weekNumber, value: numOrNull(p.value) } };
};

/** REAL: create an individual KPI. */
const createKpi: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const d = ctx.event.data;
  const name = firstString(p.name, d.name);
  const owner = firstString(p.owner_id, p.owner, resolveOwner(d));
  const year = numOrNull(p.year ?? d.year);
  if (!name || !owner || year === null) return skipStep("Need name, owner, and year to create a KPI");
  const q = firstString(p.quarter, d.quarter);
  const res = await callQuikScale("/api/internal/actions/create-kpi", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    name,
    owner,
    target: numOrNull(p.target),
    measurementUnit: firstString(p.unit) ?? undefined,
    quarter: q && /^Q[1-4]$/.test(q) ? q : undefined,
    year,
    frequency: firstString(p.cadence) ?? undefined,
    kpiType: firstString(p.type) ?? undefined,
    teamId: firstString(p.team_id, d.teamId) ?? undefined,
    description: firstString(p.description) ?? undefined,
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { created: true, kpiId: res.data?.id, name } };
};

/** Whitelisted KPI patch keys — never derived columns (RAG/progress/qtd*). */
const KPI_PATCH_KEYS = ["name", "owner", "description", "measurementUnit", "kpiType", "target"] as const;

/** REAL: update whitelisted KPI fields (server rejects derived columns). */
const updateKpi: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const kpiId = firstString(p.kpi_id, p.kpiId, resolveTargetId(ctx, "kpi"));
  if (!kpiId) return skipStep("No KPI id to update");
  const fields = parseObjectParam(p.fields);
  if (fields.owner_id !== undefined && fields.owner === undefined) fields.owner = fields.owner_id;
  const patch: Record<string, unknown> = {};
  for (const k of KPI_PATCH_KEYS) {
    const v = p[k] ?? fields[k];
    if (v !== undefined && v !== "") patch[k] = k === "target" ? numOrNull(v) : v;
  }
  if (Object.keys(patch).length === 0) return skipStep("No updatable KPI fields provided");
  const res = await callQuikScale("/api/internal/actions/update-kpi", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    kpiId,
    patch,
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { updated: true, kpiId, fields: Object.keys(patch) } };
};

/** REAL: soft-archive a KPI (status → "archived"). */
const archiveKpi: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const kpiId = firstString(p.kpi_id, p.kpiId, resolveTargetId(ctx, "kpi"));
  if (!kpiId) return skipStep("No KPI id to archive");
  const res = await callQuikScale("/api/internal/actions/update-kpi", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    kpiId,
    patch: { archived: true },
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { archived: true, kpiId } };
};

/** Whitelisted Priority patch keys (never derived progress/dueDate). */
const PRIORITY_PATCH_KEYS = ["name", "description", "status", "owner", "notes"] as const;

/** REAL: update whitelisted Priority (Rock) fields. */
const updatePriority: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const priorityId = firstString(p.priority_id, p.priorityId, resolveTargetId(ctx, "priority"));
  if (!priorityId) return skipStep("No priority id to update");
  const fields = parseObjectParam(p.fields);
  const patch: Record<string, unknown> = {};
  for (const k of PRIORITY_PATCH_KEYS) {
    const v = p[k] ?? fields[k];
    if (v !== undefined && v !== "") patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return skipStep("No updatable priority fields provided");
  const res = await callQuikScale("/api/internal/actions/update-priority", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    priorityId,
    patch,
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { updated: true, priorityId, fields: Object.keys(patch) } };
};

/** REAL: bulk-create WWW items from an `items[]` param (array or JSON string). */
const bulkImportWww: ActionExecutor = async (ctx) => {
  const p = ctx.params ?? {};
  const raw = p.items;
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim()
      ? (() => {
          try {
            const j: unknown = JSON.parse(raw);
            return Array.isArray(j) ? j : [];
          } catch {
            return [];
          }
        })()
      : [];
  const items = arr
    .map((it) => (it && typeof it === "object" ? (it as Record<string, unknown>) : null))
    .filter((it): it is Record<string, unknown> => it !== null)
    .map((it) => ({
      who: firstString(it.who, it.owner),
      what: firstString(it.what),
      when: firstString(it.when) ?? new Date(Date.now() + 7 * 86_400_000).toISOString(),
      category: firstString(it.category) ?? undefined,
      notes: firstString(it.notes) ?? undefined,
    }))
    .filter((it) => it.who && it.what);
  if (items.length === 0) return skipStep("No valid WWW items to import (need who + what)");
  const res = await callQuikScale("/api/internal/actions/bulk-create-www", {
    orgId: ctx.orgId,
    actorId: actorFor(ctx),
    items,
  });
  if (!res.ok) return { status: "failed", error: res.error };
  return { status: "ok", output: { imported: true, count: res.data?.count } };
};

/** REAL: advance an OPSP's status (draft → finalized → reviewed). */
function setOpspStatus(target: "finalized" | "reviewed"): ActionExecutor {
  return async (ctx) => {
    const p = ctx.params ?? {};
    const opspId = firstString(p.opsp_id, p.opspId, resolveTargetId(ctx, "opsp"));
    if (!opspId) return skipStep("No OPSP id to update");
    const res = await callQuikScale("/api/internal/actions/set-opsp-status", {
      orgId: ctx.orgId,
      actorId: actorFor(ctx),
      opspId,
      target,
    });
    if (!res.ok) return { status: "failed", error: res.error };
    return { status: "ok", output: { opspId, status: target } };
  };
}

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
  // Outbound email via a connected mailbox (Gmail / Outlook OAuth connection).
  "notify.email.send": mailSend(null),
  "email.send": mailSend(null),
  "gmail.send": mailSend("gmail"),
  "outlook.send": mailSend("outlook"),
  // KPI record mutations (Phase 1) — reuse QuikScale's own write/recalc logic.
  "kpi.value.enter": enterKpiValue,
  "kpi.create": createKpi,
  "kpi.update": updateKpi,
  "kpi.archive": archiveKpi,
  // Phase 2 — other internal-DB module mutations.
  "priority.update": updatePriority,
  "www.bulk.import": bulkImportWww,
  "opsp.finalize": setOpspStatus("finalized"),
  "opsp.review.mark": setOpspStatus("reviewed"),
};

/** Resolve an executor for an action id, falling back to the simulator. */
export function getActionExecutor(actionId: string | undefined): ActionExecutor {
  if (actionId && REGISTRY[actionId]) return REGISTRY[actionId];
  return simulate;
}
