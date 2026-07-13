import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const SettlementSchema = z.object({
  provider_settlement_id: z.string().min(1),
  settlement_date: z.string().min(1),
  gross_amount: z.coerce.number().min(0),
  fees_amount: z.coerce.number().min(0).default(0),
  tax_on_fees: z.coerce.number().min(0).default(0),
  net_amount: z.coerce.number().min(0),
  currency: z.string().length(3).default("INR"),
  bank_account_id: z.string().uuid().optional().nullable(),
  clearing_account_id: z.string().uuid().optional().nullable(),
  fees_account_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable()
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
  const offset = (page - 1) * limit;
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    let query = db
      .from("gateway_settlements")
      .select(
        `*, bank_accounts!bank_account_id(id, name)`,
        { count: "exact" }
      )
      .eq("org_id", orgId)
      .order("settlement_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("settlement_date", from);
    if (to) query = query.lte("settlement_date", to);

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
  const { db, orgId, userId, role } = auth.context;

  if (!["owner", "admin", "accountant"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "Insufficient permissions." });
  }

  try {
    const body = await req.json();
    const parsed = SettlementSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { data, error } = await db
      .from("gateway_settlements")
      .insert({ ...parsed.data, org_id: orgId, provider: "razorpay" })
      .select()
      .single();

    if (error) throw error;

    // Create settlement journal entry if accounts are configured
    if (parsed.data.clearing_account_id && parsed.data.bank_account_id && parsed.data.net_amount > 0) {
      const lines = [
        { account_id: parsed.data.bank_account_id, debit: parsed.data.net_amount, credit: 0, memo: `Settlement ${parsed.data.provider_settlement_id}` },
        { account_id: parsed.data.clearing_account_id, debit: 0, credit: parsed.data.gross_amount, memo: `Settlement ${parsed.data.provider_settlement_id}` }
      ];

      if (parsed.data.fees_account_id && parsed.data.fees_amount > 0) {
        lines.push({
          account_id: parsed.data.fees_account_id,
          debit: parsed.data.fees_amount + parsed.data.tax_on_fees,
          credit: 0,
          memo: `Gateway fees ${parsed.data.provider_settlement_id}`
        });
      }

      const { data: je } = await db
        .from("journal_entries")
        .insert({
          org_id: orgId,
          date: parsed.data.settlement_date,
          reference: parsed.data.provider_settlement_id,
          memo: `Razorpay settlement ${parsed.data.provider_settlement_id}`,
          status: "posted",
          created_by: userId
        })
        .select()
        .single();

      if (je) {
        await db.from("journal_entry_lines").insert(
          lines.map((l) => ({ ...l, journal_entry_id: je.id }))
        );
        await db.from("gateway_settlements").update({ journal_id: je.id, status: "processed" }).eq("id", data.id);
      }
    }

    return ok(data, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
