import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listQuoteTemplates } from "@/lib/services/quotes/enterprise/template-service";

export const runtime = "nodejs";

const patchSchema = z.object({
  id: z.string(),
  themeColor: z.string().optional(),
  termsDefault: z.string().optional(),
  watermarkText: z.string().nullable().optional(),
  bankDetailsJson: z.record(z.unknown()).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const data = await listQuoteTemplates(user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list templates";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
    }
    if (parsed.data.isDefault) {
      await db.qceQuoteTemplate.updateMany({
        where: { orgId: user.orgId },
        data: { isDefault: false },
      });
    }
    const row = await db.qceQuoteTemplate.update({
      where: { id: parsed.data.id },
      data: {
        themeColor: parsed.data.themeColor,
        termsDefault: parsed.data.termsDefault,
        watermarkText: parsed.data.watermarkText,
        bankDetailsJson:
          (parsed.data.bankDetailsJson as Prisma.InputJsonValue | null) ?? undefined,
        isDefault: parsed.data.isDefault,
      },
    });
    return NextResponse.json({ success: true, data: row });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
