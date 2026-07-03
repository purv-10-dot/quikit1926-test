import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const PolicySchema = z.object({
  name: z.string().min(1),
  entity_type: z.enum(["bill", "purchase_order", "journal_entry", "expense", "credit_note", "vendor_credit"]),
  is_active: z.boolean().default(true),
  require_approval_above: z.coerce.number().optional().nullable(),
  approver_role: z.enum(["owner", "admin", "accountant"]).default("admin"),
  auto_approve_below: z.coerce.number().optional().nullable(),
  sequential_approvals: z.boolean().default(false),
  notes: z.string().optional().nullable()
});

export async function GET(_req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  try {
    const { data, error } = await db
      .from("approval_policies")
      .select("*")
      .eq("org_id", orgId)
      .order("entity_type")
      .order("name");
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

  if (!["owner", "admin"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can configure approval policies." });
  }

  try {
    const body = await req.json();
    const parsed = PolicySchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { data, error } = await db
      .from("approval_policies")
      .insert({ ...parsed.data, org_id: orgId, created_by: userId })
      .select()
      .single();

    if (error) throw error;
    return ok(data, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
