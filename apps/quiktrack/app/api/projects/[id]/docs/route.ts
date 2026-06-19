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
  folderId: string | null;
  createdBy: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerAvatar: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// 42703 undefined_column — `folderId` may not exist yet if the doc-folders
// migration hasn't been applied. Fall back to the legacy query so the Pages
// tab keeps listing docs (all treated as root) instead of 500-ing.
function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string })?.code === "42703";
}

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const type = url.searchParams.get("type")?.trim() ?? "";
    // `folder`: "root" → only un-foldered docs; a folder id → that folder's
    // docs; absent/"" → all (back-compat). Combined with offset/limit this
    // drives per-list lazy/infinite-scroll loading so we never bulk-load.
    const folder = url.searchParams.get("folder")?.trim() ?? "";
    const folderRoot = folder === "root";
    const folderId = folderRoot || folder === "" ? "" : folder;
    const limitRaw = Number(url.searchParams.get("limit") || PAGE_SIZE);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : PAGE_SIZE));
    const offsetRaw = Number(url.searchParams.get("offset") || 0);
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
    // Fetch one extra row to detect whether another page exists.
    const fetchN = limit + 1;

    function respond(rows: DocRow[]) {
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      return NextResponse.json({ success: true, data, hasMore });
    }

    try {
      // LEFT JOIN the auth user so the list can show an Owner column (avatar +
      // name) without a second round-trip.
      const rows = await db.$queryRaw<DocRow[]>`
        SELECT d.id, d.title, d."templateKey", d."folderId", d."createdBy",
               u."firstName" AS "ownerFirstName", u."lastName" AS "ownerLastName",
               u.avatar AS "ownerAvatar",
               d."createdAt", d."updatedAt"
        FROM app_quiktrack."QtDoc" d
        LEFT JOIN "auth"."User" u ON u.id = d."createdBy"
        WHERE d."projectId" = ${projectId}
          AND d."isDeleted" = false
          AND (${search} = '' OR d.title ILIKE ${"%" + search + "%"})
          AND (${type} = '' OR d."templateKey" = ${type})
          AND (NOT ${folderRoot} OR d."folderId" IS NULL)
          AND (${folderId} = '' OR d."folderId" = ${folderId})
        ORDER BY d."updatedAt" DESC
        LIMIT ${fetchN} OFFSET ${offset}
      `;
      return respond(rows);
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
      // Pre-migration fallback: no folderId column → everything is root.
      const legacy = await db.$queryRaw<Omit<DocRow, "folderId">[]>`
        SELECT d.id, d.title, d."templateKey", d."createdBy",
               u."firstName" AS "ownerFirstName", u."lastName" AS "ownerLastName",
               u.avatar AS "ownerAvatar",
               d."createdAt", d."updatedAt"
        FROM app_quiktrack."QtDoc" d
        LEFT JOIN "auth"."User" u ON u.id = d."createdBy"
        WHERE d."projectId" = ${projectId}
          AND d."isDeleted" = false
          AND (${search} = '' OR d.title ILIKE ${"%" + search + "%"})
          AND (${type} = '' OR d."templateKey" = ${type})
        ORDER BY d."updatedAt" DESC
        LIMIT ${fetchN} OFFSET ${offset}
      `;
      return respond(legacy.map((r) => ({ ...r, folderId: null })));
    }
  },
  { paramKey: "id" },
);

const createSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  templateKey: z.string().min(1).max(60).nullable().optional(),
  // Optional edited body — sent when a draft is first saved so the user's
  // edits persist on create instead of being overwritten by the template body.
  content: z.string().max(2_000_000).optional(),
  // Optional target folder so a doc can be created directly inside one (the
  // folder "+" action). Must be a live folder in this project.
  folderId: z.string().min(1).nullable().optional(),
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
    const title = parsed.data.title?.trim() || tpl?.name || "Untitled doc";
    // Prefer the edited body sent by the draft editor; fall back to the
    // template body for a fresh create.
    const content = parsed.data.content ?? tpl?.body ?? "<p></p>";
    const templateKey = parsed.data.templateKey ?? null;
    const folderId = parsed.data.folderId ?? null;

    if (folderId) {
      const ok = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM app_quiktrack."QtDocFolder"
        WHERE id = ${folderId} AND "orgId" = ${orgId}
          AND "projectId" = ${projectId} AND "isDeleted" = false
        LIMIT 1
      `;
      if (ok.length === 0) {
        return NextResponse.json(
          { success: false, error: "Folder not found in this project" },
          { status: 400 },
        );
      }
    }

    await db.$executeRaw`
      INSERT INTO app_quiktrack."QtDoc"
        (id, "orgId", "projectId", title, content, "templateKey", "folderId",
         "createdBy", "updatedBy", "isDeleted", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${projectId}, ${title}, ${content}, ${templateKey}, ${folderId},
         ${userId}, ${userId}, false, NOW(), NOW())
    `;
    // Resolve the creator for the Owner column so the response matches the
    // shape the list query returns.
    const owner = await db.$queryRaw<
      { firstName: string | null; lastName: string | null; avatar: string | null }[]
    >`
      SELECT "firstName", "lastName", avatar FROM "auth"."User" WHERE id = ${userId} LIMIT 1
    `;
    return NextResponse.json(
      {
        success: true,
        data: {
          id,
          title,
          templateKey,
          folderId,
          createdBy: userId,
          ownerFirstName: owner[0]?.firstName ?? null,
          ownerLastName: owner[0]?.lastName ?? null,
          ownerAvatar: owner[0]?.avatar ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  },
  { paramKey: "id", requirePermission: { resource: "Doc", action: "create" } },
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
