import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { JournalPDFTemplate } from "@/components/journals/JournalPDFTemplate";
import { requireApiContext } from "@/lib/api/auth";
import { fail } from "@/lib/api/responses";
import { loadJournalPdfData } from "@/lib/journal-pdf";
import { pdfFileName } from "@/lib/utils/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });

  let journal;
  try {
    journal = await loadJournalPdfData(auth.context.db as never, auth.context.orgId, params.id);
  } catch {
    return fail(404, { code: "NOT_FOUND", message: "Journal entry was not found." });
  }

  const document = React.createElement(JournalPDFTemplate, { journal }) as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(document);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdfFileName("journal", journal.journalNumber)}"` }
  });
}
