import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";

export const runtime = "nodejs";

// Field-definition CRUD nested under an activity type. Admin-gated like the
// parent (decision #4/#10): requireApiUser (401) → requirePermission
// "settings" (403). Tenant isolation is enforced at the parent — we confirm
// the activity type belongs to the caller's org before touching its fields.
const FIELD_TYPES = [
  "Text",
  "TextArea",
  "Number",
  "Email",
  "Phone",
  "Date",
  "Boolean",
  "Select",
  "MultiSelect",
] as const;

const createSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, underscores"),
    label: z.string().trim().min(1).max(120),
    fieldType: z.enum(FIELD_TYPES),
    requirement: z.enum(["Required", "Optional"]).optional(),
    options: z.array(z.string().trim().min(1)).optional(),
    visible: z.boolean().optional(),
    helpText: z.string().trim().max(500).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })
  .refine(
    (d) => !(d.fieldType === "Select" || d.fieldType === "MultiSelect") || (d.options?.length ?? 0) > 0,
    { message: "Select / MultiSelect fields need at least one option", path: ["options"] },
  );

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

// Confirm the parent activity type exists and belongs to the caller's org.
// Returns null if not found in this org (→ 404, no cross-tenant leakage).
async function findOwnedType(orgId: string, id: string) {
  return prisma.crmActivityType.findFirst({ where: { id, orgId }, select: { id: true } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");

    const { id } = await params;
    const parent = await findOwnedType(user.orgId, id);
    if (!parent) {
      return NextResponse.json(
        { success: false, error: "Activity type not found" },
        { status: 404 },
      );
    }

    const items = await prisma.crmActivityFieldDefinition.findMany({
      where: { orgId: user.orgId, activityTypeId: id },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const { id } = await params;
    const parent = await findOwnedType(user.orgId, id);
    if (!parent) {
      return NextResponse.json(
        { success: false, error: "Activity type not found" },
        { status: 404 },
      );
    }

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
      const item = await prisma.crmActivityFieldDefinition.create({
        data: {
          orgId: user.orgId,
          activityTypeId: id,
          key: parsed.data.key,
          label: parsed.data.label,
          fieldType: parsed.data.fieldType,
          requirement: parsed.data.requirement ?? "Optional",
          options: (parsed.data.options ?? undefined) as Prisma.InputJsonValue | undefined,
          visible: parsed.data.visible ?? true,
          helpText: parsed.data.helpText ?? null,
          sortOrder: parsed.data.sortOrder ?? 0,
        },
      });
      return NextResponse.json({ success: true, data: item }, { status: 201 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { success: false, error: "A field with this key already exists on this activity type" },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
