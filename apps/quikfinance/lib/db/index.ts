import { prisma } from "@/lib/prisma";
import { createDbClient, DbClient } from "@/lib/db/query-builder";

/**
 * Application database client, backed by Prisma raw SQL.
 *
 * Replaces the former Supabase data client. There is no row-level security
 * layer anymore — every query must scope by `org_id` in application code
 * (the API context helpers and CRUD layer already do this).
 */
export const db: DbClient = createDbClient(prisma);

// Re-export the local class binding (value + type) so consumers can
// `import { db, type DbClient } from "@/lib/db"`. A combined type-only import +
// `export … from` on the same name confused the export (DbClient resolved as a
// type-only re-export, which degraded `db` to PrismaClient downstream).
export { DbClient };
