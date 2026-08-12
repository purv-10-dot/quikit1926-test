/**
 * Client-safe filter constants.
 *
 * These live OUTSIDE filter-engine.ts on purpose: the engine imports the Prisma
 * client (a value import, for Prisma.AnyNull etc.), which must never be bundled
 * into the browser. Client components (leads-explorer, toolbars) only need these
 * plain constants, so they import from here instead of from the engine — keeping
 * the Prisma runtime out of the client bundle.
 *
 * The engine re-exports these for server-side callers, so existing server
 * imports from "@/lib/services/leads/filter-engine" keep working unchanged.
 */

/** Pseudo-field sent by the leads toolbar search box (not shown in advanced filter). */
export const LEAD_QUICK_SEARCH_FIELD = "__quickSearch";

/** Columns matched by the toolbar "Search name, email, company…" input. */
export const LEAD_QUICK_SEARCH_COLUMNS = [
  "name",
  "email",
  "company",
  "phone",
  "mobile",
  "jobTitle",
] as const;
