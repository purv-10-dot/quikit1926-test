"use client";

/**
 * Single source of truth for "which React Query keys does a change to a given
 * module invalidate".
 *
 * This is shared by BOTH:
 *   - the mutation hooks (the editor's own client, in useKPI / usePriority /
 *     useWWW / createCRUDHook), and
 *   - the real-time socket provider (other users' clients).
 *
 * They MUST agree. Before this helper they had drifted: the mutation hooks
 * invalidated `[resource, "list"]` + `["dashboard"]` but NOT the dashboard
 * infinite-scroll lists (`["<resource>-infinite"]`). The socket provider did
 * invalidate the `-infinite` keys — so other users saw a change live, but the
 * editor (echo-suppressed on the socket) had to refresh to see their own change
 * on the Dashboard. Routing every path through this helper keeps them in lockstep.
 *
 * Keying `ENTITY_INVALIDATION_KEYS` by `DashboardEntity` makes TypeScript enforce
 * that every entity has an entry — adding a new entity won't compile until its
 * keys are declared here.
 */
import type { QueryClient } from "@tanstack/react-query";

export type DashboardEntity = "kpi" | "priority" | "www";

/**
 * The query-key families a change to each entity must invalidate:
 *   - `[entity, "list"]`     → the module's own list page (prefix-matches its
 *                              paginated + filtered variants)
 *   - `["<entity>-infinite"]` → the Dashboard's infinite-scroll table for it
 *   - `["dashboard"]`         → the Dashboard summary aggregate
 * (the per-row `[entity, "detail", id]` key is added by `invalidateEntity` when
 * an id is supplied.)
 */
export const ENTITY_INVALIDATION_KEYS: Record<DashboardEntity, readonly (readonly string[])[]> = {
  kpi: [["kpi", "list"], ["kpi-infinite"], ["dashboard"]],
  priority: [["priority", "list"], ["priority-infinite"], ["dashboard"]],
  www: [["www", "list"], ["www-infinite"], ["dashboard"]],
};

/**
 * Invalidate every query affected by a change to `entity`. Pass `id` to also
 * bust that row's detail cache (which prefix-matches its weekly/notes/audit
 * children). Best-effort: a missing mapping degrades to the list + dashboard.
 *
 * `refetchType: "all"` is deliberate. By default `invalidateQueries` only
 * REFETCHES the queries that are currently active (mounted); inactive ones are
 * merely marked stale and don't refetch until they remount. The editor almost
 * never has the Dashboard mounted while editing on a module page, so with the
 * default the Dashboard's `["<entity>-infinite"]` + `["dashboard"]` queries sat
 * stale and only refreshed on the NEXT navigation to the Dashboard — which read
 * to users as "my edit didn't show up". Forcing `"all"` refetches those
 * inactive queries in the background the moment any edit lands, so the Dashboard
 * is already fresh whenever the user switches to it (and updates live if it's
 * already open).
 */
export function invalidateEntity(
  queryClient: QueryClient,
  entity: DashboardEntity,
  opts?: { id?: string },
): void {
  const families =
    ENTITY_INVALIDATION_KEYS[entity] ?? [[entity, "list"], ["dashboard"]];
  for (const key of families) {
    queryClient.invalidateQueries({ queryKey: key as readonly unknown[], refetchType: "all" });
  }
  if (opts?.id) {
    queryClient.invalidateQueries({ queryKey: [entity, "detail", opts.id], refetchType: "all" });
  }
}
