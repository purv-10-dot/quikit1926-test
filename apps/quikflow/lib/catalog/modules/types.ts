/**
 * Module registry types — the single source of truth for what QuikFlow knows
 * about a QuikScale module: its fields (columns), the events it fires, the
 * actions it accepts, and how QuikFlow reads its records (rows) from the shared
 * database.
 *
 * Everything downstream — the trigger picker, the condition field list, the
 * data-access provider, the API routes — derives from these definitions. Adding
 * a module (or a whole new app) is a new file here, not new plumbing.
 *
 * Source: QuikScale-Automation-Implementation-Plan.docx §1–§4 + the
 * Form-Fields.xlsx dictionary, reconciled against the real Prisma models.
 */
import type { SemanticType, MasterSource } from "../field-types";

export type FieldUsage = "trigger" | "condition" | "action";

/** One field (≈ a monday "column") on a module. */
export interface FieldDef {
  /** Stable machine id used in conditions/tokens (e.g. "gapPct", "owner"). */
  key: string;
  /** Human label shown in the builder (matches the QuikScale grid header). */
  label: string;
  type: SemanticType;
  /** Which recipe blocks may reference this field. */
  usableIn: FieldUsage[];
  /** Inline enum values (status / dropdown fields). */
  values?: string[];
  /** Live value source for people / reference fields. */
  source?: MasterSource;
  /**
   * Computed by QuikScale business logic (RAG, gap %, streak). QuikFlow cannot
   * infer these — they arrive on the event payload or are read from the record.
   */
  derived?: boolean;
  /**
   * Backing Prisma column on the module's model, when the field maps 1:1 to a
   * stored column. Absent ⇒ the field is derived / not directly readable, so the
   * data provider omits it from record projections.
   */
  column?: string;
  description?: string;
}

/** One event the module can emit into QuikFlow's ingest (a trigger option). */
export interface EventDef {
  /** e.g. "kpi.status.changed" — matched verbatim by the engine's matcher. */
  id: string;
  label: string;
  firesWhen: string;
  /**
   * Informational token sources carried on the payload (for {{smart-values}}).
   * Condition fields come from the module schema, not from this list — so
   * conditions can filter any condition-usable field via a live record read.
   */
  payloadFields: string[];
  /** QuikScale emits this end-to-end today. Absent/false ⇒ authorable but "Planned". */
  live?: boolean;
}

/** How QuikFlow reads this module's rows from the shared database. */
export interface ModuleDataBinding {
  /**
   * Prisma client accessor for the backing model (e.g. "kPI", "wWWItem").
   * Absent ⇒ no backing table yet (Meeting, Scorecard, Review): the module is
   * authorable but its records/pickers are not populated in v1.
   */
  model?: string;
  /** Filter `deletedAt: null` when the model soft-deletes. */
  softDelete?: boolean;
  /** False ⇒ authorable only (inline enums), no live record reads. */
  readable: boolean;
}

export interface ModuleDef {
  /** Stable machine id (e.g. "kpi"). */
  key: string;
  /** Sidebar label the user already recognises. */
  label: string;
  /** Noun used in recipe sentences: "a KPI", "a Rock". */
  recordNoun: string;
  capabilities: { trigger: boolean; condition: boolean; action: boolean };
  fields: FieldDef[];
  events: EventDef[];
  /** Action ids (into ACTION_CATALOG) this module accepts. */
  actionIds: string[];
  binding: ModuleDataBinding;
}

/** Fields on a module usable in a given block. */
export function fieldsUsableIn(module: ModuleDef, usage: FieldUsage): FieldDef[] {
  return module.fields.filter((f) => f.usableIn.includes(usage));
}

/** Readable (column-backed) fields — the projection the data provider selects. */
export function readableFields(module: ModuleDef): FieldDef[] {
  return module.fields.filter((f) => !!f.column);
}
