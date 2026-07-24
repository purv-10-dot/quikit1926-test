/**
 * QuikFlow builder catalog — the single import surface for the workflow builder.
 * Data is derived from QuikScale-Workflow-Spec.xlsx (triggers/conditions/actions/
 * entities). Framework-free + pure, so it's safe in the client bundle and unit
 * testable. Re-exported at `@/lib/catalog`.
 */
import { TRIGGER_CATALOG, type CatalogApp, type CatalogEvent } from "./triggers";
import { type FieldType } from "./conditions";
import { MODULES, moduleForEvent, fieldsUsableIn } from "./modules";
import { toEngineType, type SemanticType } from "./field-types";

export * from "./triggers";
export * from "./conditions";
export * from "./actions";
export * from "./entities";
export * from "./field-types";
export * from "./modules";

/** Builder step kinds (unchanged from v1). */
export const STEP_KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: "action", label: "Action", hint: "do something" },
  { kind: "condition", label: "Condition", hint: "filter — continue or stop" },
  { kind: "if_else", label: "If / Else branch", hint: "two paths" },
  { kind: "wait", label: "Wait / delay", hint: "pause" },
  { kind: "loop", label: "Loop (for each)", hint: "repeat over a list" },
  { kind: "approval", label: "Request approval", hint: "ask a person" },
];

/** A selectable condition field, with everything the builder needs to render
 *  its operator list AND its value control (the data-level value picker). */
export interface ConditionField {
  id: string;
  label: string;
  /** Engine type → drives the operator list. */
  type: FieldType;
  /** Builder semantic type → drives which value control renders. */
  semanticType: SemanticType;
  /** Dynamic options source (master:* / module:*) or undefined for free input. */
  valueSource?: string;
  /** Inline enum values (status / dropdown). */
  values?: string[];
}

export function findApp(slug: string): CatalogApp | undefined {
  return TRIGGER_CATALOG.find((a) => a.slug === slug);
}

/** Distinct modules for an app, in first-seen order. */
export function modulesForApp(slug: string): string[] {
  const app = findApp(slug);
  if (!app) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ev of app.events) {
    if (!seen.has(ev.module)) {
      seen.add(ev.module);
      out.push(ev.module);
    }
  }
  return out;
}

/** Events within one module of an app. */
export function eventsForModule(slug: string, module: string): CatalogEvent[] {
  return findApp(slug)?.events.filter((e) => e.module === module) ?? [];
}

export function findEvent(slug: string, eventId: string): CatalogEvent | undefined {
  return findApp(slug)?.events.find((e) => e.id === eventId);
}

/**
 * Fields a condition can test for a given event, derived from the owning
 * module's schema (doc §3 — "any field marked usable in condition can be
 * filtered"). Each becomes `trigger.<fieldKey>` with the engine type that drives
 * its operators. Conditions read the live record via the data provider, so the
 * full condition-usable field set is offered regardless of the event payload.
 */
export function conditionFieldsForEvent(slug: string, eventId: string): ConditionField[] {
  if (slug !== "quikscale") return [];
  const mod = moduleForEvent(eventId);
  if (!mod) return [];
  return fieldsUsableIn(mod, "condition").map(toConditionField);
}

/** Map a registry FieldDef to a builder ConditionField. */
function toConditionField(f: {
  key: string;
  label: string;
  type: SemanticType;
  source?: string;
  values?: string[];
}): ConditionField {
  return {
    id: `trigger.${f.key}`,
    label: f.label,
    type: toEngineType(f.type),
    semanticType: f.type,
    valueSource: f.source,
    values: f.values,
  };
}

/** Every condition-usable field across all modules (for global field pickers). */
export function allConditionFields(): (ConditionField & { module: string })[] {
  return MODULES.flatMap((m) =>
    fieldsUsableIn(m, "condition").map((f) => ({ ...toConditionField(f), module: m.label })),
  );
}
