import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Mark a draft delivery challan as open (ready to dispatch). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const updated = (await prisma.$executeRaw`
      UPDATE delivery_challans SET status = 'open', updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND status = 'draft'`) as number;
    if (!updated) return fail(409, { code: "INVALID_STATE", message: "Only a draft challan can be marked open." });
    return ok({ id: params.id, status: "open" });
  } catch (error) {
    return fail(400, { code: "OPEN_FAILED", message: errorMessage(error) });
  }
}
