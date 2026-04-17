import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { updateSettingsSchema } from "@/lib/schemas/settingsSchema";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const blocked = await gateModuleApi("admin", "settings", tenantId);
  if (blocked) return blocked;

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      brandColor: true,
      plan: true,
      billingEmail: true,
      status: true,
      fiscalYearStart: true,
      quarterStartMonth: true,
      weekStartDay: true,
      createdAt: true,
    },
  });

  if (!tenant) {
    return NextResponse.json({ success: false, error: "Organisation not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: tenant });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const blocked = await gateModuleApi("admin", "settings", tenantId);
  if (blocked) return blocked;

  const body = await request.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const updated = await db.tenant.update({
    where: { id: tenantId },
    data,
  });

  return NextResponse.json({ success: true, data: updated });
}
