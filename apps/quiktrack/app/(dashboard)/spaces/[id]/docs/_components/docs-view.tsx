"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link as LinkIcon } from "lucide-react";
import { DocsList } from "./docs-list";
import { DocsTemplatesSidebar } from "./docs-templates-sidebar";

interface DocSummary {
  id: string;
  title: string;
  templateKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const PAGE_LIMIT = 10;

/**
 * Pages tab top-level. Two-column layout matching the reference Pages.jsx:
 * left = title + scrollable list of pages, right = persistent "Create a page"
 * sidebar with the popular templates. Clicking any template card creates a
 * new doc seeded with that template and routes into the editor.
 */
export function DocsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "word">("pdf");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/docs?limit=${PAGE_LIMIT}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.success) setDocs(j.data ?? []);
        else setDocs([]);
      })
      .catch(() => alive && setDocs([]));
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function createFromTemplate(templateKey: string) {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey }),
      }).then((r) => r.json());
      if (res?.success) {
        router.push(`/spaces/${projectId}/docs/${res.data.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  function downloadDoc(doc: DocSummary) {
    fetch(`/api/docs/${doc.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) return;
        const safeName = doc.title.replace(/[^\w-]+/g, "_") || "page";
        if (downloadFormat === "word") {
          downloadAsWord(safeName, doc.title, j.data.content);
        } else {
          printAsPdf(doc.title, j.data.content);
        }
      });
  }

  return (
    <div className="h-full flex overflow-hidden bg-white">
      <main className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
          <div className="flex items-center gap-3">
            <FormatToggle value={downloadFormat} onChange={setDownloadFormat} />
            {/* <div className="flex items-center gap-1.5 text-sm text-gray-700">
              <FileText className="w-3.5 h-3.5 text-gray-600" />
              Pages
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              <LinkIcon className="w-3.5 h-3.5 text-gray-600" />
              Change connection
            </button> */}
          </div>
        </div>

        {docs === null ? (
          <ListSkeleton />
        ) : docs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">
              No pages yet — pick a template on the right to get started.
            </p>
          </div>
        ) : (
          <DocsList projectId={projectId} docs={docs} onDownload={downloadDoc} />
        )}
      </main>

      <DocsTemplatesSidebar busy={creating} onCreate={createFromTemplate} />
    </div>
  );
}

function FormatToggle({
  value,
  onChange,
}: {
  value: "pdf" | "word";
  onChange: (v: "pdf" | "word") => void;
}) {
  return (
    <div className="flex items-center rounded border border-gray-300 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("pdf")}
        className={`px-2.5 py-1 text-xs ${
          value === "pdf"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
        title="Download format PDF"
      >
        PDF
      </button>
      <button
        type="button"
        onClick={() => onChange("word")}
        className={`px-2.5 py-1 text-xs border-l border-gray-300 ${
          value === "word"
            ? "bg-blue-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
        title="Download format DOC"
      >
        Word
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border-b border-gray-200 py-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-1/3 rounded bg-gray-200 animate-pulse" />
            <div className="ml-auto h-6 w-6 rounded-full bg-gray-200 animate-pulse" />
          </div>
          <div className="h-2 w-32 rounded bg-gray-100 animate-pulse mt-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Print stylesheet shared by PDF and Word output. Mirrors the editor's
 * heading/list/table/code-block visuals so downloaded files look like the
 * page the user just edited.
 */
const PRINT_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; line-height: 1.6; padding: 32px; max-width: 820px; margin: 0 auto; font-size: 14px; }
  h1 { font-size: 28px; font-weight: 700; margin: 16px 0 12px; }
  h2 { font-size: 20px; font-weight: 600; margin: 16px 0 8px; }
  h3 { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
  p { margin: 8px 0; }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; }
  blockquote { border-left: 4px solid #93c5fd; padding: 4px 12px; margin: 8px 0; color: #4b5563; font-style: italic; }
  pre { background: #111827; color: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre code { background: transparent; color: inherit; padding: 0; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  img { max-width: 100%; height: auto; }
  .doc-byline { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
`;

function buildPrintHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(
    title,
  )}</title><style>${PRINT_CSS}</style></head><body><h1>${escape(
    title,
  )}</h1>${body}</body></html>`;
}

/**
 * PDF download — opens the doc in a new window and triggers the browser's
 * native print dialog with "Save as PDF" pre-selected. This is the standard
 * client-side approach (no server PDF renderer needed); the user picks
 * "Save as PDF" in the print dialog destination.
 */
function printAsPdf(title: string, body: string) {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    alert("Pop-ups blocked. Allow pop-ups to download as PDF.");
    return;
  }
  win.document.write(buildPrintHtml(title, body));
  win.document.close();
  win.focus();
  // Give the new window a moment to render fonts/images before printing.
  setTimeout(() => {
    win.print();
  }, 250);
}

/**
 * Word-friendly stylesheet. Word ignores web-only fonts (-apple-system,
 * BlinkMacSystemFont, Segoe UI in some installs) and reverts to a serif
 * default, so the font stack here uses fonts every Windows / Mac Word
 * install has, and the rules are inlined to <style> + reinforced inline
 * on each heading via prepareWordBody.
 */
const WORD_CSS = `
  body { font-family: Calibri, Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.5; }
  h1 { font-family: Calibri, Arial, sans-serif; font-size: 22pt; font-weight: 700; margin: 12pt 0 6pt; }
  h2 { font-family: Calibri, Arial, sans-serif; font-size: 16pt; font-weight: 600; margin: 10pt 0 4pt; }
  h3 { font-family: Calibri, Arial, sans-serif; font-size: 13pt; font-weight: 600; margin: 8pt 0 4pt; }
  p { margin: 4pt 0; }
  ul, ol { margin: 4pt 0 4pt 24pt; padding: 0; }
  li { margin: 2pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
  th, td { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
  th { background: #eee; font-weight: 600; }
  blockquote { border-left: 3pt solid #93c5fd; padding-left: 8pt; margin: 6pt 0; color: #555; font-style: italic; }
  pre { background: #111; color: #eee; padding: 8pt; font-family: Consolas, "Courier New", monospace; font-size: 9pt; }
  pre code { background: transparent; color: inherit; padding: 0; }
  code { background: #eee; padding: 1pt 3pt; font-family: Consolas, "Courier New", monospace; font-size: 9pt; }
  img { max-width: 100%; height: auto; }
`;

/**
 * Word treats <li><p>text</p></li> as a block split — the marker shows on
 * one line and the content on the next, producing empty numbered rows.
 * Unwrap the inner <p> so each list item is a single block. Also drop list
 * items that have no real content (empty <li></li>) which TipTap leaves
 * behind when the user deletes a row.
 */
function prepareWordBody(html: string): string {
  return html
    .replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, "<li>$1</li>")
    .replace(/<li>(\s|&nbsp;|<br\s*\/?>)*<\/li>/gi, "");
}

/**
 * DOC download — Microsoft Word opens HTML files saved with the .doc
 * extension and the application/msword MIME type. We wrap the content in
 * the Word XML namespaces so paragraph spacing, tables, and lists render
 * the same way they do on screen.
 */
function downloadAsWord(safeName: string, title: string, body: string) {
  const cleaned = prepareWordBody(body);
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escape(
    title,
  )}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>${WORD_CSS}</style></head><body style="font-family:Calibri,Arial,sans-serif;"><h1 style="font-family:Calibri,Arial,sans-serif;">${escape(
    title,
  )}</h1>${cleaned}</body></html>`;
  const blob = new Blob(["﻿", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}
