/**
 * Builder ⇄ persisted-workflow serialization (pure + framework-free, so it's
 * unit-testable and shared by the create and edit flows). `serializeWorkflow`
 * turns builder state into the saved graph; `deserializeWorkflow` is its inverse
 * — it reopens a saved workflow back into editable builder state.
 */
import { findEvent, operatorArity } from "@/lib/catalog";
import { isBeforeDateEvent } from "@/lib/schedule/date-rules";
import { deriveStepLabel, displayStepLabel, isGenericLabel } from "./labels";
import type { RuleRow, RuleGroupValue, ScheduleValue, Step } from "./types";

export const DEFAULT_SCHEDULE: ScheduleValue = { recurrence: "every_week", time: "09:00", dayOfWeek: "mon" };
export const DEFAULT_OFFSET_DAYS = 3;

/** Coerce a raw string to a number when it looks numeric (so gapPct > 50 works). */
export function coerce(raw: string | undefined): string | number {
  const s = raw ?? "";
  const num = Number(s);
  return s !== "" && !Number.isNaN(num) ? num : s;
}

/** Serialize one rule row to the engine's clause shape, sized to the operator. */
export function serializeRule(r: RuleRow): Record<string, unknown> {
  const arity = operatorArity(r.operator);
  const out: Record<string, unknown> = { field: r.field, operator: r.operator };
  if (arity === "one") out.value = coerce(r.value);
  else if (arity === "range") {
    out.value = coerce(r.value);
    out.value2 = coerce(r.value2);
  } else if (arity === "duration") {
    out.value = coerce(r.value);
    out.unit = r.unit || "days";
  }
  return out;
}

/** Read a persisted clause/rule back into an editable RuleRow (values → strings). */
function deserializeRule(raw: Record<string, unknown>): RuleRow {
  const str = (v: unknown) => (v == null ? undefined : String(v));
  return {
    field: str(raw.field),
    operator: str(raw.op ?? raw.operator),
    value: str(raw.value) ?? "",
    value2: str(raw.value2),
    unit: str(raw.unit),
  };
}

/** Build the persisted config for a step by kind. */
export function nodeConfig(s: Step): Record<string, unknown> {
  if (s.kind === "condition" || s.kind === "if_else") {
    const rules = s.rules ?? [];
    if (rules.length > 0) {
      return { combinator: s.combine ?? "and", clauses: rules.map(serializeRule) };
    }
    return s.field
      ? serializeRule({ field: s.field, operator: s.operator, value: s.value, value2: s.value2, unit: s.unit })
      : {};
  }
  return { actionId: s.actionId, params: s.params ?? {} };
}

export interface BuilderState {
  name: string;
  app: string;
  module: string;
  event: string;
  triggerFilter: RuleGroupValue;
  schedule: ScheduleValue;
  /** "N days before" offset for before-mode date triggers (e.g. www.due.approaching). */
  offsetDays: number;
  steps: Step[];
  live: boolean;
  /** Who can use this workflow: "org" (everyone) or "personal" (just the owner). */
  scope: "org" | "personal";
}

export interface SerializedGraph {
  trigger: Record<string, unknown>;
  graphNodes: { id: string; kind: string; label: string; config: Record<string, unknown> }[];
  graphEdges: { from: string; to: string }[];
}

/** Builder state → the persisted trigger + linear graph. */
export function serializeWorkflow(
  state: Pick<BuilderState, "app" | "module" | "event" | "triggerFilter" | "steps"> & {
    schedule?: ScheduleValue;
    offsetDays?: number;
  },
): SerializedGraph {
  const { app, module, event, triggerFilter, steps } = state;
  const triggerLabel = findEvent(app, event)?.label ?? event;
  const isSchedule = event === "schedule.tick";

  const trigger: Record<string, unknown> = {
    type: isSchedule ? "cron" : "event",
    app,
    module,
    event,
    label: triggerLabel,
  };
  if (isSchedule && state.schedule) {
    trigger.schedule = { ...state.schedule };
  }
  if (isBeforeDateEvent(event)) {
    trigger.offsetDays = state.offsetDays ?? DEFAULT_OFFSET_DAYS;
  }
  if (triggerFilter.rules.length > 0) {
    trigger.filter = { combine: triggerFilter.combine, rules: triggerFilter.rules.map(serializeRule) };
  }

  const graphNodes = [
    { id: "trigger", kind: "trigger", label: triggerLabel, config: { app, module, event } },
    ...steps.map((s) => ({ id: s.id, kind: s.kind, label: displayStepLabel(s), config: nodeConfig(s) })),
  ];
  const graphEdges = graphNodes.slice(0, -1).map((n, i) => ({ from: n.id, to: graphNodes[i + 1].id }));
  return { trigger, graphNodes, graphEdges };
}

interface PersistedWorkflow {
  name?: string;
  status?: string;
  scope?: string;
  trigger?: unknown;
  graphNodes?: unknown;
}

/** Persisted workflow → editable builder state (inverse of serializeWorkflow). */
export function deserializeWorkflow(wf: PersistedWorkflow): BuilderState {
  const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
  const filter = (trigger.filter ?? null) as { combine?: "and" | "or"; rules?: Record<string, unknown>[] } | null;

  const triggerFilter: RuleGroupValue = {
    combine: filter?.combine ?? "and",
    rules: (filter?.rules ?? []).map(deserializeRule),
  };

  const nodes = (Array.isArray(wf.graphNodes) ? wf.graphNodes : []) as {
    id: string;
    kind: string;
    label?: string;
    config?: Record<string, unknown>;
  }[];

  const steps: Step[] = nodes
    .filter((n) => n.kind !== "trigger" && n.id !== "trigger")
    .map((n) => {
      const config = n.config ?? {};
      const base: Step = { id: n.id, kind: n.kind, label: n.label ?? n.kind };
      if (n.kind === "action") {
        base.actionId = typeof config.actionId === "string" ? config.actionId : undefined;
        const rawParams = (config.params ?? {}) as Record<string, unknown>;
        base.params = Object.fromEntries(
          Object.entries(rawParams).map(([k, v]) => [k, v == null ? "" : String(v)]),
        );
      } else if (n.kind === "condition" || n.kind === "if_else") {
        const clauses = Array.isArray(config.clauses) ? (config.clauses as Record<string, unknown>[]) : null;
        if (clauses) {
          base.combine = (config.combinator as "and" | "or") ?? "and";
          base.rules = clauses.map(deserializeRule);
        } else if (config.field) {
          base.combine = "and";
          base.rules = [deserializeRule(config)];
        }
      }
      // Reconstruct the "is this label user-set?" flag: a persisted label that is
      // neither generic nor equal to the auto-derived one is a custom rename;
      // otherwise re-derive so old generic labels ("Condition"/"Action") upgrade.
      const persisted = n.label ?? "";
      const derived = deriveStepLabel(base);
      base.labelCustom = !isGenericLabel(persisted, n.kind) && persisted !== derived;
      base.label = base.labelCustom ? persisted : derived;
      return base;
    });

  const s = (trigger.schedule ?? {}) as Partial<ScheduleValue>;
  const schedule: ScheduleValue = {
    recurrence: s.recurrence ?? DEFAULT_SCHEDULE.recurrence,
    time: s.time ?? DEFAULT_SCHEDULE.time,
    dayOfWeek: s.dayOfWeek ?? DEFAULT_SCHEDULE.dayOfWeek,
    dayOfMonth: s.dayOfMonth,
  };

  return {
    name: wf.name ?? "Untitled workflow",
    app: typeof trigger.app === "string" ? trigger.app : "quikscale",
    module: typeof trigger.module === "string" ? trigger.module : "",
    event: typeof trigger.event === "string" ? trigger.event : "",
    triggerFilter,
    schedule,
    offsetDays: typeof trigger.offsetDays === "number" ? trigger.offsetDays : DEFAULT_OFFSET_DAYS,
    steps,
    live: wf.status === "Active",
    scope: wf.scope === "org" ? "org" : "personal",
  };
}

/** Highest `step_<n>` suffix among steps → seed for new-id generation on edit. */
export function maxStepSeq(steps: Step[]): number {
  return steps.reduce((max, s) => {
    const m = /^step_(\d+)$/.exec(s.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}
