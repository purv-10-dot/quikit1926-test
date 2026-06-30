import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { fail } from "@/lib/api/responses";
import { TemplateDocument } from "@/components/pdf/TemplateDocument";
import { normalizeConfig } from "@/lib/pdf-templates/config";
import { moduleMeta } from "@/lib/pdf-templates/config";
import { sampleDocument } from "@/lib/pdf-templates/document";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const rows = (await prisma.$queryRaw`SELECT module, config FROM pdf_templates WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ module: string; config: unknown }>;
  if (!rows[0]) return fail(404, { code: "NOT_FOUND", message: "Template not found." });

  const config = normalizeConfig(rows[0].config);
  const doc = sampleDocument(moduleMeta(rows[0].module).title);
  const element = React.createElement(TemplateDocument, { config, doc }) as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="template-preview.pdf"` }
  });
}
