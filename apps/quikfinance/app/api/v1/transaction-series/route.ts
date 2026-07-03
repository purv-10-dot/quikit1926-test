import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { seriesSchema } from "@/lib/validations/transaction-series.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT * FROM transaction_series WHERE org_id = ${orgId}::uuid ORDER BY is_default DESC, name ASC`) as unknown[];
    return ok(rows, { total: (rows as unknown[]).length, page: 1, per_page: (rows as unknown[]).length });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can manage transaction series." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = seriesSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The series is invalid.", details: parsed.error.flatten() });

  try {
    if (parsed.data.is_default) {
      await prisma.$executeRaw`UPDATE transaction_series SET is_default = false WHERE org_id = ${orgId}::uuid`;
    }
    const rows = (await prisma.$queryRaw`
      INSERT INTO transaction_series (org_id, name, is_default, config)
      VALUES (${orgId}::uuid, ${parsed.data.name}, ${parsed.data.is_default}, ${JSON.stringify(parsed.data.config)}::jsonb)
      RETURNING *`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
