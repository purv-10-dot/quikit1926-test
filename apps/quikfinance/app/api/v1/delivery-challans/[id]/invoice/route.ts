import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { convertChallanToInvoice } from "@/lib/accounting/delivery-challan-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const bodySchema = z.object({
  issue_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional(),
  due_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional()
});

/** Convert a delivery challan into a customer invoice (the invoice posts the GL + stock). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  const options = parsed.success ? parsed.data : {};

  try {
    const result = await prisma.$transaction((tx) => convertChallanToInvoice(tx, orgId, userId, params.id, options));
    return ok(result, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CONVERT_FAILED", message: errorMessage(error) });
  }
}
