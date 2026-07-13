import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const TransferSchema = z.object({
  transfer_number: z.string().min(1),
  transfer_date: z.string().min(1),
  from_warehouse_id: z.string().uuid(),
  to_warehouse_id: z.string().uuid(),
  notes: z.string().optional().nullable(),
  lines: z.array(
    z.object({
      item_id: z.string().uuid(),
      qty_requested: z.coerce.number().min(0),
      qty_transferred: z.coerce.number().min(0).default(0),
      unit_cost: z.coerce.number().min(0).default(0),
      notes: z.string().optional().nullable()
    })
  ).min(1)
}).refine((d) => d.from_warehouse_id !== d.to_warehouse_id, {
  message: "Source and destination warehouses must be different."
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
      .from("stock_transfers")
      .select(
        `*,
         from_wh:warehouses!from_warehouse_id(id, name),
         to_wh:warehouses!to_warehouse_id(id, name)`,
        { count: "exact" }
      )
      .eq("org_id", orgId)
      .order("transfer_date", { ascending: false })
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
    const parsed = TransferSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { lines, ...txData } = parsed.data;

    const { data: tx, error: txErr } = await db
      .from("stock_transfers")
      .insert({ ...txData, org_id: orgId, created_by: userId, status: "draft" })
      .select()
      .single();

    if (txErr) throw txErr;

    await db.from("stock_transfer_lines").insert(lines.map((l) => ({ ...l, transfer_id: tx.id })));

    return ok(tx, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
