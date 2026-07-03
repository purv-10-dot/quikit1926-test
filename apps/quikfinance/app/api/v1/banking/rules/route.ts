import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const RuleSchema = z.object({
  bank_account_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  is_active: z.boolean().default(true),
  priority: z.coerce.number().int().default(0),
  match_type: z.enum(["contains", "starts_with", "ends_with", "exact", "regex"]).default("contains"),
  match_field: z.enum(["description", "amount", "reference"]).default("description"),
  match_value: z.string().min(1),
  amount_min: z.coerce.number().optional().nullable(),
  amount_max: z.coerce.number().optional().nullable(),
  transaction_type: z.enum(["credit", "debit"]).optional().nullable(),
  action_account_id: z.string().uuid().optional().nullable(),
  action_contact_id: z.string().uuid().optional().nullable(),
  action_category: z.string().optional().nullable(),
  auto_reconcile: z.boolean().default(false)
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const bankAccountId = searchParams.get("bank_account_id");

  try {
    let query = db
      .from("bank_rules")
      .select(`*, accounts!action_account_id(id, name, code), contacts!action_contact_id(id, display_name)`)
      .eq("org_id", orgId)
      .order("priority", { ascending: false })
      .order("created_at");

    if (bankAccountId) query = query.eq("bank_account_id", bankAccountId);

    const { data, error } = await query;
    if (error) throw error;
    return ok(data ?? []);
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId, userId, role } = auth.context;

  if (!["owner", "admin", "accountant"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "Insufficient permissions." });
  }

  try {
    const body = await req.json();
    const parsed = RuleSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { data, error } = await db
      .from("bank_rules")
      .insert({ ...parsed.data, org_id: orgId, created_by: userId })
      .select()
      .single();

    if (error) throw error;
    return ok(data, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
