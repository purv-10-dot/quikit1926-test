/**
 * Module registry — the aggregated single source of truth. Every module the
 * QuikScale app exposes to QuikFlow lives here; the trigger picker, condition
 * field list, data provider, and API routes all read from this list.
 *
 * Order is the sidebar order the user sees (doc §1). To add a module: create a
 * `<module>.ts` ModuleDef and append it here — nothing else needs to change.
 */
import type { FieldDef, ModuleDef } from "./types";
import type { FieldType } from "../conditions";
import { toEngineType } from "../field-types";

import { KPI_MODULE } from "./kpi";
import { TEAMSKPI_MODULE } from "./teamskpi";
import { PRIORITY_MODULE } from "./priority";
import { OPSP_MODULE } from "./opsp";
import { MEETING_MODULE } from "./meeting";
import { HABIT_MODULE } from "./habit";
import { REVIEW_MODULE } from "./review";
import { GOAL_MODULE } from "./goal";
import { WWW_MODULE } from "./www";
import { SCORECARD_MODULE } from "./scorecard";
import { GLOBAL_MODULE } from "./global";

export * from "./types";

/** The app these modules belong to (v1 = QuikScale). */
export const MODULE_APP = { slug: "quikscale", name: "QuikScale" } as const;

export const MODULES: ModuleDef[] = [
  KPI_MODULE,
  TEAMSKPI_MODULE,
  PRIORITY_MODULE,
  OPSP_MODULE,
  MEETING_MODULE,
  HABIT_MODULE,
  REVIEW_MODULE,
  GOAL_MODULE,
  WWW_MODULE,
  SCORECARD_MODULE,
  GLOBAL_MODULE,
];

const BY_KEY = new Map<string, ModuleDef>(MODULES.map((m) => [m.key, m]));

export function moduleByKey(key: string): ModuleDef | undefined {
  return BY_KEY.get(key);
}

/** Find the module that owns a given event id (events are globally unique). */
export function moduleForEvent(eventId: string): ModuleDef | undefined {
  return MODULES.find((m) => m.events.some((e) => e.id === eventId));
}

export function fieldByKey(moduleKey: string, fieldKey: string): FieldDef | undefined {
  return moduleByKey(moduleKey)?.fields.find((f) => f.key === fieldKey);
}

/**
 * Engine field type for a `module.field` pair — the authoritative typing used
 * by the condition builder (falls back to string when unknown). This is the
 * registry-driven replacement for name-based inference.
 */
export function engineTypeForField(moduleKey: string, fieldKey: string): FieldType {
  const field = fieldByKey(moduleKey, fieldKey);
  return field ? toEngineType(field.type) : "string";
}
