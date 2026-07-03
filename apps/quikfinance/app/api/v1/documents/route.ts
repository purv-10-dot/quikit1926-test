import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const DocumentSchema = z.object({
  file_name: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.coerce.number().int().min(0).default(0),
  storage_path: z.string().min(1),
  public_url: z.string().optional().nullable(),
  category: z.enum(["invoice", "bill", "bank_statement", "tax_document", "contract", "receipt", "other"]).default("other"),
  tags: z.array(z.string()).default([])
});

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
  const offset = (page - 1) * limit;

  try {
    let query = db
      .from("documents")
      .select("*", { count: "exact" })
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq("category", category);
    if (search) query = query.ilike("file_name", `%${search}%`);

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
    const parsed = DocumentSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    const { data, error } = await db
      .from("documents")
      .insert({ ...parsed.data, org_id: orgId, uploaded_by: userId })
      .select()
      .single();

    if (error) throw error;
    return ok(data, {}, { status: 201 });
  } catch (e) {
    return fail(500, { code: "CREATE_ERROR", message: errorMessage(e) });
  }
}
