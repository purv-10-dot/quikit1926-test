import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canDoc } from "@/lib/api/docPermissions";
import { shortCode } from "@/lib/docs/share-code";

/**
 * Manage a doc's public share link. Only someone with edit access can create or
 * revoke a link (canDoc "update"). The link itself is a short base62 code in
 * `QtDoc.shareToken`; `shareMode` is "view" | "edit".
 */

interface DocRow {
  id: string;
  projectId: string;
  status: string;
  shareToken: string | null;
  shareMode: string | null;
}

async function loadDoc(orgId: string, docId: string): Promise<DocRow | null> {
  const rows = await db.$queryRaw<DocRow[]>`
    SELECT id, "projectId", status, "shareToken", "shareMode"
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
    if (!(await canDoc(userId, orgId, doc.projectId, "update"))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
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
    if (!(await canDoc(userId, orgId, doc.projectId, "update"))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET "shareToken" = NULL, "shareMode" = NULL, "updatedAt" = NOW()
      WHERE id = ${params.id} AND "orgId" = ${orgId}
    `;
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);
