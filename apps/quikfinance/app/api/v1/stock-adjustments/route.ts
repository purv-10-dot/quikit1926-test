import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const AdjSchema = z.object({
  warehouse_id: z.string().uuid(),
  adjustment_number: z.string().min(1),
  adjustment_date: z.string().min(1),
  reason: z.enum(["damage", "expiry", "correction", "initial_stock", "write_off", "found", "other"]),
  notes: z.string().optional().nullable(),
  lines: z.array(
    z.object({
      item_id: z.string().uuid(),
      qty_before: z.coerce.number().default(0),
      qty_change: z.coerce.number(),
      qty_after: z.coerce.number().default(0),
      unit_cost: z.coerce.number().min(0).default(0),
      value_change: z.coerce.number().default(0),
      notes: z.string().optional().nullable()
    })
  ).min(1)
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
  const offset = (page - 1) * limit;

  try {
    const { data, count, error } = await db
      .from("stock_adjustments")
      .select(`*, warehouses!warehouse_id(id, name)`, { count: "exact" })
      .eq("org_id", orgId)
      .order("adjustment_date", { ascending: false })
      .range(offset, offset + limit - 1);

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
    const parsed = AdjSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { lines, ...adjData } = parsed.data;
    const totalValueChange = lines.reduce((s, l) => s + (l.value_change ?? 0), 0);

    const { data: adj, error: adjErr } = await db
      .from("stock_adjustments")
      .insert({ ...adjData, org_id: orgId, created_by: userId, total_value_change: totalValueChange })
      .select()
      .single();

    if (adjErr) throw adjErr;

    await db.from("stock_adjustment_lines").insert(lines.map((l) => ({ ...l, adjustment_id: adj.id })));

    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action: "create",
      entity_type: "stock_adjustment",
      entity_id: adj.id,
      new_values: adjData
    });

    return ok(adj, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
