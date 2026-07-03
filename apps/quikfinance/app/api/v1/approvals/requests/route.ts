import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const RequestSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().uuid(),
  entity_number: z.string().optional().nullable(),
  entity_amount: z.coerce.number().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  notes: z.string().optional().nullable(),
  due_date: z.string().optional().nullable()
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const entityType = searchParams.get("entity_type");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
  const offset = (page - 1) * limit;

  try {
    let query = db
      .from("approval_requests")
      .select("*", { count: "exact" })
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") query = query.eq("status", status);
    if (entityType) query = query.eq("entity_type", entityType);

    const { data, count, error } = await query;
    if (error) throw error;
    return ok(data ?? [], { total: count ?? 0, page, limit });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId, userId } = auth.context;

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    // Check if policy exists for this entity type
    const { data: policy } = await db
      .from("approval_policies")
      .select("*")
      .eq("org_id", orgId)
      .eq("entity_type", parsed.data.entity_type)
      .eq("is_active", true)
      .maybeSingle();

    const assignedTo = parsed.data.assigned_to ?? null;

    const { data, error } = await db
      .from("approval_requests")
      .insert({
        ...parsed.data,
        org_id: orgId,
        requested_by: userId,
        assigned_to: assignedTo,
        policy_id: policy?.id ?? null,
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;

    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action: "create",
      entity_type: "approval_request",
      entity_id: data.id,
      new_values: { entity_type: parsed.data.entity_type, entity_id: parsed.data.entity_id }
    });

    return ok(data, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
