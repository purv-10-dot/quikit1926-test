import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";

export const runtime = "nodejs";

// Admin-gated activity-type config (Phase 1). Mirrors the settings/company
// route's gate: requireApiUser (401) → requirePermission "settings" (403 for
// non-admins). NOT the looser requireApiUser-only pattern the disposition
// route inherits. Admins configure types; users only log activities of them.
const createSchema = z.object({
  code: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).optional().nullable(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");

    const items = await prisma.crmActivityType.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    try {
      const item = await prisma.crmActivityType.create({
        data: {
          orgId: user.orgId,
          code: parsed.data.code,
          label: parsed.data.label,
          category: parsed.data.category ?? null,
          config: (parsed.data.config ?? undefined) as Prisma.InputJsonValue | undefined,
          sortOrder: parsed.data.sortOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
        },
      });
      return NextResponse.json({ success: true, data: item }, { status: 201 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { success: false, error: "An activity type with this code already exists" },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
