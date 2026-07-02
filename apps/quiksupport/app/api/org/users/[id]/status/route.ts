import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";

const bodySchema = z.object({
  status: z.enum(["active", "inactive"]),
});

// PATCH /api/org/users/[id]/status — toggle org membership status.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "User not in organisation" }, { status: 404 });
    }

    const updated = await db.orgMember.update({
      where: { id: membership.id },
      data: { status: parsed.data.status },
      select: { id: true, userId: true, status: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
