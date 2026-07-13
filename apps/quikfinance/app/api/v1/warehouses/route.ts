import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";
import { sqltag as sql } from "@prisma/client/runtime/library";
import { sqlIdentifier } from "@/lib/api/prisma-sql";

const WarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(20),
  type: z.enum(["business", "warehouse"]).default("business"),
  default_series_id: z.string().uuid().optional().nullable(),
  address: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  notes: z.string().optional().nullable()
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const data = (await prisma.$queryRaw(
      sql`
        SELECT *
        FROM ${sqlIdentifier("warehouses")}
        WHERE ${sqlIdentifier("org_id")}::text = ${orgId}
        ORDER BY ${sqlIdentifier("is_default")} DESC, ${sqlIdentifier("name")} ASC
      `
    )) as unknown[];
    return ok(data ?? []);
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId, role } = auth.context;

  if (!["owner", "admin"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can create warehouses." });
  }

  try {
    const body = await req.json();
    const parsed = WarehouseSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    if (parsed.data.is_default) {
      await prisma.$executeRaw(
        sql`
          UPDATE ${sqlIdentifier("warehouses")}
          SET ${sqlIdentifier("is_default")} = false
          WHERE ${sqlIdentifier("org_id")}::text = ${orgId}
        `
      );
    }

    const data = (await prisma.$queryRaw(
      sql`
        INSERT INTO ${sqlIdentifier("warehouses")} (
          ${sqlIdentifier("org_id")},
          ${sqlIdentifier("created_by")},
          ${sqlIdentifier("name")},
          ${sqlIdentifier("code")},
          ${sqlIdentifier("type")},
          ${sqlIdentifier("default_series_id")},
          ${sqlIdentifier("address")},
          ${sqlIdentifier("is_active")},
          ${sqlIdentifier("is_default")},
          ${sqlIdentifier("notes")}
        ) VALUES (
          ${orgId}::uuid,
          ${userId}::uuid,
          ${parsed.data.name},
          ${parsed.data.code},
          ${parsed.data.type},
          ${parsed.data.default_series_id ?? null}::uuid,
          ${JSON.stringify(parsed.data.address ?? {})}::jsonb,
          ${parsed.data.is_active},
          ${parsed.data.is_default},
          ${parsed.data.notes}
        ) RETURNING *
      `
    )) as unknown;

    return ok(data, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
