import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  resolveDocAccess,
  canManageDocSharing,
  type DocForAccess,
} from "@/lib/api/docAccess";
import { emailDocShared } from "@/lib/email/sendEmail";

/**
 * Per-user document sharing. Raw SQL on QtDocShare (the generated Prisma client
 * can be stale on these models on Windows — same reason the docs routes do).
 */

interface ShareDocRow extends DocForAccess {
  orgId: string;
  title: string;
  shareToken: string | null;
  shareMode: string | null;
}

async function loadDoc(orgId: string, docId: string): Promise<ShareDocRow | null> {
  const rows = await db.$queryRaw<ShareDocRow[]>`
    SELECT id, "orgId", "projectId", title, "createdBy", status, "shareToken", "shareMode"
    FROM app_quiktrack."QtDoc"
    WHERE id = ${docId} AND "orgId" = ${orgId} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
}

function shapeUser(u: UserLite | undefined | null) {
  if (!u) return null;
  return {
    userId: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
    email: u.email,
    avatar: u.avatar,
  };
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    // Anyone with access to the doc can see who it's shared with; only owners/
    // admins can change it (enforced on the mutating routes).
    if (!(await resolveDocAccess(userId, orgId, doc))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const canManage = await canManageDocSharing(userId, orgId, doc);

    const shares = await db.$queryRaw<{ id: string; userId: string; role: string }[]>`
      SELECT id, "userId", role FROM app_quiktrack."QtDocShare"
      WHERE "docId" = ${params.id} AND "userId" IS NOT NULL
      ORDER BY "createdAt" ASC
    `;

    const ids = Array.from(
      new Set([doc.createdBy, ...shares.map((s) => s.userId)].filter((x): x is string => !!x)),
    );
    const users = ids.length
      ? await db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u] as const));

    return NextResponse.json({
      success: true,
      data: {
        canManage,
        owner: shapeUser(doc.createdBy ? byId.get(doc.createdBy) : null),
        people: shares.map((s) => ({
          shareId: s.id,
          role: s.role,
          ...shapeUser(byId.get(s.userId)),
        })),
        generalAccess: doc.shareToken ? "anyone" : "restricted",
        // shareMode stores "view"/"edit"; expose it as the general role.
        generalRole: doc.shareMode === "edit" ? "editor" : "viewer",
        shareToken: doc.shareToken,
      },
    });
  },
);

const postSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["viewer", "editor"]),
});

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json(
        { success: false, error: "Only the owner or an admin can share this doc." },
        { status: 403 },
      );
    }
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { userId: targetId, role } = parsed.data;

    // The owner already has full access — don't create a redundant share.
    if (doc.createdBy && targetId === doc.createdBy) {
      return NextResponse.json(
        { success: false, error: "That person owns this doc." },
        { status: 409 },
      );
    }
    // Org-users-only (MVP): the target must be an active member of this org.
    const member = await db.orgMember.findFirst({
      where: { userId: targetId, orgId, status: "active" },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "That user isn't in this organization." },
        { status: 400 },
      );
    }

    const id = randomUUID();
    // Upsert: re-sharing an existing person just updates their role.
    await db.$executeRaw`
      INSERT INTO app_quiktrack."QtDocShare"
        (id, "orgId", "docId", "userId", role, "createdBy", "createdAt", "updatedAt")
      VALUES (${id}, ${orgId}, ${params.id}, ${targetId}, ${role}, ${userId}, NOW(), NOW())
      ON CONFLICT ("docId", "userId")
      DO UPDATE SET role = ${role}, "updatedAt" = NOW()
    `;

    // Notify the person by email with the doc link (fire-and-forget — a mail
    // hiccup must not fail the share).
    void (async () => {
      try {
        const [target, sharer] = await Promise.all([
          db.user.findUnique({
            where: { id: targetId },
            select: { email: true, firstName: true, lastName: true },
          }),
          db.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true, lastName: true },
          }),
        ]);
        if (target?.email) {
          await emailDocShared({
            to: target.email,
            recipientName:
              [target.firstName, target.lastName].filter(Boolean).join(" ").trim() || null,
            docTitle: doc.title ?? "",
            projectId: doc.projectId,
            docId: params.id,
            sharedBy: sharer
              ? [sharer.firstName, sharer.lastName].filter(Boolean).join(" ").trim() || sharer.email
              : null,
            role,
          });
        }
      } catch (e) {
        console.error("[email] doc-share failed:", e instanceof Error ? e.message : e);
      }
    })();

    return NextResponse.json({ success: true, data: { userId: targetId, role } }, { status: 201 });
  },
);
