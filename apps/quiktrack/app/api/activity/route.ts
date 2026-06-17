import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * Uses raw SQL against `app_quiktrack."QtUserActivity"` so that this route
 * keeps working even when the generated Prisma JS client hasn't picked up
 * the new model yet (e.g. after a Windows DLL-locked `prisma generate`).
 * Once the client is regenerated, the same SQL keeps working.
 */

const recordSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(["project", "board", "list", "task", "epic", "dashboard"]),
  ref: z.string().max(120).optional(),
  title: z.string().min(1).max(255),
  meta: z.string().max(255).optional(),
  href: z.string().min(1).max(500),
  icon: z.string().max(50).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
});

interface ActivityRow {
  id: string;
  projectId: string;
  kind: string;
  ref: string;
  title: string;
  meta: string | null;
  href: string;
  icon: string | null;
  color: string | null;
  viewedAt: Date;
}

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));

  // Restrict to projects the user is still a member of.
  const visible = await db.qtProjectMember.findMany({
    where: { userId, isDeleted: false, project: { orgId: orgId, isDeleted: false } },
    select: { projectId: true },
  });
  const projectIds = visible.map((v) => v.projectId);
  if (projectIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const rows = await db.$queryRaw<ActivityRow[]>`
    SELECT
      "id",
      "projectId",
      "kind",
      "ref",
      "title",
      "meta",
      "href",
      "icon",
      "color",
      "viewedAt"
    FROM "app_quiktrack"."QtUserActivity"
    WHERE "orgId" = ${orgId}
      AND "userId" = ${userId}
      AND "projectId" IN (${Prisma.join(projectIds)})
    ORDER BY "viewedAt" DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ success: true, data: rows });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = recordSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { projectId, kind, ref = "", title, meta, href, icon, color } = parsed.data;

  // Confirm membership via Prisma (existing model — independent of QtUserActivity).
  const project = await db.qtProject.findFirst({
    where: {
      id: projectId,
      orgId: orgId,
      isDeleted: false,
      members: { some: { userId, isDeleted: false } },
    },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 404 });
  }

  // ON CONFLICT requires a UNIQUE index — present at (userId, projectId, kind, ref).
  await db.$executeRaw`
    INSERT INTO "app_quiktrack"."QtUserActivity"
      ("id", "orgId", "userId", "projectId", "kind", "ref",
       "title", "meta", "href", "icon", "color", "viewedAt")
    VALUES
      (
        'act_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
        ${orgId},
        ${userId},
        ${projectId},
        ${kind},
        ${ref},
        ${title},
        ${meta ?? null},
        ${href},
        ${icon ?? null},
        ${color ?? null},
        NOW()
      )
    ON CONFLICT ("userId", "projectId", "kind", "ref")
    DO UPDATE SET
      "title" = EXCLUDED."title",
      "meta" = EXCLUDED."meta",
      "href" = EXCLUDED."href",
      "icon" = EXCLUDED."icon",
      "color" = EXCLUDED."color",
      "viewedAt" = NOW()
  `;

  return NextResponse.json({ success: true });
});
