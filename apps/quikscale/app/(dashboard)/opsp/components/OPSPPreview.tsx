"use client";

/**
 * OPSP Preview modal — Scaling Up PDF-style preview extracted from
 * `page.tsx` (Phase 4 of the OPSP decomposition).
 *
 * Read-only: renders `form` + `users` into an A4-portrait print/export view.
 * Owns the pagesRef + PDF/Word download handlers used by the Preview toolbar.
 * No external state — all UI bits (`downloading`, `downloadingWord`) are local.
 */

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/utils/sanitizeHtml";
import { Loader2, Printer, Download, FileText, X } from "lucide-react";
import type { FormData } from "../hooks/useOPSPForm";
import type { CritCard } from "../types";

export function OPSPPreview({ open, onClose, form, users = [] }: {
  open: boolean; onClose: () => void; form: FormData;
  users?: { id: string; firstName: string; lastName: string }[];
}) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!pagesRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      // A4 portrait: 210mm × 297mm
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();   // 297
      const pdfH = pdf.internal.pageSize.getHeight();  // 210
      const margin = 5; // mm margin on all sides
      const usableW = pdfW - margin * 2;
      const usableH = pdfH - margin * 2;

      const pages = pagesRef.current.querySelectorAll<HTMLElement>("[data-opsp-page]");

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        // Pages are 794×1122 portrait — capture at that exact size
        const canvas = await html2canvas(page, {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: 794,
          height: 1122,
          windowWidth: 794,
        });

        const imgData = canvas.toDataURL("image/png");

        if (i > 0) pdf.addPage();

        // Each page is 794×1122 (A4 portrait ratio)
        // Fit to full usable area
        const drawW = usableW;
        const drawH = (canvas.height / canvas.width) * drawW;
        const drawY = drawH < usableH ? margin + (usableH - drawH) / 2 : margin;
        pdf.addImage(imgData, "PNG", margin, drawY, drawW, Math.min(drawH, usableH));
      }

      pdf.save(`OPSP_${form.year}_${form.quarter}.pdf`);
    } catch (err) {
      console.error("PDF download failed:", err);
      alert("PDF download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [downloading, form.year, form.quarter]);

  const handleDownloadWord = useCallback(async () => {
    if (downloadingWord) return;
    setDownloadingWord(true);
    try {
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, HeadingLevel, PageOrientation } = await import("docx");

      const ownerName = (id: string) => {
        if (!id) return "";
        const u = users.find(x => x.id === id);
        return u ? `${u.firstName} ${u.lastName}` : id;
      };

      const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true })] });
      const subheading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: [new TextRun({ text, bold: true })] });
      const para = (text: string) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun(text || " ")] });
      const numbered = (items: string[]) => items.filter(Boolean).map((t, i) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun(`${i + 1}. ${t}`)] }));
      const strip = (html: string) => (html || "").replace(/<[^>]*>/g, "").trim() || " ";

      const simpleBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
      const cellBorders = { top: simpleBorder, bottom: simpleBorder, left: simpleBorder, right: simpleBorder };

      function makeTable(headers: string[], dataRows: string[][]) {
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: headers.map(h => new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
              })),
            }),
            ...dataRows.map(cells => new TableRow({
              children: cells.map(c => new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: c || " ", size: 18 })] })],
              })),
            })),
          ],
        });
      }

      const sections: any[] = [];

      // Title
      sections.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `One-Page Strategic Plan (OPSP) \u2014 ${form.year} ${form.quarter}`, bold: true })] }));

      // PEOPLE
      sections.push(heading("PEOPLE (Reputation Drivers)"));
      sections.push(subheading("Employees"));
      sections.push(...numbered(form.employees));
      sections.push(subheading("Customers"));
      sections.push(...numbered(form.customers));
      sections.push(subheading("Shareholders"));
      sections.push(...numbered(form.shareholders));

      // Core Values / Purpose / Actions
      sections.push(heading("CORE VALUES / BELIEFS"));
      sections.push(para(strip(form.coreValues)));
      sections.push(heading("PURPOSE"));
      sections.push(para(strip(form.purpose)));
      sections.push(subheading("Actions \u2014 To Live Values, Purposes, BHAG"));
      sections.push(...numbered(form.actions));
      sections.push(subheading("Profit per X"));
      sections.push(para(strip(form.profitPerX)));
      sections.push(subheading("BHAG"));
      sections.push(para(strip(form.bhag)));

      // Targets
      sections.push(heading("TARGETS (3-5 YRS.)"));
      sections.push(makeTable(
        ["Category", "Projected"],
        form.targetRows.filter(r => r.category).map(r => [r.category, r.projected]),
      ));
      sections.push(subheading("Sandbox"));
      sections.push(para(strip(form.sandbox)));
      sections.push(subheading("Key Thrusts / Capabilities"));
      sections.push(...form.keyThrusts.filter(r => r.desc).map((r, i) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun(`${i + 1}. ${r.desc}${r.owner ? ` \u2014 ${ownerName(r.owner)}` : ""}`)] })));
      sections.push(subheading("Brand Promise KPIs"));
      sections.push(para(strip(form.brandPromiseKPIs)));
      sections.push(subheading("Brand Promise"));
      sections.push(para(strip(form.brandPromise)));

      // Goals
      sections.push(heading("GOALS (1 YR.)"));
      sections.push(makeTable(
        ["Category", "Projected"],
        form.goalRows.filter(r => r.category).map(r => [r.category, r.projected]),
      ));
      sections.push(subheading("Key Initiatives"));
      sections.push(...form.keyInitiatives.filter(r => r.desc).map((r, i) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun(`${i + 1}. ${r.desc}${r.owner ? ` \u2014 ${ownerName(r.owner)}` : ""}`)] })));

      // Strengths / Weaknesses
      sections.push(heading("Strengths / Core Competencies"));
      sections.push(...numbered(form.processItems));
      sections.push(heading("Weaknesses"));
      sections.push(...numbered(form.weaknesses));

      // Process
      sections.push(heading("PROCESS (Productivity Drivers)"));
      sections.push(subheading("Make/Buy"));
      sections.push(...numbered(form.makeBuy));
      sections.push(subheading("Sell"));
      sections.push(...numbered(form.sell));
      sections.push(subheading("Record Keeping"));
      sections.push(...numbered(form.recordKeeping));

      // Actions QTR
      sections.push(heading("ACTIONS (QTR)"));
      sections.push(makeTable(
        ["Category", "Projected"],
        form.actionsQtr.filter(r => r.category).map(r => [r.category, r.projected]),
      ));
      sections.push(subheading("Rocks \u2014 Quarterly Priorities"));
      sections.push(...form.rocks.filter(r => r.desc).map((r, i) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun(`${i + 1}. ${r.desc}${r.owner ? ` \u2014 ${ownerName(r.owner)}` : ""}`)] })));

      // Theme
      sections.push(heading("THEME"));
      sections.push(para(strip(form.theme)));
      sections.push(subheading("Scoreboard Design"));
      sections.push(para(strip(form.scoreboardDesign)));
      sections.push(subheading("Celebration"));
      sections.push(para(strip(form.celebration)));
      sections.push(subheading("Reward"));
      sections.push(para(strip(form.reward)));

      // Your Accountability
      sections.push(heading("YOUR ACCOUNTABILITY"));
      sections.push(makeTable(
        ["S.no.", "KPIs", "Goal"],
        form.kpiAccountability.filter(r => r.kpi).map((r, i) => [String(i + 1).padStart(2, "0"), r.kpi, r.goal]),
      ));
      sections.push(subheading("Quarterly Priorities"));
      sections.push(makeTable(
        ["S.no.", "Priority", "Due"],
        form.quarterlyPriorities.filter(r => r.priority).map((r, i) => [String(i + 1).padStart(2, "0"), r.priority, r.dueDate || ""]),
      ));

      const doc = new Document({
        sections: [{
          properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
          children: sections,
        }],
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

  if (!open) return null;

  /* ── helpers ── */
  const ownerName = (id: string) => {
    if (!id) return "";
    const u = users.find(u => u.id === id);
    return u ? `${u.firstName} ${u.lastName}` : id;
  };
  const fmtDue = (d: string) => {
    if (!d) return "";
    try {
      const dt = new Date(d + "T00:00");
      return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}/${dt.getFullYear()}`;
    } catch { return d; }
  };
  const critColors = ["bg-green-600", "bg-yellow-500", "bg-orange-500", "bg-red-600"];
  const html = (v: string) => ({ __html: sanitizeHtml(v) });

  /* ── shared cell classes (bumped ~1.4× for 0.71 scale-down → effective 8-9px) ── */
  const td = "border border-gray-400 px-1 py-0.5 align-top text-[13px] leading-tight text-gray-800";
  const thBold = "text-center font-bold uppercase text-[13px] bg-gray-100";
  const sub = "font-normal italic text-gray-500 text-[10px]";
  const innerTd = "border border-gray-300 px-1 py-px text-[13px] text-gray-800";

  /* ── reusable sub-components ── */
  function CritBlock({ crit, label }: { crit: CritCard; label: string }) {
    return (
      <div className="mb-px">
        <div className="text-[12px] font-bold mb-px">
          {label}{crit.title ? ` ${crit.title}` : ""}
        </div>
        <div className="flex flex-col">
          {crit.bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-1 text-[12px] leading-tight">
              <span className={`w-3 h-3 flex-shrink-0 ${critColors[i] ?? "bg-gray-400"}`} />
              <span className="text-gray-700">{b || "\u00a0"}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] italic text-gray-400 mt-px">Between green &amp; red</div>
      </div>
    );
  }

  function CatProjTable({ rows, showEmpty = false }: { rows: { category: string; projected: string }[]; showEmpty?: boolean }) {
    const visible = showEmpty ? rows : rows.filter(r => r.category);
    if (visible.length === 0) return null;
    return (
      <table className="w-full border-collapse mb-0.5">
        <thead>
          <tr>
            <th className={cn(innerTd, "font-bold text-left")}>Category</th>
            <th className={cn(innerTd, "font-bold text-right whitespace-nowrap")} style={{ width: "90px" }}>Projected</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={i}>
              <td className={innerTd}>{r.category}</td>
              <td className={cn(innerTd, "text-right whitespace-nowrap")}>{r.projected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function NumberedOwnerRows({ rows, nameResolver }: { rows: { desc: string; owner: string }[]; nameResolver: (id: string) => string }) {
    const visible = rows.filter(r => r.desc);
    return (
      <table className="w-full border-collapse text-[13px] leading-tight">
        <tbody>
          {visible.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="pr-1 text-gray-500 whitespace-nowrap" style={{ width: "20px" }}>{i + 1}</td>
              <td className="text-gray-800 py-px">{r.desc}</td>
              <td className="text-gray-500 text-right whitespace-nowrap pl-1 py-px" style={{ width: "80px" }}>{nameResolver(r.owner)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/70 print:bg-white print:static">
      {/* ── Preview toolbar (hidden on print) ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white flex-shrink-0 print:hidden shadow-lg">
        <span className="text-sm font-semibold tracking-wide">OPSP Preview — {form.year} {form.quarter}</span>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadPDF} disabled={downloading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors disabled:opacity-50">
            {downloading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {downloading ? "Generating..." : "Download PDF"}
          </button>
          <button onClick={handleDownloadWord} disabled={downloadingWord}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors disabled:opacity-50">
            {downloadingWord
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileText className="h-3.5 w-3.5" />}
            {downloadingWord ? "Generating..." : "Download Word"}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title="Close Preview">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Scrollable pages ── */}
      <div className="flex-1 overflow-y-auto bg-gray-400 py-8 px-4 print:overflow-visible print:bg-white print:p-0">
        <div ref={pagesRef} className="mx-auto space-y-10 print:space-y-0" style={{ width: 794, fontFamily: "Arial, Helvetica, sans-serif" }}>

          {/* ═══════════════ PAGE 1 : PEOPLE ═══════════════ */}
          <div data-opsp-page="1" className="bg-white shadow-xl print:shadow-none overflow-hidden" style={{ width: 794, height: 1122 }}>
           <div style={{ width: 1122, transformOrigin: "top left", transform: "scale(0.7076)" }}>

            {/* Blue header bar */}
            <div className="flex bg-[#0EA5E9] text-white">
              <div className="flex-1 px-3 py-1 flex items-center gap-1">
                <span className="text-[15px] font-bold tracking-wide">Strategy:</span>
                <span className="text-[14px]">One-Page Strategic Plan (OPSP)</span>
              </div>
              <div className="border-l border-white/40 px-3 py-1 flex items-center gap-1 text-[14px]">
                <span className="font-semibold">Organization:</span>
              </div>
            </div>

            <div className="px-3 pb-2 pt-1">
              {/* Section title */}
              <div className="text-center mb-1">
                <span className="text-[22px] font-bold text-[#0EA5E9]">People</span>
                <span className="text-[15px] font-normal text-gray-600"> (Reputation Drivers)</span>
              </div>

              {/* ── 3-col people names ── */}
              <table className="w-full border-collapse mb-1 text-[13px]" style={{ tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "33.3%" }} /><col style={{ width: "33.4%" }} /><col style={{ width: "33.3%" }} /></colgroup>
                <tbody>
                  {[0, 1, 2].map(i => (
                    <tr key={i}>
                      {(["employees", "customers", "shareholders"] as const).map(key => (
                        <td key={key} className="px-2 py-px">
                          <div className="flex items-baseline gap-1 leading-tight border-b border-gray-300 pb-px">
                            <span className="text-gray-800 flex-shrink-0">{i + 1}.</span>
                            <span className="text-gray-800 flex-1 min-w-0 truncate">{(form[key] as string[])[i]}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Main 4-column table ── */}
              <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "28%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50">
                    <th className={cn(td, thBold)}>Core Values/Beliefs<br /><span className={sub}>(Should/Shouldn&apos;t)</span></th>
                    <th className={cn(td, thBold)}>Purpose<br /><span className={sub}>(Why)</span></th>
                    <th className={cn(td, thBold)}>Targets (3-5 Yrs.)<br /><span className={sub}>(Where)</span></th>
                    <th className={cn(td, thBold)}>Goals (1 Yr.)<br /><span className={sub}>(What)</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {/* ── Col 1: Core Values ── */}
                    <td className={td}>
                      <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 [&_strong]:font-bold" dangerouslySetInnerHTML={html(form.coreValues)} />
                    </td>

                    {/* ── Col 2: Purpose + Actions + Profit per X + BHAG ── */}
                    <td className={td}>
                      <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 mb-0.5" dangerouslySetInnerHTML={html(form.purpose)} />

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold uppercase text-[11px] text-center">Actions</div>
                        <div className="italic text-gray-500 text-[10px] text-center">To Live Values, Purposes, BHAG</div>
                        {form.actions.map((v, i) => (
                          <div key={i} className="flex gap-1 leading-tight py-px text-[13px]">
                            <span className="text-gray-800 flex-shrink-0">{i + 1}</span>
                            <span className="text-gray-800 break-words min-w-0">{v}</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold text-[11px]">Profit per X</div>
                        <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5" dangerouslySetInnerHTML={html(form.profitPerX)} />
                      </div>

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold uppercase text-[11px]">BHAG&reg;</div>
                        <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5" dangerouslySetInnerHTML={html(form.bhag)} />
                      </div>
                    </td>

                    {/* ── Col 3: Targets + Sandbox + Key Thrusts + Brand Promise ── */}
                    <td className={td}>
                      <CatProjTable rows={form.targetRows} />

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold italic text-[11px]">Sandbox</div>
                        <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-700" dangerouslySetInnerHTML={html(form.sandbox)} />
                      </div>

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold uppercase text-[11px] text-center">Key Thrusts/Capabilities</div>
                        <div className="italic text-gray-500 text-[10px] text-center">3-5 Year Priorities</div>
                        <NumberedOwnerRows rows={form.keyThrusts} nameResolver={ownerName} />
                      </div>

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold text-[11px]">Brand Promise KPIs</div>
                        <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-700" dangerouslySetInnerHTML={html(form.brandPromiseKPIs)} />
                      </div>

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold text-[11px]">Brand Promises</div>
                        <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-700" dangerouslySetInnerHTML={html(form.brandPromise)} />
                      </div>
                    </td>

                    {/* ── Col 4: Goals + Key Initiatives + Critical # ── */}
                    <td className={td}>
                      <CatProjTable rows={form.goalRows} />

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <div className="font-bold uppercase text-[11px] text-center">Key Initiatives</div>
                        <div className="italic text-gray-500 text-[10px] text-center">1 Year Priorities</div>
                        <table className="w-full text-[13px] leading-tight border-collapse">
                          <tbody>
                            {form.keyInitiatives
                              .filter(r => (r.desc && r.desc.trim().length > 0) || (r.owner && r.owner.trim().length > 0))
                              .map((r, i) => {
                                const owner = users.find(u => u.id === r.owner);
                                const ownerLabel = owner ? `${owner.firstName} ${owner.lastName}` : (r.owner || "");
                                return (
                                  <tr key={i} className="align-top">
                                    <td className="pr-1 text-gray-500" style={{ width: "20px" }}>{i + 1}</td>
                                    <td className="pr-1 leading-tight text-gray-800">{r.desc}</td>
                                    <td className="text-gray-500 whitespace-nowrap text-right" style={{ width: "80px" }}>{ownerLabel}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>

                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <CritBlock crit={form.criticalNumGoals} label="Critical #: " />
                      </div>
                      <div className="border-t border-gray-300 pt-0.5 mt-0.5">
                        <CritBlock crit={form.balancingCritNumGoals} label="Balancing Critical #: " />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Strengths / Weaknesses ── */}
              <table className="w-full border-collapse border border-gray-400 text-[13px] leading-tight">
                <tbody>
                  <tr>
                    <td className="w-1/2 border border-gray-400 px-1 py-1 align-top">
                      <div className="font-bold text-[13px] mb-px">Strengths/Core Competencies</div>
                      {form.processItems.map((v, i) => (
                        <div key={i} className="flex gap-1 py-px">
                          <span className="text-gray-800">{i + 1}.</span><span className="text-gray-800">{v}</span>
                        </div>
                      ))}
                    </td>
                    <td className="w-1/2 border border-gray-400 px-1 py-1 align-top">
                      <div className="font-bold text-[13px] mb-px">Weaknesses:</div>
                      {form.weaknesses.map((v, i) => (
                        <div key={i} className="flex gap-1 py-px">
                          <span className="text-gray-800">{i + 1}.</span><span className="text-gray-800">{v}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
           </div>{/* close scale wrapper */}
          </div>

          {/* ═══════════════ PAGE 2 : PROCESS ═══════════════ */}
          <div data-opsp-page="2" className="bg-white shadow-xl print:shadow-none print:break-before-page overflow-hidden" style={{ width: 794, height: 1122 }}>
           <div style={{ width: 1122, transformOrigin: "top left", transform: "scale(0.7076)" }}>

            {/* Blue header bar — Your Name / Date / SCALING UP */}
            <div className="flex bg-[#0EA5E9] text-white">
              <div className="flex-1 px-3 py-1 flex items-center gap-2 text-[14px]">
                <span className="font-semibold">Your Name:</span>
                <span className="border-b border-white/60 min-w-[120px] pb-px">{form.employees?.[0] ?? ""}</span>
              </div>
              <div className="border-l border-white/40 px-3 py-1 flex items-center gap-1 text-[14px]">
                <span className="font-semibold">Date:</span>
                <span>{form.year} / {form.quarter}</span>
              </div>
              <div className="border-l border-white/40 px-3 py-1 flex items-center text-[15px] font-bold tracking-wider">
                SCALING UP
              </div>
            </div>

            <div className="px-3 pb-2 pt-1">
              {/* Section title */}
              <div className="text-center mb-1">
                <span className="text-[22px] font-bold text-[#0EA5E9]">Process</span>
                <span className="text-[15px] font-normal text-gray-600"> (Productivity Drivers)</span>
              </div>

              {/* ── 3-col process items ── */}
              <table className="w-full border-collapse mb-1 text-[13px]" style={{ tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "33.3%" }} /><col style={{ width: "33.4%" }} /><col style={{ width: "33.3%" }} /></colgroup>
                <tbody>
                  {[0, 1, 2].map(i => (
                    <tr key={i}>
                      {(["makeBuy", "sell", "recordKeeping"] as const).map(key => (
                        <td key={key} className="px-2 py-px">
                          <div className="flex items-baseline gap-1 leading-tight border-b border-gray-300 pb-px">
                            <span className="text-gray-800 flex-shrink-0">{i + 1}.</span>
                            <span className="text-gray-800 flex-1 min-w-0 truncate">{(form[key] as string[])[i]}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Main 3-column table ── */}
              <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "33.3%" }} />
                  <col style={{ width: "33.4%" }} />
                  <col style={{ width: "33.3%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50">
                    <th className={cn(td, thBold)}>Actions (QTR)<br /><span className={sub}>(How)</span></th>
                    <th className={cn(td, thBold)}>Theme<br /><span className={sub}>(QTR/ANNUAL)</span></th>
                    <th className={cn(td, thBold)}>Your Accountability<br /><span className={sub}>(Who/When)</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {/* ── Col 1: Actions QTR ── */}
                    <td className={td}>
                      <CatProjTable rows={form.actionsQtr} />
                    </td>

                    {/* ── Col 2: Theme text ── */}
                    <td className={td}>
                      <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-800" dangerouslySetInnerHTML={html(form.theme)} />
                    </td>

                    {/* ── Col 3: Your KPIs ── */}
                    <td className={td}>
                      <table className="w-full border-collapse mb-0.5">
                        <thead>
                          <tr>
                            <th className={cn(innerTd, "font-bold text-left")}>Your KPI&apos;s</th>
                            <th className={cn(innerTd, "font-bold text-right whitespace-nowrap")} style={{ width: "80px" }}>Goal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.kpiAccountability.filter(r => r.kpi).map((r, i) => (
                            <tr key={i}>
                              <td className={innerTd}>{r.kpi}</td>
                              <td className={cn(innerTd, "text-right whitespace-nowrap")}>{r.goal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Second 3-column table: Rocks / Scoreboard / Quarterly Priorities ── */}
              <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "33.3%" }} />
                  <col style={{ width: "33.4%" }} />
                  <col style={{ width: "33.3%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50">
                    <th className={cn(td, thBold)}>Rocks<br /><span className={sub}>1 Quarterly Priorities</span></th>
                    <th className={cn(td, thBold)}>Scoreboard Design<br /><span className={sub}>Describe and/or sketch your design in this space</span></th>
                    <th className={cn(td, thBold)}><span className="text-[12px]">Your Quarterly Priorities</span><br /><span className={sub}>Due</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {/* Rocks — 3-column: # | Quarterly Priorities | Who */}
                    <td className={td}>
                      <table className="w-full text-[13px] leading-tight border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left text-[11px] font-bold text-gray-600 pb-px" style={{ width: "20px" }}>#</th>
                            <th className="text-left text-[11px] font-bold text-gray-600 pb-px">Quarterly Priorities</th>
                            <th className="text-right text-[11px] font-bold text-gray-600 pb-px" style={{ width: "80px" }}>Who</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.rocks
                            .filter(r => (r.desc && r.desc.trim().length > 0) || (r.owner && r.owner.trim().length > 0))
                            .map((r, i) => {
                              const owner = users.find(u => u.id === r.owner);
                              const ownerLabel = owner ? `${owner.firstName} ${owner.lastName}` : (r.owner || "");
                              return (
                                <tr key={i} className="align-top">
                                  <td className="pr-1 text-gray-500" style={{ width: "20px" }}>{i + 1}</td>
                                  <td className="pr-1 leading-tight text-gray-800">{r.desc}</td>
                                  <td className="text-gray-500 whitespace-nowrap text-right" style={{ width: "80px" }}>{ownerLabel}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </td>

                    {/* Scoreboard Design */}
                    <td className={td}>
                      <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-800" dangerouslySetInnerHTML={html(form.scoreboardDesign)} />
                    </td>

                    {/* Your Quarterly Priorities with due dates */}
                    <td className={td}>
                      <table className="w-full border-collapse text-[13px] leading-tight">
                        <thead>
                          <tr>
                            <th className={cn(innerTd, "font-bold text-left")}>Priority</th>
                            <th className={cn(innerTd, "font-bold text-right whitespace-nowrap")} style={{ width: "90px" }}>Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.quarterlyPriorities.filter(r => r.priority).map((r, i) => (
                            <tr key={i}>
                              <td className={innerTd}>{r.priority}</td>
                              <td className={cn(innerTd, "text-right whitespace-nowrap")}>{fmtDue(r.dueDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Bottom 3-column: Critical # / Celebration+Reward / Critical # ── */}
              <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "33.3%" }} />
                  <col style={{ width: "33.4%" }} />
                  <col style={{ width: "33.3%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    {/* Left critical blocks */}
                    <td className={cn(td, "align-top")}>
                      <CritBlock crit={form.criticalNumProcess} label="Critical #: " />
                      <CritBlock crit={form.balancingCritNumProcess} label="Balancing Critical #: " />
                    </td>

                    {/* Celebration + Reward */}
                    <td className={cn(td, "align-top")}>
                      <div className="font-bold text-[11px] mb-px">Celebration</div>
                      <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-800 mb-1" dangerouslySetInnerHTML={html(form.celebration)} />
                      <div className="font-bold text-[11px] mb-px border-t border-gray-300 pt-0.5">Reward</div>
                      <div className="prose-preview text-[13px] leading-tight [&_p]:mb-0.5 text-gray-800" dangerouslySetInnerHTML={html(form.reward)} />
                    </td>

                    {/* Right critical blocks */}
                    <td className={cn(td, "align-top")}>
                      <CritBlock crit={form.criticalNumAcct} label="Critical #: " />
                      <CritBlock crit={form.balancingCritNumAcct} label="Balancing Critical #: " />
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Trends ── */}
              <div className="border border-gray-400 px-1 py-1 text-[13px] leading-tight">
                <div className="font-bold text-[13px] mb-px">Trends</div>
                <div className="grid grid-cols-2 gap-x-4">
                  {[0, 1].map(col => (
                    <div key={col}>
                      {[0, 1, 2].map(row => {
                        const idx = row * 2 + col;
                        return (
                          <div key={idx} className="flex gap-1 py-px">
                            <span className="text-gray-800">{idx + 1}.</span>
                            <span className="text-gray-800">{form.trends[idx] ?? ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>To get help implementing these tools, please go to www.ScalingUp.com</span>
                <span>v2.0/2C &mdash; &copy; 2020 by Scaling Up Coaches S4</span>
              </div>
            </div>
           </div>{/* close scale wrapper */}
          </div>

        </div>
      </div>
    </div>
  );
}
