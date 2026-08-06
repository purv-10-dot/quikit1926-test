/**
 * GET  /api/notifications/rules   — list all rules for the tenant
 * POST /api/notifications/rules   — create a new rule
 *
 * Admin-only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listRules, createRule } from "@/lib/notifications/rules/db";

export const runtime = "nodejs";

// ─── Validation ───────────────────────────────────────────────────────────────

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  entityType: z.enum(["lead", "task", "opportunity", "quote", "contact"]),
  fieldName: z.string().max(100).optional().nullable(),
  conditionType: z.enum([
    "entity_created",
    "entity_updated",
    "entity_deleted",
    "field_changed",
    "field_equals",
    "field_not_equals",
    "field_contains",
    "field_greater_than",
    "field_less_than",
  ]),
  conditionValue: z.string().max(500).optional().nullable(),
  notifyInApp: z.boolean().default(true),
  notifyEmail: z.boolean().default(false),
  recipientType: z.enum(["owner", "manager", "specific_user", "specific_role"]),
  recipientValue: z.string().max(200).optional().nullable(),
  messageTemplate: z.string().min(1).max(1000),
  isActive: z.boolean().default(true),
});

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rules = await listRules(user.tenantId);
    return NextResponse.json({ rules });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "create");
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createRuleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const rule = await createRule({ tenantId: user.tenantId, ...parsed.data });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
