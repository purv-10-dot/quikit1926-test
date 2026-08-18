/**
 * Data-access contracts — QuikFlow's view of another app's data (doc §6, the
 * C2–C4/C7 contracts, expressed as TypeScript instead of HTTP). Reads power the
 * builder's pickers (real users/teams/categories) and condition record-lookups.
 *
 * The interface is transport-agnostic on purpose: the v1 QuikScaleProvider
 * reads the shared Postgres directly via Prisma (same DB, org-scoped, no network
 * hop), but a future provider could implement the same interface over HTTP if an
 * app ever moves to its own datastore — callers never change.
 */
import type { MasterSource } from "@/lib/catalog";

/** The five master pick-lists QuikScale owns (doc §6.2), minus the "master:" prefix. */
export type MasterTable = "users" | "teams" | "categories" | "units" | "quarters";

export const MASTER_TABLES: readonly MasterTable[] = [
  "users",
  "teams",
  "categories",
  "units",
  "quarters",
] as const;

/** Strip the `master:` prefix from a field source to its table name. */
export function masterTableOf(source: MasterSource): MasterTable {
  return source.replace(/^master:/, "") as MasterTable;
}

/** A normalized master-data row (doc §6.2 envelope: id + label + optional extras). */
export interface MasterItem {
  id: string;
  label: string;
  sublabel?: string;
  meta?: Record<string, unknown>;
}

export interface MasterResult {
  items: MasterItem[];
  total: number;
}

/** A normalized module record (a "row"), projected to the module's field keys. */
export interface RecordRow {
  id: string;
  label: string;
  fields: Record<string, unknown>;
}

export interface RecordQuery {
  moduleKey: string;
  /** Free-text search against the record's label column. */
  search?: string;
  /** Max rows (clamped by the provider). */
  limit?: number;
}

export interface RecordResult {
  items: RecordRow[];
  total: number;
  /** False when the module has no backing table yet (Meeting/Scorecard/Review). */
  readable: boolean;
}

/** The read surface a source app exposes to QuikFlow. */
export interface DataProvider {
  appSlug: string;
  listMaster(orgId: string, table: MasterTable): Promise<MasterResult>;
  queryRecords(orgId: string, query: RecordQuery): Promise<RecordResult>;
  getRecord(orgId: string, moduleKey: string, id: string): Promise<RecordRow | null>;
}
