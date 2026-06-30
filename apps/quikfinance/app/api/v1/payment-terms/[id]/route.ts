import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { paymentTermSchema } from "@/lib/validations/payment-term.schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: RouteContext) {
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
    const existing = (await prisma.$queryRaw`SELECT is_system FROM payment_terms WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ is_system: boolean }>;
    if (!existing.length) return fail(404, { code: "NOT_FOUND", message: "Payment term was not found." });
    if (d.is_default) await prisma.$executeRaw`UPDATE payment_terms SET is_default = false WHERE org_id = ${orgId}::uuid AND id <> ${params.id}::uuid`;
    // System terms keep their name/days; only the default/active flags are editable.
    if (existing[0].is_system) {
      await prisma.$executeRaw`UPDATE payment_terms SET is_default = ${d.is_default}, is_active = ${d.is_active}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    } else {
      await prisma.$executeRaw`UPDATE payment_terms SET name = ${d.name}, term_type = ${d.term_type}, days = ${d.days}, is_default = ${d.is_default}, is_active = ${d.is_active}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    }
    const rows = (await prisma.$queryRaw`SELECT * FROM payment_terms WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can manage payment terms." });
  try {
    const rows = (await prisma.$queryRaw`SELECT is_system, is_default FROM payment_terms WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ is_system: boolean; is_default: boolean }>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Payment term was not found." });
    if (rows[0].is_system) return fail(409, { code: "SYSTEM_TERM", message: "Default system payment terms cannot be deleted." });
    if (rows[0].is_default) return fail(409, { code: "DEFAULT_TERM", message: "Make another term the default before deleting this one." });
    await prisma.$executeRaw`DELETE FROM payment_terms WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
