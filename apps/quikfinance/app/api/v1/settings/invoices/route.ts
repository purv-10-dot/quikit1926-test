import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSettingsSchema, loadInvoiceSettings } from "@/lib/settings/invoice";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  try {
    return ok(await loadInvoiceSettings(auth.context.prisma, auth.context.orgId));
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
  const parsed = invoiceSettingsSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The settings are invalid.", details: parsed.error.flatten() });

  try {
    await prisma.$executeRaw`UPDATE organizations SET invoice_settings = ${JSON.stringify(parsed.data)}::jsonb, updated_at = now() WHERE id = ${orgId}::uuid`;
    return ok(parsed.data);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export const POST = PUT;
