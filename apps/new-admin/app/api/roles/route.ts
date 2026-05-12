import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";

/**
 * GET /api/roles?appSlug=xxx — list roles available for an app inside the
 * caller's org.
 *
 * Each app maintains its own `AppRole` table in its own Postgres schema
 * (`app_<slug>.AppRole`). The shared Prisma schema does not model AppRole
 * (see MIGRATION_NOTES.md), so we query the per-app schema with raw SQL.
 *
 * Resolution order — first non-empty source wins:
 *   1. Live rows: `app_<slug>."AppRole" WHERE "orgId" = :orgId`
 *   2. Fallback: static `User` (default) + `Admin` so the modal always has
 *      something selectable while AppRole rows are being seeded.
 *
 * Also exposes the table-existence + row-count via response metadata so the
 * UI can tell "real DB roles" apart from "static defaults" if needed.
 */

interface AppRoleResponse {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissionCount: number;
  userCount: number;
}

const STATIC_FALLBACK_ROLES: AppRoleResponse[] = [
  {
    id: "system:user",
    name: "User",
    description: "Standard member access — view & contribute on assigned data",
    isSystem: true,
    isDefault: true,
    permissionCount: 0,
    userCount: 0,
  },
  {
    id: "system:admin",
    name: "Admin",
    description: "Full access within this app",
    isSystem: true,
    isDefault: false,
    permissionCount: 0,
    userCount: 0,
  },
];

/** Slug whitelist — only lowercase letters, digits, hyphens, underscores.
 *  Prevents SQL injection on the schema name we have to interpolate. */
const SAFE_SLUG = /^[a-z0-9_-]+$/;

async function tableExists(schema: string, table: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`SELECT EXISTS (
      SELECT 1
        FROM information_schema.tables
       WHERE table_schema = ${schema}
         AND table_name   = ${table}
    ) AS "exists";`,
  );
  return Boolean(rows[0]?.exists);
}

interface RawRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  createdAt: Date;
}

async function fetchAppRoles(schema: string, orgId: string): Promise<RawRow[]> {
  // Schema name was already validated to match SAFE_SLUG (and only constructed
  // by us as `app_<slug>`), so direct interpolation here is safe. orgId is
  // still parameterised so user-controlled data never lands in the SQL string.
  const sql = `
    SELECT id, name, description, "isSystem", "isDefault", "createdAt"
      FROM "${schema}"."AppRole"
     WHERE "orgId" = $1
     ORDER BY "isSystem" DESC, "createdAt" ASC;
  `;
  return db.$queryRawUnsafe<RawRow[]>(sql, orgId);
}

export const GET = withAdminAuth(async ({ orgId }, req: NextRequest) => {
  const appSlug = req.nextUrl.searchParams.get("appSlug");
  if (!appSlug) {
    return NextResponse.json(
      { success: false, error: "appSlug is required" },
      { status: 400 },
    );
  }
  if (!SAFE_SLUG.test(appSlug)) {
    return NextResponse.json(
      { success: false, error: "appSlug contains invalid characters" },
      { status: 400 },
    );
  }

  const schema = `app_${appSlug}`;

  // 1. Does this app have an AppRole table at all?
  let exists = false;
  try {
    exists = await tableExists(schema, "AppRole");
  } catch {
    exists = false;
  }

  // 2. If yes, try to read the org's rows.
  let rows: RawRow[] = [];
  if (exists) {
    try {
      rows = await fetchAppRoles(schema, orgId);
    } catch {
      rows = [];
    }
  }

  // 3. Map to the shape the modal expects; fall back if empty.
  if (rows.length > 0) {
    const data: AppRoleResponse[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isDefault: r.isDefault,
      permissionCount: 0,
      userCount: 0,
    }));
    // Ensure exactly one default — if none flagged, mark the first row.
    if (!data.some((r) => r.isDefault) && data.length > 0) {
      data[0].isDefault = true;
    }
    return NextResponse.json({
      success: true,
      data,
      meta: { source: "db", schema, tableExists: true, rowCount: data.length },
    });
  }

  return NextResponse.json({
    success: true,
    data: STATIC_FALLBACK_ROLES,
    meta: { source: "fallback", schema, tableExists: exists, rowCount: 0 },
  });
});

/**
 * POST /api/roles — create a custom role.
 * Custom-role creation still requires the deferred shared-schema migration
 * (see MIGRATION_NOTES.md). Returns 501 until unlocked.
 */
export const POST = withAdminAuth(async () => {
  return NextResponse.json(
    {
      success: false,
      error: "Custom role creation is pending schema migration",
    },
    { status: 501 },
  );
});
