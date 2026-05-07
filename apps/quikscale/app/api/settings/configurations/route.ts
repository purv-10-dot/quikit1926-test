import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { updateConfigurationsSchema } from "@/lib/schemas/settingsSchema";

export async function GET() {
  try {
    // Feature flags are readable by any authenticated tenant member —
    // only PATCH (writing) requires admin.
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const orgId = await getOrgId(session.user.id);
    if (!orgId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const flags = await db.featureFlag.findMany({
      where: { orgId },
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

    const { orgId } = auth;

    const body = await request.json();
    const parsed = updateConfigurationsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const results = await Promise.all(
      parsed.data.flags.map((flag) =>
        db.featureFlag.upsert({
          where: { orgId_key: { orgId, key: flag.key } },
          create: {
            orgId,
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
