import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Idea attachments (JPD "Add attachment"). The file is uploaded via /api/docs/
 * upload on the client; here we persist its metadata (url/name/size). GET lists,
 * POST records, DELETE removes. Read = IdeaView:view; write = Idea:update.
 */

const createSchema = z.object({
  fileName: z.string().min(1).max(400),
  // Allow a proxy URL or an inline data: URL (used when cloud storage isn't
  // configured). ~6MB ceiling covers a 4MB file base64-encoded.
  url: z.string().min(1).max(8_500_000),
  mimeType: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});

async function ideaExists(orgId: string, projectId: string, ideaId: string) {
  return db.qtIdea.findFirst({ where: { id: ideaId, orgId, projectId, isDeleted: false }, select: { id: true } });
}

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const data = await db.qtIdeaAttachment.findMany({
      where: { orgId, ideaId: params.ideaId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, url: true, mimeType: true, size: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const created = await db.qtIdeaAttachment.create({
      data: { orgId, ideaId: params.ideaId, ...parsed.data, createdBy: userId },
      select: { id: true, fileName: true, url: true, mimeType: true, size: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
