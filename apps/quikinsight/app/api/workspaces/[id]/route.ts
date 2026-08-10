import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@quikit/database";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qi = db as any;

export const runtime = "nodejs";

async function ownerGuard(id: string, userId: string) {
  const ws = await qi.qiWorkspace.findFirst({ where: { id, userId } });
  return ws ?? null;
}

const renameSchema = z.object({ name: z.string().min(1).max(80) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!await ownerGuard(params.id, session.user.id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  try {
    const ws = await qi.qiWorkspace.update({
      where: { id: params.id },
      data: { name: parsed.data.name },
    });
    return NextResponse.json({ success: true, data: ws });
  } catch {
    return NextResponse.json({ error: "Name already taken" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!await ownerGuard(params.id, session.user.id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const count = await qi.qiWorkspace.count({ where: { userId: session.user.id } });
  if (count <= 1) return NextResponse.json({ error: "Cannot delete your only workspace" }, { status: 400 });

  await qi.qiWorkspace.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
