/**
 * QuikFlow builder catalog — the single import surface for the workflow builder.
 * Data is derived from QuikScale-Workflow-Spec.xlsx (triggers/conditions/actions/
 * entities). Framework-free + pure, so it's safe in the client bundle and unit
 * testable. Re-exported at `@/lib/catalog`.
 */
import { TRIGGER_CATALOG, type CatalogApp, type CatalogEvent } from "./triggers";
import { entityForPayloadKey } from "./entities";
import { fieldType, type FieldType } from "./conditions";

export * from "./triggers";
export * from "./conditions";
export * from "./actions";
export * from "./entities";

/** Builder step kinds (unchanged from v1). */
export const STEP_KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: "action", label: "Action", hint: "do something" },
  { kind: "condition", label: "Condition", hint: "filter — continue or stop" },
  { kind: "if_else", label: "If / Else branch", hint: "two paths" },
  { kind: "wait", label: "Wait / delay", hint: "pause" },
  { kind: "loop", label: "Loop (for each)", hint: "repeat over a list" },
  { kind: "approval", label: "Request approval", hint: "ask a person" },
];

/** A selectable condition field, with the type that drives its operators. */
export interface ConditionField {
  id: string;
  label: string;
  type: FieldType;
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

const strip = (f: string) => f.replace(/(\[\]|\{\})$/, "");
const humanize = (f: string) =>
  strip(f)
    .split(/[._]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

/**
 * Fields a condition can test for a given event: each scalar payload field
 * directly, and each entity-shaped payload field expanded into that entity's
 * fields (e.g. payload `kpi` → `trigger.kpi.rag_status`). Deduped by id.
 */
export function conditionFieldsForEvent(slug: string, eventId: string): ConditionField[] {
  const event = findEvent(slug, eventId);
  if (!event) return [];
  const out: ConditionField[] = [];
  const seen = new Set<string>();
  const push = (id: string, label: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, label, type: fieldType(id) });
  };

  for (const raw of event.payloadFields) {
    const key = strip(raw);
    const entity = entityForPayloadKey(key);
    if (entity) {
      for (const ef of entity.fields) {
        const leaf = strip(ef);
        push(`trigger.${key}.${leaf}`, `${entity.name} · ${humanize(ef)}`);
      }
    } else {
      push(`trigger.${key}`, humanize(raw));
    }
  }
  return out;
}
