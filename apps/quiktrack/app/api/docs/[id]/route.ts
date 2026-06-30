import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canDoc } from "@/lib/api/docPermissions";
import {
  resolveDocAccess,
  canEditDocRole,
  canManageDocSharing,
} from "@/lib/api/docAccess";
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
  status: string;
  shareToken: string | null;
  shareMode: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

async function loadDoc(orgId: string, docId: string): Promise<DocRow | null> {
  const rows = await db.$queryRaw<DocRow[]>`
    SELECT id, "orgId", "projectId", title, content, "templateKey", "folderId",
           status, "shareToken", "shareMode",
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
    // Effective role across owner/admin, explicit share, and project access
    // (drafts stay author/share-only). No role → no access.
    const role = await resolveDocAccess(userId, orgId, doc);
    if (!role) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Surface the role so the editor can enable/disable editing for shared users
    // who aren't project members.
    return NextResponse.json({ success: true, data: { ...doc, role } });
  },
);

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(2_000_000).optional(),
  // null = move to root; a string = move into that folder. `.optional()` so a
  // title/content-only save leaves the doc's folder untouched.
  folderId: z.string().min(1).nullable().optional(),
  // Publish/unpublish toggle. Gated separately from content edits.
  status: z.enum(["draft", "published"]).optional(),
});

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // No access at all → 404 (don't reveal the draft/doc exists).
    const role = await resolveDocAccess(userId, orgId, doc);
    if (!role) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const wantsStatusChange =
      parsed.data.status !== undefined && parsed.data.status !== doc.status;
    const wantsContentChange =
      parsed.data.title !== undefined ||
      parsed.data.content !== undefined ||
      "folderId" in parsed.data;

    // Editing title/content/folder needs an editor-or-higher role (owner,
    // explicit editor share, or project Doc:update — all resolved above).
    if (wantsContentChange && !canEditDocRole(role)) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    // Publishing/unpublishing is restricted to the owner or an admin.
    if (wantsStatusChange && !(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }

    const nextStatus = wantsStatusChange ? parsed.data.status! : doc.status;
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

    // Only write `status` when it's actually being toggled, so a frequent
    // content auto-save can never clobber a concurrent publish/unpublish.
    if (wantsStatusChange) {
      await db.$executeRaw`
        UPDATE app_quiktrack."QtDoc"
        SET title = ${nextTitle},
            content = ${nextContent},
            "folderId" = ${nextFolderId},
            status = ${nextStatus},
            "updatedBy" = ${userId},
            "updatedAt" = NOW()
        WHERE id = ${params.id}
      `;
    } else {
      await db.$executeRaw`
        UPDATE app_quiktrack."QtDoc"
        SET title = ${nextTitle},
            content = ${nextContent},
            "folderId" = ${nextFolderId},
            "updatedBy" = ${userId},
            "updatedAt" = NOW()
        WHERE id = ${params.id}
      `;
    }
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
        status: nextStatus,
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
    // No access at all → 404. Deleting needs owner/admin OR project Doc:delete
    // (explicit viewer/editor shares can't delete).
    const role = await resolveDocAccess(userId, orgId, doc);
    if (!role) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const canRemove =
      (await canManageDocSharing(userId, orgId, doc)) ||
      (await canDoc(userId, orgId, doc.projectId, "delete"));
    if (!canRemove) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET "isDeleted" = true, "updatedBy" = ${userId}, "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);
