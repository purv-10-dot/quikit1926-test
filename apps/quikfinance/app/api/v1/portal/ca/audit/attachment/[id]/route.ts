import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

/** Fetch a working-paper attachment's content (data URI), scoped to the company. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await portalRoute("ca", "view");
  if (!guard.ok) return guard.response;
  const { orgId } = guard.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT file_name, content_type, file_path FROM document_attachments
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND entity_type = 'ca_audit' LIMIT 1`) as Array<{ file_name: string; content_type: string | null; file_path: string }>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Attachment not found." });
    return ok({ fileName: rows[0].file_name, contentType: rows[0].content_type, src: rows[0].file_path });
  } catch (error) {
    return fail(500, { code: "ATTACHMENT_FAILED", message: errorMessage(error) });
  }
}
