import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { groupMembersSchema } from "@/lib/validators/settings-sales-groups";
import { addMembers, removeMember } from "@/lib/services/settings/sales-groups.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

const removeSchema = z.object({
  userId: z.string().trim().min(1),
  asManager: z.boolean().default(false),
});

function conflict(e: unknown) {
  if (e instanceof SettingsConflictError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");
    const parsed = groupMembersSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    await addMembers({ actor: user, groupId: id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");
    const url = new URL(req.url);
    const parsed = removeSchema.safeParse({
      userId: url.searchParams.get("userId"),
      asManager: url.searchParams.get("asManager") === "true",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    await removeMember({ actor: user, groupId: id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
