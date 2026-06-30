import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { processDueRecurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

/** Generate documents for every recurring profile that is due on/before today. */
export async function POST(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  const today = new Date().toISOString().slice(0, 10);

  try {
    const generated = await processDueRecurring(prisma, orgId, userId, today);
    return ok({ generated });
  } catch (error) {
    return fail(400, { code: "RUN_FAILED", message: errorMessage(error) });
  }
}
