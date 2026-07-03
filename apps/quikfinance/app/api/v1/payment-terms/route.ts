import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { paymentTermSchema } from "@/lib/validations/payment-term.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT * FROM payment_terms WHERE org_id = ${orgId}::uuid ORDER BY is_system DESC, days ASC, name ASC`) as unknown[];
    return ok(rows, { total: (rows as unknown[]).length, page: 1, per_page: (rows as unknown[]).length });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can manage payment terms." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = paymentTermSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The payment term is invalid.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    if (d.is_default) await prisma.$executeRaw`UPDATE payment_terms SET is_default = false WHERE org_id = ${orgId}::uuid`;
    const rows = (await prisma.$queryRaw`
      INSERT INTO payment_terms (org_id, name, term_type, days, is_default, is_active)
      VALUES (${orgId}::uuid, ${d.name}, ${d.term_type}, ${d.days}, ${d.is_default}, ${d.is_active})
      RETURNING *`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
