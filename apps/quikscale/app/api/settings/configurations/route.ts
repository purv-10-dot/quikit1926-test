import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { updateConfigurationsSchema } from "@/lib/schemas/settingsSchema";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;

    const { tenantId } = auth;

    const flags = await db.featureFlag.findMany({
      where: { tenantId },
      select: { id: true, key: true, name: true, enabled: true, value: true },
    });

    return NextResponse.json({ success: true, data: flags });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch configurations";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;

    const { tenantId } = auth;

    const body = await request.json();
    const parsed = updateConfigurationsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const results = await Promise.all(
      parsed.data.flags.map((flag) =>
        db.featureFlag.upsert({
          where: { tenantId_key: { tenantId, key: flag.key } },
          create: {
            tenantId,
            key: flag.key,
            name: flag.key.replace(/_/g, " "),
            enabled: flag.enabled ?? false,
            value: flag.value ?? null,
          },
          update: {
            ...(flag.enabled !== undefined && { enabled: flag.enabled }),
            ...(flag.value !== undefined && { value: flag.value }),
          },
          select: { id: true, key: true, name: true, enabled: true, value: true },
        })
      )
    );

    return NextResponse.json({ success: true, data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update configurations";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
