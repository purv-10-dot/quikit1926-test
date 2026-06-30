import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["bank", "credit_card"]).default("bank"),
  name: z.string().trim().min(2).max(160),
  account_code: z.string().trim().max(40).optional().nullable(),
  currency: z.string().trim().length(3).default("INR"),
  account_number: z.string().trim().max(40).optional().nullable(),
  bank_name: z.string().trim().max(160).optional().nullable(),
  ifsc: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  is_primary: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can add bank accounts." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid bank account.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // A credit card is a liability; a bank account is a bank asset in the chart of accounts.
      const accountType = d.kind === "credit_card" ? "other_current_liability" : "bank";
      const glRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO accounts (org_id, code, name, account_type, currency, is_active, show_on_dashboard)
        VALUES (${orgId}::uuid, ${d.account_code ?? null}, ${d.name}, ${accountType}, ${d.currency}, true, true)
        RETURNING id`;
      const glId = glRows[0].id;

      if (d.is_primary) {
        await tx.$executeRaw`UPDATE bank_accounts SET is_primary = false WHERE org_id = ${orgId}::uuid AND is_primary = true`;
      }
      const last4 = (d.account_number ?? "").replace(/\s/g, "").slice(-4) || null;
      const bankRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO bank_accounts (org_id, account_id, name, kind, account_code, institution_name, account_number, account_number_last4, ifsc, description, currency, current_balance, is_primary, is_active)
        VALUES (${orgId}::uuid, ${glId}::uuid, ${d.name}, ${d.kind}, ${d.account_code ?? null}, ${d.bank_name ?? null}, ${d.account_number ?? null}, ${last4}, ${d.ifsc ?? null}, ${d.description ?? null}, ${d.currency}, 0, ${d.is_primary}, true)
        RETURNING id`;
      return { id: bankRows[0].id, account_id: glId };
    });
    return ok(result, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
