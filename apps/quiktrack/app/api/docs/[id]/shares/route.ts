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
import { shortCode } from "@/lib/docs/share-code";

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

    const shares = await db.$queryRaw<
      { id: string; userId: string | null; email: string | null; role: string }[]
    >`
      SELECT id, "userId", email, role FROM app_quiktrack."QtDocShare"
      WHERE "docId" = ${params.id}
      ORDER BY "createdAt" ASC
    `;

    const ids = Array.from(
      new Set(
        [doc.createdBy, ...shares.map((s) => s.userId)].filter((x): x is string => !!x),
      ),
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
        people: shares.map((s) =>
          s.userId
            ? { shareId: s.id, role: s.role, external: false, ...shapeUser(byId.get(s.userId)) }
            : {
                shareId: s.id,
                role: s.role,
                external: true,
                userId: null,
                name: s.email ?? "",
                email: s.email ?? "",
                avatar: null,
              },
        ),
        generalAccess: doc.shareToken ? "anyone" : "restricted",
        // shareMode stores "view"/"edit"; expose it as the general role.
        generalRole: doc.shareMode === "edit" ? "editor" : "viewer",
        shareToken: doc.shareToken,
      },
    });
  },
);

const postSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(["viewer", "editor"]),
  })
  .refine((d) => Boolean(d.userId) !== Boolean(d.email), {
    message: "Provide exactly one of userId or email",
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

    // ── External invite (email): a per-recipient public link, view-only. ──
    if (parsed.data.email) {
      const email = parsed.data.email.toLowerCase();
      if (parsed.data.role !== "viewer") {
        return NextResponse.json(
          { success: false, error: "External invites are view-only." },
          { status: 400 },
        );
      }
      // A draft must be published before it can be opened via a public link.
      if (doc.status === "draft") {
        return NextResponse.json(
          { success: false, error: "Publish this doc before inviting external people." },
          { status: 409 },
        );
      }
      // If the email belongs to an org member, ask the caller to add them as a
      // user (identity-based access is stronger than a link).
      const existing = await db.user.findFirst({ where: { email }, select: { id: true } });
      if (existing) {
        const inOrg = await db.orgMember.findFirst({
          where: { userId: existing.id, orgId, status: "active" },
          select: { id: true },
        });
        if (inOrg) {
          return NextResponse.json(
            { success: false, error: "That email belongs to an org member — add them as a user instead." },
            { status: 409 },
          );
        }
      }

      // Reuse an existing invite's token (stable link) or mint a new one.
      const prior = await db.$queryRaw<{ id: string; token: string | null }[]>`
        SELECT id, token FROM app_quiktrack."QtDocShare"
        WHERE "docId" = ${params.id} AND email = ${email} LIMIT 1
      `;
      let token = prior[0]?.token ?? null;
      if (prior[0]) {
        await db.$executeRaw`
          UPDATE app_quiktrack."QtDocShare"
          SET role = 'viewer', "updatedAt" = NOW()
          WHERE id = ${prior[0].id}
        `;
      } else {
        // Mint a unique token, retrying on the rare collision (23505).
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = shortCode(10);
          try {
            await db.$executeRaw`
              INSERT INTO app_quiktrack."QtDocShare"
                (id, "orgId", "docId", email, role, token, "createdBy", "createdAt", "updatedAt")
              VALUES (${randomUUID()}, ${orgId}, ${params.id}, ${email}, 'viewer', ${candidate}, ${userId}, NOW(), NOW())
            `;
            token = candidate;
            break;
          } catch (err) {
            if ((err as { code?: string })?.code === "23505" && !token) continue;
            throw err;
          }
        }
        if (!token) {
          return NextResponse.json(
            { success: false, error: "Couldn't generate an invite link, try again." },
            { status: 500 },
          );
        }
      }

      // Email the invitee the public per-recipient link (fire-and-forget).
      const shareToken = token;
      void (async () => {
        try {
          const sharer = await db.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true, lastName: true },
          });
          await emailDocShared({
            to: email,
            recipientName: null,
            docTitle: doc.title ?? "",
            projectId: doc.projectId,
            docId: params.id,
            sharedBy: sharer
              ? [sharer.firstName, sharer.lastName].filter(Boolean).join(" ").trim() || sharer.email
              : null,
            role: "viewer",
            shareToken,
          });
        } catch (e) {
          console.error("[email] doc external-share failed:", e instanceof Error ? e.message : e);
        }
      })();

      return NextResponse.json({ success: true, data: { email, role: "viewer" } }, { status: 201 });
    }

    // ── Internal invite (org user): identity-based viewer/editor. ──
    const targetId = parsed.data.userId!;
    const role = parsed.data.role;

    // The owner already has full access — don't create a redundant share.
    if (doc.createdBy && targetId === doc.createdBy) {
      return NextResponse.json(
        { success: false, error: "That person owns this doc." },
        { status: 409 },
      );
    }
    // Org-users-only: the target must be an active member of this org.
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
