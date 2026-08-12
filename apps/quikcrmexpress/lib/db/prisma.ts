/**
 * Legacy-import compatibility shim.
 *
 * The standalone QuikCRM repo had `import { prisma } from "@/lib/db/prisma"`
 * everywhere. The monorepo provides the Prisma client as `db` from
 * `@quikit/database` (extended with the soft-delete middleware). This file
 * re-exports it under the legacy name so the ported code keeps working
 * without touching every import.
 *
 * Model accessors were renamed by scripts/migrate-quikcrm-bulk.mjs
 * (e.g. `prisma.lead` → `prisma.crmLead`) so under this alias the queries
 * resolve to the new Crm* tables.
 */
export { db as prisma } from "@/lib/db";
