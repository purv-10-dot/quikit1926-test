import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { groupAccountsSchema } from "@/lib/validators/settings-sales-groups";
import { addAccounts, removeAccount } from "@/lib/services/settings/sales-groups.service";
import { SettingsConflictError } from "@/lib/services/settings/users.service";

export const runtime = "nodejs";

const removeSchema = z.object({ accountId: z.string().trim().min(1) });

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
    const parsed = groupAccountsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    await addAccounts({ actor: user, groupId: id, accountIds: parsed.data.accountIds });
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
    const parsed = removeSchema.safeParse({ accountId: url.searchParams.get("accountId") });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    await removeAccount({ actor: user, groupId: id, accountId: parsed.data.accountId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
