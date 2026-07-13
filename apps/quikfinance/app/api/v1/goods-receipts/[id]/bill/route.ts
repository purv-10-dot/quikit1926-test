import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { convertGrnToBill } from "@/lib/accounting/grn-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const bodySchema = z.object({ tax_total: z.coerce.number().min(0).default(0) });

/** Convert a received goods receipt into a vendor bill (clears GRNI → A/P). */
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
  const taxTotal = parsed.success ? parsed.data.tax_total : 0;

  try {
    const result = await prisma.$transaction((tx) => convertGrnToBill(tx, orgId, userId, params.id, taxTotal));
    return ok(result, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CONVERT_FAILED", message: errorMessage(error) });
  }
}
