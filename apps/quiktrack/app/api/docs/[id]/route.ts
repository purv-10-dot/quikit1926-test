import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canDoc } from "@/lib/api/docPermissions";
import { notifyDocMentions } from "@/lib/services/mentions";

/**
 * Single-doc routes — also raw-SQL backed because the local Prisma client is
 * sometimes stale on the new `QtDoc` model.
 */

interface DocRow {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  content: string;
  templateKey: string | null;
  folderId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

async function loadDoc(orgId: string, docId: string): Promise<DocRow | null> {
  const rows = await db.$queryRaw<DocRow[]>`
    SELECT id, "orgId", "projectId", title, content, "templateKey", "folderId",
           "createdBy", "updatedBy", "isDeleted", "createdAt", "updatedAt"
    FROM app_quiktrack."QtDoc"
    WHERE id = ${docId} AND "orgId" = ${orgId} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canDoc(userId, orgId, doc.projectId, "view"))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: doc });
  },
);

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(2_000_000).optional(),
  // null = move to root; a string = move into that folder. `.optional()` so a
  // title/content-only save leaves the doc's folder untouched.
  folderId: z.string().min(1).nullable().optional(),
});

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canDoc(userId, orgId, doc.projectId, "update"))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const nextTitle = parsed.data.title ?? doc.title;
    const nextContent = parsed.data.content ?? doc.content;

    // Only touch folderId when the key is actually present in the payload —
    // `undefined` (absent) keeps the current folder, `null` moves to root, a
    // string moves into a folder (validated to live in the same project/org).
    const movingFolder = "folderId" in parsed.data;
    let nextFolderId = doc.folderId;
    if (movingFolder) {
      nextFolderId = parsed.data.folderId ?? null;
      if (nextFolderId) {
        const ok = await db.$queryRaw<{ id: string }[]>`
          SELECT id FROM app_quiktrack."QtDocFolder"
          WHERE id = ${nextFolderId} AND "orgId" = ${orgId}
            AND "projectId" = ${doc.projectId} AND "isDeleted" = false
          LIMIT 1
        `;
        if (ok.length === 0) {
          return NextResponse.json(
            { success: false, error: "Folder not found in this project" },
            { status: 400 },
          );
        }
      }
    }

    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET title = ${nextTitle},
          content = ${nextContent},
          "folderId" = ${nextFolderId},
          "updatedBy" = ${userId},
          "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;
    // Email anyone newly @-mentioned in the doc (diff vs the previous content
    // so the auto-saving editor doesn't re-notify existing mentions).
    if (parsed.data.content !== undefined) {
      void notifyDocMentions({
        orgId,
        actorUserId: userId,
        doc: { id: params.id, title: nextTitle, projectId: doc.projectId },
        html: nextContent,
        prevHtml: doc.content,
      });
    }
    return NextResponse.json({
      success: true,
      data: {
        ...doc,
        title: nextTitle,
        content: nextContent,
        folderId: nextFolderId,
        updatedBy: userId,
      },
    });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canDoc(userId, orgId, doc.projectId, "delete"))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET "isDeleted" = true, "updatedBy" = ${userId}, "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);
