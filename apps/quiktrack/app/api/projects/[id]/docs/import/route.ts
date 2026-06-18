import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import {
  convertFileToHtml,
  sanitizeDocHtml,
  titleFromFilename,
  UnsupportedFileError,
} from "@/lib/docs/import-to-html";

// Node runtime — mammoth/pdf-parse need Buffer + Node APIs.
export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB upload cap
const MAX_CONTENT_CHARS = 2_000_000; // matches the doc PATCH limit

function isBlobLike(x: unknown): x is Blob & { name?: string } {
  return typeof x === "object" && x !== null && typeof (x as Blob).arrayBuffer === "function";
}

/**
 * POST /api/projects/[id]/docs/import — multipart upload that converts a
 * document file (.docx/.md/.html/.txt/.pdf) into sanitized HTML and creates a
 * new QtDoc from it. Gated on Doc:create. Optional `folderId` drops it in a
 * folder.
 */
export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId, userId }, req) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const folderIdRaw = form?.get("folderId");
    const folderId = typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null;

    if (!isBlobLike(file)) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: "File too large (max 15MB)" }, { status: 400 });
    }
    const filename = file.name || "Imported doc";
    const buf = Buffer.from(await file.arrayBuffer());

    let html: string;
    try {
      html = sanitizeDocHtml(await convertFileToHtml(buf, filename));
    } catch (err) {
      if (err instanceof UnsupportedFileError) {
        return NextResponse.json(
          { success: false, error: "Unsupported file type. Use .docx, .md, .html, .txt or .pdf." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, error: "Couldn't read that file." },
        { status: 400 },
      );
    }
    if (html.length > MAX_CONTENT_CHARS) {
      return NextResponse.json(
        { success: false, error: "Document is too large after conversion (likely embedded images). Try a smaller file." },
        { status: 400 },
      );
    }

    if (folderId) {
      const ok = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM app_quiktrack."QtDocFolder"
        WHERE id = ${folderId} AND "orgId" = ${orgId}
          AND "projectId" = ${projectId} AND "isDeleted" = false
        LIMIT 1
      `;
      if (ok.length === 0) {
        return NextResponse.json({ success: false, error: "Folder not found" }, { status: 400 });
      }
    }

    const id = randomUUID();
    const title = titleFromFilename(filename);
    await db.$executeRaw`
      INSERT INTO app_quiktrack."QtDoc"
        (id, "orgId", "projectId", title, content, "templateKey", "folderId",
         "createdBy", "updatedBy", "isDeleted", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${projectId}, ${title}, ${html}, NULL, ${folderId},
         ${userId}, ${userId}, false, NOW(), NOW())
    `;
    return NextResponse.json({ success: true, data: { id, title, folderId } }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Doc", action: "create" } },
);
