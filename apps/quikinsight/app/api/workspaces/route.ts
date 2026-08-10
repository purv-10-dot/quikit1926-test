import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@quikit/database";
import { ensureDefaultWorkspace } from "@/lib/workspace";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qi = db as any;

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const orgId = (session.user.orgId as string) ?? "";

  // Auto-create Default workspace on first visit.
  await ensureDefaultWorkspace(userId, orgId);

  const workspaces = await qi.qiWorkspace.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { connections: true } } },
  });

  return NextResponse.json({ success: true, data: workspaces });
}

const createSchema = z.object({ name: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const orgId = (session.user.orgId as string) ?? "";

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  try {
    const ws = await qi.qiWorkspace.create({
      data: { userId, orgId, name: parsed.data.name },
    });
    return NextResponse.json({ success: true, data: ws }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Name already taken" }, { status: 409 });
  }
}
