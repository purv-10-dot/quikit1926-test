/**
 * QuikScaleProvider — the v1 DataProvider. Reads QuikScale's data straight from
 * the shared Postgres (same DB, org-scoped), fulfilling the doc's C2–C4/C7 read
 * contracts without an HTTP hop. Writes/actions are NOT here — those go through
 * QuikScale's internal action endpoints so business logic stays in the owning
 * app (see lib/engine/actions.ts).
 */
import type { DataProvider, MasterTable, RecordQuery } from "../types";
import { listMaster } from "./master";
import { queryRecords, getRecord } from "./records";

export const quikscaleProvider: DataProvider = {
  appSlug: "quikscale",
  listMaster: (orgId: string, table: MasterTable) => listMaster(orgId, table),
  queryRecords: (orgId: string, query: RecordQuery) => queryRecords(orgId, query),
  getRecord: (orgId: string, moduleKey: string, id: string) => getRecord(orgId, moduleKey, id),
};
