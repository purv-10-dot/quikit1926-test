/**
 * GET /api/settings/company — tenant company profile for Settings → Company.
 * PATCH /api/settings/company — upsert CrmCompanyProfile (settings.edit).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  getCompanyProfileForSettings,
  upsertCompanyProfile,
} from "@/lib/services/company-profile";
import { companyProfilePatchSchema } from "@/lib/validators/company-profile";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");

    const data = await getCompanyProfileForSettings(user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load company profile";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const raw = await req.json().catch(() => null);
    const parsed = companyProfilePatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = await upsertCompanyProfile(user.orgId, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update company profile";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
