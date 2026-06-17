/**
 * Canonical database accessor for QuikHRMS.
 *
 * House convention (root CLAUDE.md → "Shared Package Imports"): import `db`
 * from "@/lib/db", which re-exports the shared @quikit/database client. HRMS's
 * tables live in the `app_quikhrms` schema of that single shared multiSchema
 * Prisma client — same as quikscale/quiktrack/quikinfra.
 */
export { db } from "@quikit/database";
