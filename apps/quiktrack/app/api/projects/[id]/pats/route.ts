import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { createPatSchema } from "@/lib/validation/pat";
import { generatePatToken, hashPatToken } from "@/lib/api/patToken";

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const pats = await db.qtPersonalAccessToken.findMany({
      where: { projectId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdById: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return NextResponse.json({ success: true, data: pats });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);

export const POST = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId }, req) => {
    const parsed = createPatSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const rawToken = generatePatToken();
    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

    const pat = await db.qtPersonalAccessToken.create({
      data: {
        orgId: orgId,
        projectId,
        createdById: userId,
        name: parsed.data.name,
        tokenHash: hashPatToken(rawToken),
        expiresAt,
      },
      select: { id: true, name: true, expiresAt: true, createdAt: true },
    });

    return NextResponse.json(
      { success: true, data: { ...pat, token: rawToken } },
      { status: 201 },
    );
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
