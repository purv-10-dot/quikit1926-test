/**
 * Record loading (doc §9, pipeline step 3 — "Load record"). After an event
 * matches, we fetch the full triggering record via the DataProvider so
 * conditions and tokens can reference ANY column, not just what the event
 * payload happened to carry. Falls back cleanly to the raw payload when the
 * module has no backing table or no record id is present (e.g. manual Run now).
 *
 * The engine stays framework-agnostic: it reads through the DataProvider
 * interface, never Prisma directly — so this whole core is extractable to a
 * standalone worker service later.
 */
import { moduleForEvent } from "@/lib/catalog";
import { getProvider } from "@/lib/data/registry";
import type { EngineEvent } from "./types";

export interface EnrichedContext {
  /** event.data merged with the loaded record's fields (flat) — used by conditions. */
  data: Record<string, unknown>;
  /** Token root: flat fields plus a nested `[moduleKey]` object (doc §7 namespaces). */
  trigger: Record<string, unknown>;
  /** The triggering module key, if the event belongs to one. */
  moduleKey: string | null;
  /** The loaded record's fields, or null when nothing was loaded. */
  record: Record<string, unknown> | null;
}

/** Best-effort record id from the event payload for a given module. */
function findRecordId(data: Record<string, unknown>, moduleKey: string): string | null {
  const candidates = [data.recordId, data[`${moduleKey}Id`], data.id, data.kpiId, data.priorityId];
  for (const c of candidates) if (typeof c === "string" && c) return c;
  return null;
}

/**
 * Build the enriched evaluation context for an event. One DB read at most,
 * shared across all workflows reacting to the same event.
 */
export async function loadContext(event: EngineEvent): Promise<EnrichedContext> {
  const mod = moduleForEvent(event.event);
  const moduleKey = mod?.key ?? null;
  let record: Record<string, unknown> | null = null;

  if (mod && mod.binding.readable) {
    const id = findRecordId(event.data, mod.key);
    if (id) {
      const provider = getProvider(event.app);
      const loaded = await provider?.getRecord(event.orgId, mod.key, id);
      record = loaded?.fields ?? null;
    }
  }

  // Record fields win over payload on key collisions (the record is authoritative).
  const flat: Record<string, unknown> = { ...event.data, ...(record ?? {}) };
  const trigger: Record<string, unknown> = moduleKey
    ? { ...flat, [moduleKey]: record ?? flat }
    : { ...flat };

  return { data: flat, trigger, moduleKey, record };
}
