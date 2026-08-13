/**
 * Field-type system — the bridge between "how a field looks in the builder"
 * (the monday-style picker) and "how the engine evaluates it" (operators).
 *
 * Source: QuikScale-Automation-Form-Fields.xlsx (sheet 4 · Form Fields, sheet 5
 * · Shared Pick-lists). Every placeholder in a recipe sentence is a field of one
 * of these SEMANTIC types; the type decides which picker opens and which
 * operators are offered.
 *
 * Two layers, on purpose:
 *   • SemanticType — drives the BUILDER picker (status chips, people picker, …).
 *   • FieldType    — drives the ENGINE (operators + evaluation). See conditions.ts.
 * `toEngineType()` collapses the rich builder types onto the small evaluable set,
 * so the engine never has to know about "people" vs "reference" vs "dropdown".
 */
import type { FieldType } from "./conditions";

/** The builder-facing field types (xlsx "Input control" column). */
export type SemanticType =
  | "status" // coloured label chips (RAG / stage), fixed enum values
  | "people" // person picker → resolves against master:users
  | "number" // numeric box + comparison operator
  | "date" // date picker / relative-day dropdown
  | "dropdown" // fixed inline enum (Company/Team/Individual, …)
  | "reference" // lookup into master data (teams, categories, units, quarters)
  | "text" // free text with {{smart-values}}
  | "boolean"; // yes/no toggle

/**
 * Master-data pick-lists QuikScale owns and every app reads (doc §6.2). A field
 * of type `people`/`reference` names one of these as its value source; the
 * builder fills the picker from the live org data (see lib/data).
 */
export type MasterSource =
  | "master:users"
  | "master:teams"
  | "master:categories"
  | "master:units"
  | "master:quarters";

export const MASTER_SOURCES: readonly MasterSource[] = [
  "master:users",
  "master:teams",
  "master:categories",
  "master:units",
  "master:quarters",
] as const;

/** Picker control the builder renders for each semantic type. */
export const PICKER_BY_TYPE: Record<SemanticType, string> = {
  status: "status-chips",
  people: "people-picker",
  number: "number-box",
  date: "date-picker",
  dropdown: "dropdown",
  reference: "reference-picker",
  text: "text-tokens",
  boolean: "toggle",
};

/**
 * Collapse a builder SemanticType onto the engine's evaluable FieldType.
 *   • people / reference / status / dropdown → enum (compared by equality / membership)
 *   • text → string, number → number, date → date, boolean → boolean
 * Keeping this the single mapping point means the engine stays type-simple while
 * the builder stays type-rich.
 */
export function toEngineType(type: SemanticType): FieldType {
  switch (type) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    case "text":
      return "string";
    case "status":
    case "dropdown":
    case "reference":
    case "people":
      return "enum";
  }
}

/** True when a field's value list comes from live master data (not inline). */
export function isMasterBacked(source: string | undefined): source is MasterSource {
  return !!source && (MASTER_SOURCES as readonly string[]).includes(source);
}
