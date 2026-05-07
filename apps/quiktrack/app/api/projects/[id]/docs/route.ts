import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { DOC_TEMPLATES, getTemplate } from "@/lib/docs/templates";

/**
 * Docs API uses raw SQL because the local Prisma client is sometimes stale
 * with the new `QtDoc` model accessor on Windows (DLL-lock issue). As long as
 * `prisma db push` has run the underlying `app_quiktrack."QtDoc"` table will
 * exist, and these queries will work.
 */

const PAGE_SIZE = 50;

interface DocRow {
  id: string;
  title: string;
  templateKey: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const type = url.searchParams.get("type")?.trim() ?? "";
    const limitRaw = Number(url.searchParams.get("limit") || PAGE_SIZE);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : PAGE_SIZE));

    const rows = await db.$queryRaw<DocRow[]>`
      SELECT id, title, "templateKey", "createdBy", "createdAt", "updatedAt"
      FROM app_quiktrack."QtDoc"
      WHERE "projectId" = ${projectId}
        AND "isDeleted" = false
        AND (${search} = '' OR title ILIKE ${"%" + search + "%"})
        AND (${type} = '' OR "templateKey" = ${type})
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ success: true, data: rows });
  },
  { paramKey: "id" },
);

const createSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  templateKey: z.string().min(1).max(60).nullable().optional(),
});

export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId, userId }, req) => {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const tpl = getTemplate(parsed.data.templateKey);
    const id = randomUUID();
    const title = parsed.data.title?.trim() || tpl?.name || "Untitled page";
    const content = tpl?.body ?? "<p></p>";
    const templateKey = parsed.data.templateKey ?? null;

    await db.$executeRaw`
      INSERT INTO app_quiktrack."QtDoc"
        (id, "orgId", "projectId", title, content, "templateKey",
         "createdBy", "updatedBy", "isDeleted", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${projectId}, ${title}, ${content}, ${templateKey},
         ${userId}, ${userId}, false, NOW(), NOW())
    `;
    return NextResponse.json(
      {
        success: true,
        data: {
          id,
          title,
          templateKey,
          createdBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  },
  { paramKey: "id" },
);

// Convenience: surface the template list for the picker without a separate
// endpoint. Hit this with `?templates=1`.
export const PUT = withProjectAccess(async (_ctx, req) => {
  const url = new URL(req.url);
  if (!url.searchParams.get("templates")) {
    return NextResponse.json({ success: false, error: "Use POST" }, { status: 405 });
  }
  return NextResponse.json({ success: true, data: DOC_TEMPLATES });
});
