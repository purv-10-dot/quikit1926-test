"use client";

/**
 * OPSP Preview modal — Architecture B: react-pdf single source of truth.
 *
 * The modal embeds <PDFViewer> showing OPSPDocument. The "Download PDF" button
 * generates the same artifact via pdf().toBlob(). Preview = PDF guaranteed.
 *
 * Word download (.docx) keeps its own pipeline via the `docx` library — it
 * targets a different format and shares only the form data.
 */

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { Loader2, Printer, Download, FileText, X } from "lucide-react";
import type { FormData } from "../hooks/useOPSPForm";
import { OPSPDocument } from "./OPSPDocument";

// PDFViewer is heavy (PDF.js + iframe) — load it client-side only.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <PDFLoading /> },
);

function PDFLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-gray-100 text-gray-500">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      <span>Rendering PDF preview…</span>
    </div>
  );
}

export function OPSPPreview({
  open,
  onClose,
  form,
  users = [],
}: {
  open: boolean;
  onClose: () => void;
  form: FormData;
  users?: { id: string; firstName: string; lastName: string }[];
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);

  /* ── Download PDF ── single render path: react-pdf .toBlob() ── */
  const handleDownloadPDF = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<OPSPDocument form={form} users={users} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OPSP_${form.year}_${form.quarter}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      alert("PDF download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [downloading, form, users]);

  /* ── Download Word (.docx) — independent path via `docx` library ── */
  const handleDownloadWord = useCallback(async () => {
    if (downloadingWord) return;
    setDownloadingWord(true);
    try {
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        AlignmentType,
        HeadingLevel,
        PageOrientation,
      } = await import("docx");

      const ownerName = (id: string) => {
        if (!id) return "";
        const u = users.find((x) => x.id === id);
        return u ? `${u.firstName} ${u.lastName}` : id;
      };

      const heading = (text: string) =>
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text, bold: true })],
        });
      const subheading = (text: string) =>
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text, bold: true })],
        });
      const para = (text: string) =>
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun(text || " ")] });
      const numbered = (items: string[]) =>
        items
          .filter(Boolean)
          .map(
            (t, i) =>
              new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun(`${i + 1}. ${t}`)],
              }),
          );
      const strip = (html: string) => (html || "").replace(/<[^>]*>/g, "").trim() || " ";

      const simpleBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
      const cellBorders = {
        top: simpleBorder,
        bottom: simpleBorder,
        left: simpleBorder,
        right: simpleBorder,
      };

      function makeTable(headers: string[], dataRows: string[][]) {
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: headers.map(
                (h) =>
                  new TableCell({
                    borders: cellBorders,
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: h, bold: true, size: 18 })],
                      }),
                    ],
                  }),
              ),
            }),
            ...dataRows.map(
              (cells) =>
                new TableRow({
                  children: cells.map(
                    (c) =>
                      new TableCell({
                        borders: cellBorders,
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: c || " ", size: 18 })],
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          ],
        });
      }

      const sections: unknown[] = [];

      sections.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `One-Page Strategic Plan (OPSP) — ${form.year} ${form.quarter}`,
              bold: true,
            }),
          ],
        }),
      );
      sections.push(heading("PEOPLE (Reputation Drivers)"));
      sections.push(subheading("Employees"));
      sections.push(...numbered(form.employees));
      sections.push(subheading("Customers"));
      sections.push(...numbered(form.customers));
      sections.push(subheading("Shareholders"));
      sections.push(...numbered(form.shareholders));
      sections.push(heading("CORE VALUES / BELIEFS"));
      sections.push(para(strip(form.coreValues)));
      sections.push(heading("PURPOSE"));
      sections.push(para(strip(form.purpose)));
      sections.push(subheading("Actions — To Live Values, Purposes, BHAG"));
      sections.push(...numbered(form.actions));
      sections.push(subheading("Profit per X"));
      sections.push(para(strip(form.profitPerX)));
      sections.push(subheading("BHAG"));
      sections.push(para(strip(form.bhag)));
      sections.push(heading("TARGETS (3-5 YRS.)"));
      // makeTable returns a Table, not a Paragraph — but docx Document accepts both.
      // We cast to Paragraph[] above for ergonomic push; add tables via any cast below.
      (sections as unknown[]).push(
        makeTable(
          ["Category", "Projected"],
          form.targetRows.filter((r) => r.category).map((r) => [r.category, r.projected]),
        ),
      );
      sections.push(subheading("Sandbox"));
      sections.push(para(strip(form.sandbox)));
      sections.push(subheading("Key Thrusts / Capabilities"));
      sections.push(
        ...form.keyThrusts
          .filter((r) => r.desc)
          .map(
            (r, i) =>
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun(
                    `${i + 1}. ${r.desc}${r.owner ? ` — ${ownerName(r.owner)}` : ""}`,
                  ),
                ],
              }),
          ),
      );
      sections.push(subheading("Brand Promise KPIs"));
      sections.push(para(strip(form.brandPromiseKPIs)));
      sections.push(subheading("Brand Promise"));
      sections.push(para(strip(form.brandPromise)));
      sections.push(heading("GOALS (1 YR.)"));
      (sections as unknown[]).push(
        makeTable(
          ["Category", "Projected"],
          form.goalRows.filter((r) => r.category).map((r) => [r.category, r.projected]),
        ),
      );
      sections.push(subheading("Key Initiatives"));
      sections.push(
        ...form.keyInitiatives
          .filter((r) => r.desc)
          .map(
            (r, i) =>
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun(
                    `${i + 1}. ${r.desc}${r.owner ? ` — ${ownerName(r.owner)}` : ""}`,
                  ),
                ],
              }),
          ),
      );
      sections.push(heading("Strengths / Core Competencies"));
      sections.push(...numbered(form.processItems));
      sections.push(heading("Weaknesses"));
      sections.push(...numbered(form.weaknesses));
      sections.push(heading("PROCESS (Productivity Drivers)"));
      sections.push(subheading("Make/Buy"));
      sections.push(...numbered(form.makeBuy));
      sections.push(subheading("Sell"));
      sections.push(...numbered(form.sell));
      sections.push(subheading("Record Keeping"));
      sections.push(...numbered(form.recordKeeping));
      sections.push(heading("ACTIONS (QTR)"));
      (sections as unknown[]).push(
        makeTable(
          ["Category", "Projected"],
          form.actionsQtr.filter((r) => r.category).map((r) => [r.category, r.projected]),
        ),
      );
      sections.push(subheading("Rocks — Quarterly Priorities"));
      sections.push(
        ...form.rocks
          .filter((r) => r.desc)
          .map(
            (r, i) =>
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun(
                    `${i + 1}. ${r.desc}${r.owner ? ` — ${ownerName(r.owner)}` : ""}`,
                  ),
                ],
              }),
          ),
      );
      sections.push(heading("THEME"));
      sections.push(para(strip(form.theme)));
      sections.push(subheading("Scoreboard Design"));
      sections.push(para(strip(form.scoreboardDesign)));
      sections.push(subheading("Celebration"));
      sections.push(para(strip(form.celebration)));
      sections.push(subheading("Reward"));
      sections.push(para(strip(form.reward)));
      sections.push(heading("YOUR ACCOUNTABILITY"));
      (sections as unknown[]).push(
        makeTable(
          ["S.no.", "KPIs", "Goal"],
          form.kpiAccountability
            .filter((r) => r.kpi)
            .map((r, i) => [String(i + 1).padStart(2, "0"), r.kpi, r.goal]),
        ),
      );
      sections.push(subheading("Quarterly Priorities"));
      (sections as unknown[]).push(
        makeTable(
          ["S.no.", "Priority", "Due"],
          form.quarterlyPriorities
            .filter((r) => r.priority)
            .map((r, i) => [String(i + 1).padStart(2, "0"), r.priority, r.dueDate || ""]),
        ),
      );

      const doc = new Document({
        sections: [
          {
            properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            children: sections as any,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OPSP_${form.year}_${form.quarter}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Word download failed:", err);
      alert("Word download failed. Please try again.");
    } finally {
      setDownloadingWord(false);
    }
  }, [downloadingWord, form, users]);

  const handlePrint = useCallback(() => {
    // PDFViewer renders into an <iframe>. Using window.print() prints the parent
    // page, not the iframe. Instead, generate a fresh blob and open in a new tab
    // where the user can print using their browser's native PDF print.
    (async () => {
      try {
        const { pdf } = await import("@react-pdf/renderer");
        const blob = await pdf(<OPSPDocument form={form} users={users} />).toBlob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        // browser will revoke when tab closes
      } catch (err) {
        console.error("Print failed:", err);
      }
    })();
  }, [form, users]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/70 print:bg-white print:static">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white flex-shrink-0 print:hidden shadow-lg">
        <span className="text-sm font-semibold tracking-wide">
          OPSP Preview — {form.year} {form.quarter}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {downloading ? "Generating..." : "Download PDF"}
          </button>
          <button
            onClick={handleDownloadWord}
            disabled={downloadingWord}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors disabled:opacity-50"
          >
            {downloadingWord ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {downloadingWord ? "Generating..." : "Download Word"}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Close Preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Inline PDF preview — same artifact as the download */}
      <div className="flex-1 bg-gray-400 print:bg-white">
        <PDFViewer
          width="100%"
          height="100%"
          showToolbar={false}
          style={{ border: 0 }}
        >
          <OPSPDocument form={form} users={users} />
        </PDFViewer>
      </div>
    </div>
  );
}
