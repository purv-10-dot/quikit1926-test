/**
 * GET    /api/notifications/rules/[id]          — fetch one rule
 * PATCH  /api/notifications/rules/[id]          — update a rule
 * DELETE /api/notifications/rules/[id]          — delete a rule
 * POST   /api/notifications/rules/[id]/toggle   — NOT HERE (use PATCH with isActive)
 *
 * Admin-only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getRuleById, updateRule, deleteRule, toggleRuleActive } from "@/lib/notifications/rules/db";

export const runtime = "nodejs";

const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  entityType: z.enum(["lead", "task", "opportunity", "quote", "contact"]).optional(),
  fieldName: z.string().max(100).optional().nullable(),
  conditionType: z.enum([
    "entity_created", "entity_updated", "entity_deleted",
    "field_changed", "field_equals", "field_not_equals",
    "field_contains", "field_greater_than", "field_less_than",
  ]).optional(),
  conditionValue: z.string().max(500).optional().nullable(),
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  recipientType: z.enum(["owner", "manager", "specific_user", "specific_role"]).optional(),
  recipientValue: z.string().max(200).optional().nullable(),
  messageTemplate: z.string().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rule = await getRuleById(user.tenantId, id);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = updateRuleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Fast-path for toggle (single isActive boolean PATCH).
    if (Object.keys(parsed.data).length === 1 && "isActive" in parsed.data) {
      const rule = await toggleRuleActive(user.tenantId, id, parsed.data.isActive!);
      if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ rule });
    }

    const rule = await updateRule(user.tenantId, id, parsed.data);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "delete");
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exists = await getRuleById(user.tenantId, id);
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await deleteRule(user.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
