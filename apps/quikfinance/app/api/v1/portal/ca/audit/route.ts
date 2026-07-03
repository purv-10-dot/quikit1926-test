import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

type Kind = "request" | "note" | "working_paper";

/** List CA audit items (requests, notes, working papers) for the selected company. */
export async function GET() {
  const guard = await portalRoute("ca", "view");
  if (!guard.ok) return guard.response;
  const { orgId } = guard.context;
  try {
    const rows = await prisma.$queryRaw`
      SELECT a.id, a.kind, a.title, a.body, a.status, to_char(a.due_date,'YYYY-MM-DD') AS due_date, a.created_at,
             a.attachment_id, d.file_name AS attachment_name, d.content_type AS attachment_type
      FROM ca_audit_items a
      LEFT JOIN document_attachments d ON d.id = a.attachment_id
      WHERE a.org_id = ${orgId}::uuid
      ORDER BY a.created_at DESC`;
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "AUDIT_LIST_FAILED", message: errorMessage(error) });
  }
}

/** Create an audit item. Body: { kind, title, body?, dueDate?, file?: {name, contentType, dataUrl} } */
export async function POST(request: NextRequest) {
  const guard = await portalRoute("ca", "audit");
  if (!guard.ok) return guard.response;
  const { orgId, userId } = guard.context;
  try {
    const b = (await request.json()) as { kind?: Kind; title?: string; body?: string; dueDate?: string; file?: { name: string; contentType?: string; dataUrl: string; size?: number } };
    if (!b.kind || !["request", "note", "working_paper"].includes(b.kind)) return fail(422, { code: "BAD_KIND", message: "kind must be request, note or working_paper." });
    if (!b.title?.trim()) return fail(422, { code: "NO_TITLE", message: "A title is required." });

    let attachmentId: string | null = null;
    if (b.file?.dataUrl) {
      const att = (await prisma.$queryRaw`
        INSERT INTO document_attachments (org_id, entity_type, entity_id, file_name, file_path, content_type, size_bytes, uploaded_by)
        VALUES (${orgId}::uuid, 'ca_audit', ${orgId}::uuid, ${b.file.name}, ${b.file.dataUrl}, ${b.file.contentType ?? null}, ${Math.trunc(b.file.size ?? 0)}, ${userId}::uuid)
        RETURNING id`) as Array<{ id: string }>;
      attachmentId = att[0]?.id ?? null;
    }

    const rows = (await prisma.$queryRaw`
      INSERT INTO ca_audit_items (org_id, created_by, kind, title, body, due_date, attachment_id)
      VALUES (${orgId}::uuid, ${userId}::uuid, ${b.kind}, ${b.title.trim()}, ${b.body ?? null}, ${b.dueDate ?? null}::date, ${attachmentId}::uuid)
      RETURNING id, kind, title, status`) as Array<Record<string, unknown>>;
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "AUDIT_CREATE_FAILED", message: errorMessage(error) });
  }
}
