import type { LeadFieldDefinition } from "@/types/field-definition";

export interface OwnerOption {
  id: string;
  name: string;
  email: string;
}
export interface SourceOption {
  id: string;
  name: string;
}
export interface PipelineConfig {
  stages: string[];
  statuses: string[];
  substatuses: string[];
  dependentRules: {
    sourceToStages?: Record<string, string[]>;
    stageToStatuses?: Record<string, string[]>;
    statusToSubstatuses?: Record<string, string[]>;
  };
}

// Promise-level cache. First caller initiates the fetch; concurrent and later
// callers share the in-flight promise (and its resolved value). The cache lives
// for the page-session lifetime — a hard reload or route change clears it.
const cache: {
  defs?: Promise<LeadFieldDefinition[]>;
  owners?: Promise<OwnerOption[]>;
  sources?: Promise<SourceOption[]>;
  pipeline?: Promise<PipelineConfig | null>;
} = {};

export function invalidateCustomFieldDefsCache(): void {
  delete cache.defs;
}

export function fetchCustomFieldDefs(): Promise<LeadFieldDefinition[]> {
  if (!cache.defs) {
    cache.defs = fetch("/api/settings/fields?customOnly=true", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        const items: LeadFieldDefinition[] = Array.isArray(j?.items) ? j.items : [];
        return items.filter((d) => d.visible !== false);
      })
      .catch(() => []);
  }
  return cache.defs;
}

export function fetchOwners(): Promise<OwnerOption[]> {
  if (!cache.owners) {
    // /api/leads/owners is gated on leads:view (not users:view) and returns the
    // full active team as { id, name, email } — the id is what the owner filter
    // matches against Lead.ownerId. See app/api/leads/owners/route.ts.
    cache.owners = fetch("/api/leads/owners", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return [];
        const list: OwnerOption[] = Array.isArray(j?.items)
          ? j.items.map((u: { id: string; name?: string; email?: string }) => ({
              id: u.id,
              name: u.name || u.email || u.id,
              email: u.email ?? "",
            }))
          : [];
        return list;
      })
      .catch(() => []);
  }
  return cache.owners;
}

export function invalidateSourcesCache(): void {
  delete cache.sources;
}

export function fetchSources(): Promise<SourceOption[]> {
  if (!cache.sources) {
    cache.sources = fetch("/api/leads/sources", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return [];
        return Array.isArray(j?.items) ? (j.items as SourceOption[]) : [];
      })
      .catch(() => []);
  }
  return cache.sources;
}

export function invalidatePipelineConfigCache(): void {
  delete cache.pipeline;
}

export function fetchPipelineConfig(): Promise<PipelineConfig | null> {
  if (!cache.pipeline) {
    cache.pipeline = fetch("/api/settings/workspace", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.leadPipelineConfig) return null;
        const cfg = j.leadPipelineConfig as PipelineConfig;
        return cfg;
      })
      .catch(() => null);
  }
  return cache.pipeline;
}

/**
 * Fire all four lookups in parallel without awaiting — used by parent pages to
 * warm the cache before the user opens the Add-lead drawer. Subsequent calls
 * (from the form's useEffect) reuse the in-flight or resolved promises.
 */
export function prefetchLeadFormLookups(): void {
  void fetchCustomFieldDefs();
  void fetchOwners();
  void fetchSources();
  void fetchPipelineConfig();
}
