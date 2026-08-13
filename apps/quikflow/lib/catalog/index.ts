/**
 * QuikFlow builder catalog — the single import surface for the workflow builder.
 * Data is derived from QuikScale-Workflow-Spec.xlsx (triggers/conditions/actions/
 * entities). Framework-free + pure, so it's safe in the client bundle and unit
 * testable. Re-exported at `@/lib/catalog`.
 */
import { TRIGGER_CATALOG, type CatalogApp, type CatalogEvent } from "./triggers";
import { type FieldType } from "./conditions";
import { MODULES, moduleForEvent, moduleByKey, fieldsUsableIn, type FieldDef, type ModuleDef } from "./modules";
import { ACTION_CATALOG, ACTION_CATEGORY_ORDER, type CatalogAction } from "./actions";
import { toEngineType, type SemanticType } from "./field-types";
import { MAIL_APP_SLUG, MAIL_CONDITION_FIELDS } from "./mail";
import { FATHOM_APP_SLUG, FATHOM_CONDITION_FIELDS, FATHOM_ACTION_IDS } from "./fathom";

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
  // Third-party mail events read straight off the payload — no module record.
  if (slug === MAIL_APP_SLUG) {
    return MAIL_CONDITION_FIELDS.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      semanticType: f.semanticType,
      values: f.values ? [...f.values] : undefined,
    }));
  }
  // Fathom meeting events likewise read straight off the payload.
  if (slug === FATHOM_APP_SLUG) {
    return FATHOM_CONDITION_FIELDS.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      semanticType: f.semanticType,
      values: f.values ? [...f.values] : undefined,
    }));
  }
  if (slug !== "quikscale") return [];
  const mod = moduleForEvent(eventId);
  if (!mod) return [];
  return moduleConditionFields(mod);
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

/** A plain-text ConditionField (used for resolved-value companion tokens). */
function textConditionField(key: string, label: string): ConditionField {
  return { id: `trigger.${key}`, label, type: "string", semanticType: "text" };
}

/**
 * Resolved-value companions for people / reference fields. The data provider
 * fills `<key>Name` (and `<key>Email` for people) so conditions AND `{{tokens}}`
 * can use a readable person / label instead of the raw id the column stores —
 * e.g. `{{trigger.ownerName}}`, `{{trigger.teamName}}`. Generated for every
 * module, so no email ever leaks an id (the reported Priority bug, generalized).
 */
function companionConditionFields(fields: FieldDef[]): ConditionField[] {
  const out: ConditionField[] = [];
  for (const f of fields) {
    // Only column-backed fields carry an id the data provider can resolve; a
    // companion for a column-less field would render empty, so skip it.
    if (!f.column) continue;
    if (f.type === "people") {
      out.push(textConditionField(`${f.key}Name`, `${f.label} name`));
      out.push(textConditionField(`${f.key}Email`, `${f.label} email`));
    } else if (f.type === "reference") {
      out.push(textConditionField(`${f.key}Name`, `${f.label} name`));
    }
  }
  return out;
}

/** Condition-usable fields for a module + resolved companions (deduped by id). */
function moduleConditionFields(mod: ModuleDef): ConditionField[] {
  const base = fieldsUsableIn(mod, "condition");
  const fields = base.map(toConditionField);
  const seen = new Set(fields.map((f) => f.id));
  for (const c of companionConditionFields(base)) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      fields.push(c);
    }
  }
  return fields;
}

/** Every condition-usable field across all modules (for global field pickers). */
export function allConditionFields(): (ConditionField & { module: string })[] {
  return MODULES.flatMap((m) => moduleConditionFields(m).map((f) => ({ ...f, module: m.label })));
}

/**
 * Actions a given module accepts, grouped by category — the builder's action
 * picker. A module's `actionIds` is the allow-list: modules with no backing
 * table (Teams KPI, Meeting, Review, Scorecard) don't list record-write actions,
 * so the picker never offers an action that could only ever be simulated.
 */
export function actionsForModuleKey(moduleKey: string | undefined): { category: string; actions: CatalogAction[] }[] {
  const mod = moduleKey ? moduleByKey(moduleKey) : undefined;
  const allowed = mod ? new Set(mod.actionIds) : null;
  return actionsForAllowed(allowed);
}

/** Group ACTION_CATALOG by category, optionally filtered to an allow-set. */
function actionsForAllowed(allowed: Set<string> | null): { category: string; actions: CatalogAction[] }[] {
  return ACTION_CATEGORY_ORDER.map((category) => ({
    category,
    actions: ACTION_CATALOG.filter((a) => a.category === category && (!allowed || allowed.has(a.id))),
  })).filter((g) => g.actions.length > 0);
}

/** Actions available for a trigger event, via its owning module's allow-list. */
export function actionsForEvent(app: string, eventId: string): { category: string; actions: CatalogAction[] }[] {
  // Mail triggers aren't tied to a QuikScale module — offer the full catalog
  // (send a reply, create a priority, POST a webhook, …).
  if (app === MAIL_APP_SLUG) return actionsForModuleKey(undefined);
  // Fathom triggers offer a curated short list (Save transcript first), not the
  // whole catalog — so the relevant action isn't buried under simulated ones.
  if (app === FATHOM_APP_SLUG) return actionsForAllowed(new Set(FATHOM_ACTION_IDS));
  if (app !== "quikscale") return [];
  return actionsForModuleKey(moduleForEvent(eventId)?.key);
}
