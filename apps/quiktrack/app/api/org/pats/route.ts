import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createPatSchema } from "@/lib/validation/pat";
import { generatePatToken, hashPatToken } from "@/lib/api/patToken";

// GET /api/org/pats — every PAT this user has created in this org, whether a
// new user-scoped token (projectId: null) or a legacy project-scoped one
// issued before user-scoped tokens existed. Self-service: any active org
// member manages their own tokens, no special permission required, since a
// PAT can never grant more than its creator's own QuikTrack permissions.
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const pats = await db.qtPersonalAccessToken.findMany({
    where: { orgId, createdById: userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      projectId: true,
      project: { select: { name: true } },
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  return NextResponse.json({ success: true, data: pats });
});

// POST /api/org/pats — always creates a user-scoped token (projectId: null).
// There is no project-scoped creation path anymore; see
// documents/MCP-V1-Auth-Scope-Requirements.md for why.
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
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
      orgId,
      projectId: null,
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
});
