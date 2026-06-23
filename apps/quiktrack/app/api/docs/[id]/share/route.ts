import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canManageDocSharing } from "@/lib/api/docAccess";
import { shortCode } from "@/lib/docs/share-code";

/**
 * Manage a doc's general (public-link) access. Only the owner or an org/app
 * admin can change it (canManageDocSharing). The link is a short base62 code in
 * `QtDoc.shareToken`; `shareMode` is "viewer"-equivalent "view" | "edit".
 *
 * General access maps onto these existing columns:
 *   - "restricted" → shareToken NULL (no public link)
 *   - "anyone"     → shareToken set, shareMode = the general role.
 */

interface DocRow {
  id: string;
  projectId: string;
  createdBy: string | null;
  status: string;
  shareToken: string | null;
  shareMode: string | null;
}

async function loadDoc(orgId: string, docId: string): Promise<DocRow | null> {
  const rows = await db.$queryRaw<DocRow[]>`
    SELECT id, "projectId", "createdBy", status, "shareToken", "shareMode"
    FROM app_quiktrack."QtDoc"
    WHERE id = ${docId} AND "orgId" = ${orgId} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

const postSchema = z.object({ mode: z.enum(["view", "edit"]).default("edit") });

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json({ success: false, error: "Only the owner or an admin can share this doc." }, { status: 403 });
    }
    // A draft is private to its author — don't let it be exposed via a public
    // share link. Publish it first.
    if (doc.status === "draft") {
      return NextResponse.json(
        { success: false, error: "Publish this doc before sharing it publicly." },
        { status: 409 },
      );
    }
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid mode" }, { status: 400 });
    }
    const mode = parsed.data.mode;

    // Already shared → just update the mode, keep the existing code.
    if (doc.shareToken) {
      await db.$executeRaw`
        UPDATE app_quiktrack."QtDoc"
        SET "shareMode" = ${mode}, "updatedAt" = NOW()
        WHERE id = ${params.id} AND "orgId" = ${orgId}
      `;
      return NextResponse.json({ success: true, data: { token: doc.shareToken, mode } });
    }

    // Generate a unique short code, retrying on the rare unique-collision (23505).
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = shortCode(8);
      try {
        await db.$executeRaw`
          UPDATE app_quiktrack."QtDoc"
          SET "shareToken" = ${token}, "shareMode" = ${mode}, "updatedAt" = NOW()
          WHERE id = ${params.id} AND "orgId" = ${orgId}
        `;
        return NextResponse.json({ success: true, data: { token, mode } });
      } catch (err) {
        if ((err as { code?: string })?.code === "23505") continue; // collision → retry
        throw err;
      }
    }
    return NextResponse.json(
      { success: false, error: "Could not generate a share link, try again." },
      { status: 500 },
    );
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json({ success: false, error: "Only the owner or an admin can share this doc." }, { status: 403 });
    }
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET "shareToken" = NULL, "shareMode" = NULL, "updatedAt" = NOW()
      WHERE id = ${params.id} AND "orgId" = ${orgId}
    `;
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);

const patchSchema = z.object({
  generalAccess: z.enum(["restricted", "anyone"]),
  generalRole: z.enum(["viewer", "editor"]).default("viewer"),
});

// Set the doc's general (public-link) access. Owner/admin only.
export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json({ success: false, error: "Only the owner or an admin can share this doc." }, { status: 403 });
    }
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { generalAccess, generalRole } = parsed.data;

    if (generalAccess === "restricted") {
      await db.$executeRaw`
        UPDATE app_quiktrack."QtDoc"
        SET "shareToken" = NULL, "shareMode" = NULL, "updatedAt" = NOW()
        WHERE id = ${params.id} AND "orgId" = ${orgId}
      `;
      return NextResponse.json({ success: true, data: { generalAccess, generalRole: null } });
    }

    // "anyone": a draft must be published first (it'd otherwise leak privately).
    if (doc.status === "draft") {
      return NextResponse.json(
        { success: false, error: "Publish this doc before giving anyone-with-the-link access." },
        { status: 409 },
      );
    }
    // The shareMode column stores "view"/"edit"; map from the general role.
    const mode = generalRole === "editor" ? "edit" : "view";

    if (doc.shareToken) {
      await db.$executeRaw`
        UPDATE app_quiktrack."QtDoc"
        SET "shareMode" = ${mode}, "updatedAt" = NOW()
        WHERE id = ${params.id} AND "orgId" = ${orgId}
      `;
      return NextResponse.json({ success: true, data: { generalAccess, generalRole, token: doc.shareToken } });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = shortCode(8);
      try {
        await db.$executeRaw`
          UPDATE app_quiktrack."QtDoc"
          SET "shareToken" = ${token}, "shareMode" = ${mode}, "updatedAt" = NOW()
          WHERE id = ${params.id} AND "orgId" = ${orgId}
        `;
        return NextResponse.json({ success: true, data: { generalAccess, generalRole, token } });
      } catch (err) {
        if ((err as { code?: string })?.code === "23505") continue;
        throw err;
      }
    }
    return NextResponse.json(
      { success: false, error: "Could not generate a share link, try again." },
      { status: 500 },
    );
  },
);
