import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { purchaseOrderSettingsSchema, loadPurchaseOrderSettings } from "@/lib/settings/purchase-order";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  try {
    return ok(await loadPurchaseOrderSettings(auth.context.prisma, auth.context.orgId));
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown = {};
  try { body = await request.json(); } catch { body = {}; }
  const parsed = purchaseOrderSettingsSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The settings are invalid.", details: parsed.error.flatten() });

  try {
    await prisma.$executeRaw`UPDATE organizations SET purchase_order_settings = ${JSON.stringify(parsed.data)}::jsonb, updated_at = now() WHERE id = ${orgId}::uuid`;
    return ok(parsed.data);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export const POST = PUT;
