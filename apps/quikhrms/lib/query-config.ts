/**
 * Centralized staleTime config per query key pattern.
 * Use in useQuery: staleTime: getStaleTime(queryKey)
 *
 * Or apply globally via QueryClient's queryCache defaultOptions.
 *
 * Categories:
 * - Static (5-10 min): settings, departments, designations, grades, leave types, categories
 * - Moderate (1-2 min): employee lists, candidate lists
 * - Fresh (30s default): tickets, notifications, dashboard stats
 */

const STATIC_KEYS = [
  "settings",
  "departments-list",
  "departments",
  "designations",
  "grades",
  "leave-types",
  "ticket-categories",
  "roles",
  "permissions",
  "holiday-calendars",
  "payroll-components",
  "salary-templates",
] as const;

const MODERATE_KEYS = [
  "employees",
  "candidates",
  "requisitions",
  "payroll",
] as const;

/** Get appropriate staleTime for a query key. */
export function getStaleTime(queryKey: readonly unknown[]): number {
  const first = String(queryKey[0] ?? "");

  if (STATIC_KEYS.some((k) => first === k || first.startsWith(k))) {
    return 5 * 60_000; // 5 minutes
  }
  if (MODERATE_KEYS.some((k) => first === k || first.startsWith(k))) {
    return 60_000; // 1 minute
  }
  return 30_000; // 30 seconds (default)
}
