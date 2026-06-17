/**
 * Drill-down URL builders — centralizes the chart/cell → list-view link
 * construction so every chart pushes to a consistent query string.
 */

type DrillCtx = {
  fromIso?: string;
  toIso?: string;
  ownerId?: string | null;
};

function appendCommon(p: URLSearchParams, ctx: DrillCtx): void {
  if (ctx.fromIso) p.set("from", ctx.fromIso);
  if (ctx.toIso) p.set("to", ctx.toIso);
  if (ctx.ownerId) p.set("ownerId", ctx.ownerId);
}

export function leadsByStageHref(stage: string, ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("stage", stage);
  appendCommon(p, ctx);
  return `/leads?${p.toString()}`;
}

export function opportunitiesByStageHref(stage: string, ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("stage", stage);
  appendCommon(p, ctx);
  return `/opportunities?${p.toString()}`;
}

export function activitiesByDayHref(dayIso: string, ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("date", dayIso);
  if (ctx.ownerId) p.set("ownerId", ctx.ownerId);
  return `/activities?${p.toString()}`;
}

export function tasksHref(filter: "overdue" | "open", ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("filter", filter);
  if (ctx.ownerId) p.set("ownerId", ctx.ownerId);
  return `/tasks?${p.toString()}`;
}

export function staleLeadsHref(ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("filter", "stale");
  if (ctx.ownerId) p.set("ownerId", ctx.ownerId);
  return `/leads?${p.toString()}`;
}

export function stuckOppsHref(ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("filter", "stuck");
  if (ctx.ownerId) p.set("ownerId", ctx.ownerId);
  return `/opportunities?${p.toString()}`;
}

export function callsMissingDispoHref(ctx: DrillCtx): string {
  const p = new URLSearchParams();
  p.set("filter", "missing-disposition");
  if (ctx.ownerId) p.set("ownerId", ctx.ownerId);
  return `/telephony/call-logs?${p.toString()}`;
}
