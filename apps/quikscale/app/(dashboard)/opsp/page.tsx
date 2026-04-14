"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useUsers } from "@/lib/hooks/useUsers";
import { CURRENCIES, getScales } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { normalizeLoadedOPSP } from "@/lib/utils/opspNormalize";
import { sanitizeHtml } from "@/lib/utils/sanitizeHtml";
import {
  FInput,
  FTextarea,
  RichEditor,
} from "./components/RichEditor";
import { Card, CardH } from "./components/Card";
import { CritBlock } from "./components/CritBlock";
import {
  CategorySelect,
  ProjectedInput,
  populateCatCache,
  displayCategory,
} from "./components/category";
import {
  WithTooltip,
  OwnerSelect,
  QuarterDropdown,
} from "./components/pickers";
import { TargetsModal, GoalsModal, ActionsModal, RocksModal, KeyThrustsModal, KeyInitiativesModal, AccountabilityModal, QuarterlyPrioritiesModal } from "./components/modals";
import type {
  TargetRow,
  GoalRow,
  ThrustRow,
  KeyInitiativeRow,
  RockRow,
  ActionRow,
  KPIAcctRow,
  QPriorRow,
  CritCard,
} from "./types";
import {
  Info, Maximize2, Eye, Check,
  Copy, Lock, AlertTriangle,
  Calendar, X, Loader2, Printer, Download, FileText,
} from "lucide-react";
import { fiscalYearLabel, getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { OPSPSetupWizard } from "./components/SetupWizard";

interface FormData {
  year: number; quarter: string; targetYears: number; status: string;
  employees: string[]; customers: string[]; shareholders: string[];
  coreValues: string; purpose: string; actions: string[];
  profitPerX: string; bhag: string;
  targetRows: TargetRow[]; sandbox: string; keyThrusts: ThrustRow[];
  brandPromiseKPIs: string; brandPromise: string;
  goalRows: GoalRow[]; keyInitiatives: KeyInitiativeRow[];
  criticalNumGoals: CritCard; balancingCritNumGoals: CritCard;
  processItems: string[]; weaknesses: string[];
  makeBuy: string[]; sell: string[]; recordKeeping: string[];
  actionsQtr: ActionRow[]; rocks: RockRow[];
  criticalNumProcess: CritCard; balancingCritNumProcess: CritCard;
  theme: string; scoreboardDesign: string; celebration: string; reward: string;
  kpiAccountability: KPIAcctRow[]; quarterlyPriorities: QPriorRow[];
  criticalNumAcct: CritCard; balancingCritNumAcct: CritCard;
  trends: string[];
}

/* ── Defaults ── */
const emptyArr3   = (): string[]        => ["", "", ""];
const emptyArr5   = (): string[]        => ["", "", "", "", ""];

const emptyCrit   = (): CritCard        => ({ title: "", bullets: ["", "", "", ""] });
const emptyTarget = (): TargetRow[]     => Array.from({ length: 5 }, () => ({ category:"", projected:"", y1:"", y2:"", y3:"", y4:"", y5:"" }));
const emptyGoal   = (): GoalRow[]       => Array.from({ length: 6 }, () => ({ category:"", projected:"", q1:"", q2:"", q3:"", q4:"" }));
const emptyThrust = (): ThrustRow[]     => Array.from({ length: 5 }, () => ({ desc:"", owner:"" }));
const emptyKeyInitiatives = (): KeyInitiativeRow[] => Array.from({ length: 5 }, () => ({ desc:"", owner:"" }));
const emptyRocks = (): RockRow[]         => Array.from({ length: 5 }, () => ({ desc:"", owner:"" }));
const emptyAction = (): ActionRow[]     => Array.from({ length: 6 }, () => ({ category:"", projected:"", m1:"", m2:"", m3:"" }));
const emptyKPI    = (): KPIAcctRow[]    => Array.from({ length: 5 }, () => ({ kpi:"", goal:"" }));
const emptyQP     = (): QPriorRow[]     => Array.from({ length: 5 }, () => ({ priority:"", dueDate:"" }));

const defaultForm = (): FormData => ({
  year: getFiscalYear(), quarter: getFiscalQuarter(), targetYears: 5, status: "draft",
  employees: emptyArr3(), customers: emptyArr3(), shareholders: emptyArr3(),
  coreValues: "", purpose: "", actions: emptyArr5(), profitPerX: "", bhag: "",
  targetRows: emptyTarget(), sandbox: "", keyThrusts: emptyThrust(),
  brandPromiseKPIs: "", brandPromise: "",
  goalRows: emptyGoal(), keyInitiatives: emptyKeyInitiatives(),
  criticalNumGoals: emptyCrit(), balancingCritNumGoals: emptyCrit(),
  processItems: emptyArr3(), weaknesses: emptyArr3(),
  makeBuy: emptyArr3(), sell: emptyArr3(), recordKeeping: emptyArr3(),
  actionsQtr: emptyAction(), rocks: emptyRocks(),
  criticalNumProcess: emptyCrit(), balancingCritNumProcess: emptyCrit(),
  theme: "", scoreboardDesign: "", celebration: "", reward: "",
  kpiAccountability: emptyKPI(), quarterlyPriorities: emptyQP(),
  criticalNumAcct: emptyCrit(), balancingCritNumAcct: emptyCrit(),
  trends: Array(6).fill(""),
});


/* ═══════════════════════════════════════════════
   OPSP Preview Modal  —  matches Scaling Up PDF layout
═══════════════════════════════════════════════ */
function OPSPPreview({ open, onClose, form, users = [] }: {
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

/* ═══════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════ */
export default function OPSPPage() {
  const searchParams = useSearchParams();
  const urlYear = searchParams.get("year");
  const urlQuarter = searchParams.get("quarter");
  const urlPreview = searchParams.get("preview") === "true";

  const [form, setForm] = useState<FormData>(() => {
    const base = defaultForm();
    if (urlYear) base.year = parseInt(urlYear) || base.year;
    if (urlQuarter && ["Q1", "Q2", "Q3", "Q4"].includes(urlQuarter)) base.quarter = urlQuarter;
    return base;
  });
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [loading, setLoading] = useState(true);
  // Tenant's fiscal year start month (1 = Jan, 4 = Apr, etc.). Defaults to Jan until loaded.
  const [fiscalYearStart, setFiscalYearStart] = useState<number>(1);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [rocksOpen, setRocksOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [keyThrustsOpen, setKeyThrustsOpen] = useState(false);
  const [keyInitiativesOpen, setKeyInitiativesOpen] = useState(false);
  const [kpiAcctOpen, setKpiAcctOpen] = useState(false);
  const [qPrioritiesOpen, setQPrioritiesOpen] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(urlPreview);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  // OPSP plan year range (from setup wizard config)
  const [planStartYear, setPlanStartYear] = useState<number | null>(null);
  const [planEndYear, setPlanEndYear] = useState<number | null>(null);
  const [planStartQuarter, setPlanStartQuarter] = useState<string | null>(null); // e.g. "Q2" if onboarded mid-year
  const [showYearPicker, setShowYearPicker] = useState(false);
  const yearRef = useRef<HTMLDivElement>(null);
  const { data: allUsers = [] } = useUsers();
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const isFirstLoad = useRef(true);
  const skipNextSave = useRef(false);

  // Close year picker on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) setShowYearPicker(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* ── Pre-load category meta cache on mount ── */
  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(j => { if (j.success) populateCatCache(j.data); })
      .catch(() => {});
  }, []);

  /* ── Load on mount: check OPSP config first, then load data ── */
  useEffect(() => {
    (async () => {
      try {
        // 1. Check OPSP plan config (has the wizard been completed?)
        const configRes = await fetch("/api/opsp/config");
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.success) {
            if (typeof config.fiscalYearStart === "number") setFiscalYearStart(config.fiscalYearStart);
            if (!config.hasSetup) {
              // No OPSP setup exists — show wizard
              setShowSetupWizard(true);
              setLoading(false);
              isFirstLoad.current = false;
              return;
            }
            // Store plan year range and start quarter
            if (config.startYear != null) setPlanStartYear(config.startYear);
            if (config.endYear != null) setPlanEndYear(config.endYear);
            if (config.startQuarter != null) setPlanStartQuarter(config.startQuarter);
          }
        }

        // 2. Load the OPSP data for the current period
        const res = await fetch(`/api/opsp?year=${form.year}&quarter=${form.quarter}`);
        if (res.status === 401) {
          // No session (preview mode) — try localStorage
          const draft = localStorage.getItem(`opsp_draft_${form.year}_${form.quarter}`);
          if (draft) {
            try {
              skipNextSave.current = true;
              setForm(prev => ({ ...defaultForm(), ...normalizeLoadedOPSP(JSON.parse(draft)) } as FormData));
            } catch {}
          }
        } else {
          const json = await res.json();
          if (typeof json.fiscalYearStart === "number") setFiscalYearStart(json.fiscalYearStart);
          if (json.data) {
            skipNextSave.current = true;
            const normalized = normalizeLoadedOPSP(json.data);
            setForm(prev => ({ ...defaultForm(), ...normalized, year: json.data.year ?? prev.year, quarter: json.data.quarter ?? prev.quarter } as FormData));
          }
        }
      } catch {}
      setLoading(false);
      isFirstLoad.current = false;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Reload when year/quarter changes ── */
  const loadForPeriod = useCallback(async (year: number, quarter: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opsp?year=${year}&quarter=${quarter}`);
      if (res.status === 401) {
        const draft = localStorage.getItem(`opsp_draft_${year}_${quarter}`);
        skipNextSave.current = true;
        setForm(() => {
          if (draft) {
            try { return { ...defaultForm(), ...normalizeLoadedOPSP(JSON.parse(draft)), year, quarter } as FormData; } catch {}
          }
          return { ...defaultForm(), year, quarter };
        });
      } else {
        const json = await res.json();
        if (typeof json.fiscalYearStart === "number") setFiscalYearStart(json.fiscalYearStart);
        skipNextSave.current = true;
        setForm(() => json.data
          ? ({ ...defaultForm(), ...normalizeLoadedOPSP(json.data), year, quarter } as FormData)
          : { ...defaultForm(), year, quarter });
      }
    } catch {}
    setLoading(false);
  }, []);

  /* ── Autosave with 1.5s debounce ── */
  const save = useCallback(async (data: FormData) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/opsp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSaveState("saved");
      } else if (res.status === 401) {
        // No session (preview mode) — save to localStorage
        localStorage.setItem(`opsp_draft_${data.year}_${data.quarter}`, JSON.stringify(data));
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    } catch { setSaveState("error"); }
    setTimeout(() => setSaveState("idle"), 2000);
  }, []);

  useEffect(() => {
    if (isFirstLoad.current) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(form), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form, save]);

  /* ── Field helpers ── */
  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    if (form.status === "finalized" && key !== "status") return; // read-only guard
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const setArr = (key: keyof FormData, idx: number, value: string) => {
    if (form.status === "finalized") return; // read-only guard
    setForm(prev => {
      const arr = [...(prev[key] as string[])];
      arr[idx] = value;
      return { ...prev, [key]: arr };
    });
  };

  /* ── Finalize ── */
  const isFinalized = form.status === "finalized";
  const confirmFinalize = async () => {
    await fetch("/api/opsp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: form.year, quarter: form.quarter }),
    });
    set("status", "finalized");
    setFinalizeConfirmOpen(false);
  };

  /* ── Cascade: Targets → Goals → Actions (reactive, force-sync) ── */
  // Targets y1 (current year) → Goals category + projected
  // When source clears → also wipe quarter values (q1–q4)
  useEffect(() => {
    setForm(prev => {
      const next = [...prev.goalRows];
      let changed = false;
      for (let i = 0; i < Math.min(prev.targetRows.length, next.length); i++) {
        const t = prev.targetRows[i];
        const hasSrc = !!(t.category.trim() && t.projected.trim() && t.y1.trim());
        const newCat = hasSrc ? t.category : "";
        const newProj = hasSrc ? t.y1 : "";
        if (next[i].category !== newCat || next[i].projected !== newProj) {
          if (hasSrc) {
            next[i] = { ...next[i], category: newCat, projected: newProj };
          } else {
            // Source cleared → reset entire Goals row
            next[i] = { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" };
          }
          changed = true;
        }
      }
      return changed ? { ...prev, goalRows: next } : prev;
    });
  }, [form.targetRows]);

  // Goals current-quarter column → Actions category + projected
  // When source clears → also wipe month values (m1–m3)
  useEffect(() => {
    const qKey = form.quarter.toLowerCase() as keyof GoalRow; // "q1" | "q2" | "q3" | "q4"
    setForm(prev => {
      const next = [...prev.actionsQtr];
      let changed = false;
      for (let i = 0; i < Math.min(prev.goalRows.length, next.length); i++) {
        const g = prev.goalRows[i];
        const qVal = String(g[qKey] ?? "").trim();
        const hasSrc = !!(g.category.trim() && g.projected.trim() && qVal);
        const newCat = hasSrc ? g.category : "";
        const newProj = hasSrc ? qVal : "";
        if (next[i].category !== newCat || next[i].projected !== newProj) {
          if (hasSrc) {
            next[i] = { ...next[i], category: newCat, projected: newProj };
          } else {
            // Source cleared → reset entire Actions row
            next[i] = { category: "", projected: "", m1: "", m2: "", m3: "" };
          }
          changed = true;
        }
      }
      return changed ? { ...prev, actionsQtr: next } : prev;
    });
  }, [form.goalRows, form.quarter]);

  /* ── Header save indicator ── */
  const SaveBadge = () => {
    if (saveState === "saving") return <span className="flex items-center gap-1 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>;
    if (saveState === "saved")  return <span className="text-xs text-green-600">✓ Saved</span>;
    if (saveState === "error")  return <span className="text-xs text-red-500">Save failed</span>;
    return null;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
    </div>
  );

  // Show setup wizard if no OPSP exists for this period
  if (showSetupWizard) {
    return (
      <OPSPSetupWizard
        fiscalYearStart={fiscalYearStart}
        currentFiscalYear={getFiscalYear()}
        currentQuarter={getFiscalQuarter()}
        onComplete={(data) => {
          // Wizard submitted — reload the form with the new data
          setShowSetupWizard(false);
          setPlanStartYear(data.year);
          setPlanEndYear(data.year + data.targetYears - 1);
          setPlanStartQuarter(data.quarter); // e.g. "Q2" if onboarded mid-year
          setForm(prev => ({
            ...prev,
            year: data.year,
            quarter: data.quarter,
            targetYears: data.targetYears,
          }));
          // Re-fetch to pick up the newly created OPSP
          (async () => {
            setLoading(true);
            try {
              const res = await fetch(`/api/opsp?year=${data.year}&quarter=${data.quarter}`);
              const json = await res.json();
              if (json.data) {
                skipNextSave.current = true;
                const normalized = normalizeLoadedOPSP(json.data);
                setForm(() => ({ ...defaultForm(), ...normalized, year: json.data.year, quarter: json.data.quarter } as FormData));
              }
            } catch {}
            setLoading(false);
          })();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-900">Create OPSP Data</h1>
          <SaveBadge />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={yearRef}>
            <button
              onClick={() => setShowYearPicker(o => !o)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showYearPicker ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {fiscalYearLabel(form.year)} · {form.quarter}
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showYearPicker && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
                  <div className="grid grid-cols-1 gap-1">
                    {(() => {
                      // Restrict years to the OPSP plan range if available
                      const start = planStartYear ?? form.year - 2;
                      const end = planEndYear ?? form.year + 2;
                      const years: number[] = [];
                      for (let y = start; y <= end; y++) years.push(y);
                      return years;
                    })().map(y => {
                      const currentFY = getFiscalYear();
                      const isCurrentFY = y === currentFY;
                      const isSelected = form.year === y;
                      const isDisabled = !isCurrentFY;
                      return (
                        <button key={y}
                          disabled={isDisabled}
                          onClick={() => { if (!isDisabled) { setForm(prev => ({ ...prev, year: y })); loadForPeriod(y, form.quarter); } }}
                          className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${
                            isSelected
                              ? "bg-gray-900 text-white"
                              : isDisabled
                                ? "text-gray-300 cursor-not-allowed"
                                : "hover:bg-gray-50 text-gray-700"
                          }`}>
                          {fiscalYearLabel(y)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                      // In the plan's first year, quarters before startQuarter are disabled
                      const qNum = parseInt(q.replace("Q", ""));
                      const startQNum = planStartQuarter ? parseInt(planStartQuarter.replace("Q", "")) : 1;
                      const isBeforeStart = form.year === planStartYear && qNum < startQNum;
                      const isSelected = form.quarter === q;
                      return (
                        <button key={q}
                          disabled={isBeforeStart}
                          onClick={() => { if (!isBeforeStart) { setForm(prev => ({ ...prev, quarter: q })); loadForPeriod(form.year, q); setShowYearPicker(false); } }}
                          className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                            isSelected
                              ? "bg-gray-900 text-white"
                              : isBeforeStart
                                ? "text-gray-300 border border-gray-100 cursor-not-allowed"
                                : "hover:bg-gray-50 text-gray-700 border border-gray-200"
                          }`}>
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => !isFinalized && setFinalizeConfirmOpen(true)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium",
              isFinalized
                ? "border-green-500 text-green-600 bg-green-50 cursor-default"
                : "border-accent-500 text-accent-600 hover:bg-accent-50")}>
            <Check className="h-4 w-4" />
            {isFinalized ? "Finalized" : "Finalize"}
          </button>
          <button onClick={() => setPreviewOpen(true)} className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50" title="Preview OPSP"><Eye className="h-4 w-4" /></button>
        </div>
      </div>

      {/* ── Finalize confirmation ── */}
      {finalizeConfirmOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Finalize OPSP?</p>
                <p className="text-sm text-gray-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Once finalized, all fields will become <span className="font-medium text-gray-800">read-only</span> and
              no further edits can be made to this quarter&apos;s OPSP. The data will be used in your OPSP Review.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setFinalizeConfirmOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmFinalize}
                className="flex-1 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700"
              >
                Yes, Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      <OPSPPreview open={previewOpen} onClose={() => setPreviewOpen(false)} form={form} users={allUsers} />

      {/* ── Modals ── */}
      <TargetsModal open={targetsOpen} onClose={() => setTargetsOpen(false)}
        rows={form.targetRows} onChange={r => set("targetRows", r)} targetYears={form.targetYears}
        fiscalYear={form.year} fiscalYearStart={fiscalYearStart} readOnly={isFinalized} />
      <GoalsModal open={goalsOpen} onClose={() => setGoalsOpen(false)}
        rows={form.goalRows} onChange={r => set("goalRows", r)}
        targetRows={form.targetRows} readOnly={isFinalized} />
      <ActionsModal open={actionsOpen} onClose={() => setActionsOpen(false)}
        rows={form.actionsQtr} onChange={r => set("actionsQtr", r)}
        fiscalYear={form.year} fiscalQuarter={form.quarter}
        goalRows={form.goalRows} readOnly={isFinalized} />
      <RocksModal open={rocksOpen} onClose={() => setRocksOpen(false)}
        rows={form.rocks} onChange={r => set("rocks", r)} readOnly={isFinalized} />
      <KeyThrustsModal open={keyThrustsOpen} onClose={() => setKeyThrustsOpen(false)}
        rows={form.keyThrusts} onChange={r => set("keyThrusts", r)} readOnly={isFinalized} />
      <KeyInitiativesModal open={keyInitiativesOpen} onClose={() => setKeyInitiativesOpen(false)}
        rows={form.keyInitiatives} onChange={r => set("keyInitiatives", r)} readOnly={isFinalized} />
      <AccountabilityModal open={kpiAcctOpen} onClose={() => setKpiAcctOpen(false)}
        rows={form.kpiAccountability} onChange={r => set("kpiAccountability", r)} readOnly={isFinalized} />
      <QuarterlyPrioritiesModal open={qPrioritiesOpen} onClose={() => setQPrioritiesOpen(false)}
        rows={form.quarterlyPriorities} onChange={r => set("quarterlyPriorities", r)} readOnly={isFinalized} />

      {/* ── Finalized read-only banner ── */}
      {isFinalized && (
        <div className="mx-6 mt-6 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">OPSP Finalized</p>
            <p className="text-xs text-green-600">This OPSP has been finalized and is now read-only. All data is locked.</p>
          </div>
        </div>
      )}

      <div className={cn("px-6 py-6 space-y-8", isFinalized && "opsp-finalized")}>

        {/* ══════════════════════════ PEOPLE ══════════════════════════ */}
        <div>
          <div className="mb-4">
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">PEOPLE</p>
            <p className="text-xs text-gray-500">(Reputation Drivers)</p>
          </div>

          {/* 3-col people */}
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-4 mb-4" style={{ minWidth: 720 }}>
              {(["employees","customers","shareholders"] as const).map((key, ci) => (
                <div key={key} className="flex-1 min-w-[220px]">
                  <p className="text-sm font-medium text-gray-700 mb-2 capitalize">{["Employees","Customers","Shareholders"][ci]}</p>
                  <Card className="space-y-2">
                    {[0,1,2].map(i => <FInput key={i} value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} />)}
                  </Card>
                </div>
              ))}
            </div>
          </div>

          {/* 4-col grid */}
          <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 items-stretch" style={{ minWidth: 1200 }}>

            {/* Core Values */}
            <Card className="flex flex-col gap-3 flex-1 min-w-[280px]">
              <CardH title="CORE VALUES/BELIEFS" subtitle="(Should/Shouldn't)" />
              <div className="flex-1 flex flex-col min-h-0">
                <RichEditor value={form.coreValues} onChange={v => set("coreValues", v)} placeholder="Enter core values..." className="flex-1 min-h-0" resetKey={`${form.year}-${form.quarter}`} />
              </div>
            </Card>

            {/* Purpose */}
            <Card className="flex flex-col gap-3 flex-1 min-w-[280px]">
              <div>
                <CardH title="PURPOSE" subtitle="(Why)" />
                <RichEditor value={form.purpose} onChange={v => set("purpose", v)} placeholder="Enter purpose..." resetKey={`${form.year}-${form.quarter}`} />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="mb-2">
                  <p className="text-xs font-bold text-gray-800 uppercase">Actions</p>
                  <p className="text-xs text-gray-500">To Live Values, Purposes, BHAG</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {form.actions.map((v, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <span className="text-xs text-gray-400 w-5 flex-shrink-0">{String(i+1).padStart(2,"0")}</span>
                      <WithTooltip content={v} className="relative flex-1 min-w-0">
                        <FInput value={v} onChange={nv => setArr("actions", i, nv)} />
                      </WithTooltip>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Profit per X</p>
                <FInput value={form.profitPerX} onChange={v => set("profitPerX", v)} />
              </div>
              {/* BHAG — fills remaining space */}
              <div className="border-t border-gray-100 pt-3 flex-1 flex flex-col">
                <p className="text-xs font-semibold text-gray-700 mb-2">BHAG®</p>
                <FTextarea value={form.bhag} onChange={v => set("bhag", v)} rows={3} className="flex-1 min-h-[60px]" />
              </div>
            </Card>

            {/* Targets */}
            <Card className="flex flex-col gap-3 flex-1 min-w-[300px]">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1">
                      TARGETS (3–5 YRS.) <Info className="h-3 w-3 text-gray-400 flex-shrink-0" />
                    </p>
                    <p className="text-xs text-gray-500">(Where)</p>
                  </div>
                  <button onClick={() => setTargetsOpen(true)} data-expand="true" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="col-span-3">Category</span>
                  <span className="col-span-2 text-right">Projected</span>
                </div>
                {form.targetRows.slice(0,5).map((row, i) => (
                  <div key={i} className="grid grid-cols-5 gap-1.5 items-start py-0.5">
                    <div className="col-span-3 min-w-0">
                      <CategorySelect value={row.category} onChange={v => {
                        const next = [...form.targetRows]; next[i] = { ...next[i], category: v, projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" }; set("targetRows", next);
                      }} />
                    </div>
                    <div className="col-span-2 min-w-0">
                      <ProjectedInput
                        categoryName={row.category}
                        value={row.projected}
                        onChange={v => {
                          const next = [...form.targetRows]; next[i] = { ...next[i], projected: v }; set("targetRows", next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Sandbox</p>
                <FTextarea value={form.sandbox} onChange={v => set("sandbox", v)} rows={3} />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-gray-800 uppercase">Key Thrusts/Capabilities</p>
                    <p className="text-xs text-gray-500">3–5 Year Priorities</p>
                  </div>
                  <button onClick={() => setKeyThrustsOpen(true)} data-expand="true" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Side-by-side: number | description | owner */}
                <div className="divide-y divide-gray-100">
                  {form.keyThrusts.map((row, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-1.5">
                      <span className="text-xs text-gray-400 w-5 flex-shrink-0">{String(i+1).padStart(2,"0")}</span>
                      <WithTooltip content={row.desc} className="relative flex-1 min-w-0">
                        <FInput value={row.desc} placeholder="Capability" onChange={v => {
                          const next = [...form.keyThrusts]; next[i] = { ...next[i], desc: v }; set("keyThrusts", next);
                        }} />
                      </WithTooltip>
                      <div className="relative w-[95px] flex-shrink-0">
                        <OwnerSelect value={row.owner} onChange={v => {
                          const next = [...form.keyThrusts]; next[i] = { ...next[i], owner: v }; set("keyThrusts", next);
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Brand Promise KPI + Brand Promise — equal split */}
              <div className="border-t border-gray-100 pt-3 flex-1 flex flex-col gap-3">
                <div className="flex-1 flex flex-col">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Brand Promise KPIs</p>
                  <FTextarea value={form.brandPromiseKPIs} onChange={v => set("brandPromiseKPIs", v)} rows={3} className="flex-1 min-h-[60px]" />
                </div>
                <div className="flex-1 flex flex-col">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Brand Promise</p>
                  <FTextarea value={form.brandPromise} onChange={v => set("brandPromise", v)} rows={3} className="flex-1 min-h-[60px]" />
                </div>
              </div>
            </Card>

            {/* Goals */}
            <Card className="flex flex-col gap-3 flex-1 min-w-[300px]">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1">
                      GOALS (1 YR.) <Info className="h-3 w-3 text-gray-400 flex-shrink-0" />
                    </p>
                    <p className="text-xs text-gray-500">(What)</p>
                  </div>
                  <button onClick={() => setGoalsOpen(true)} data-expand="true" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="col-span-3">Category</span>
                  <span className="col-span-2 text-right">Projected</span>
                </div>
                {form.goalRows.slice(0,6).map((row, i) => {
                  const t = i < form.targetRows.length ? form.targetRows[i] : null;
                  const inherited = !!(t && t.category.trim() && t.projected.trim() && t.y1.trim());
                  return (
                    <div key={i} className="grid grid-cols-5 gap-1.5 items-start py-0.5">
                      <div className="col-span-3 min-w-0">
                        {inherited ? (
                          <div className="w-full flex items-center justify-between border border-gray-200 rounded px-2 py-1.5 bg-gray-50 gap-1 cursor-not-allowed">
                            <WithTooltip content={displayCategory(row.category) || ""} className="relative flex-1 min-w-0">
                              <span className="block text-sm whitespace-nowrap truncate text-left text-gray-500">{displayCategory(row.category) || "—"}</span>
                            </WithTooltip>
                            <WithTooltip content="Locked — set in Targets" className="relative flex-shrink-0">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </WithTooltip>
                          </div>
                        ) : (
                          <CategorySelect value={row.category} onChange={v => {
                            const next = [...form.goalRows]; next[i] = { ...next[i], category: v, projected: "", q1: "", q2: "", q3: "", q4: "" }; set("goalRows", next);
                          }} />
                        )}
                      </div>
                      <div className="col-span-2 min-w-0">
                        {inherited ? (
                          <div className="flex items-center border border-gray-200 rounded bg-gray-50 overflow-hidden cursor-not-allowed">
                            <WithTooltip content={row.projected || ""} className="relative flex-1 min-w-0">
                              <span className="block text-sm text-gray-500 truncate px-2 py-1.5">{row.projected || "—"}</span>
                            </WithTooltip>
                            <WithTooltip content="Locked — set in Targets" className="relative flex-shrink-0 mr-1.5">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </WithTooltip>
                          </div>
                        ) : (
                          <ProjectedInput
                            categoryName={row.category}
                            value={row.projected}
                            onChange={v => {
                              const next = [...form.goalRows]; next[i] = { ...next[i], projected: v }; set("goalRows", next);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Key Initiatives — 3-column table (rank | description | owner), matches Key Thrusts/Capabilities */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-gray-800 uppercase">Key Initiatives</p>
                    <p className="text-xs text-gray-500">1 Year Priorities</p>
                  </div>
                  <button onClick={() => setKeyInitiativesOpen(true)} data-expand="true" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {form.keyInitiatives.map((row, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-1.5">
                      <span className="text-xs text-gray-400 w-5 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <WithTooltip content={row.desc} className="relative flex-1 min-w-0">
                        <FInput
                          value={row.desc}
                          placeholder="Initiative"
                          onChange={v => {
                            const next = [...form.keyInitiatives];
                            next[i] = { ...next[i], desc: v };
                            set("keyInitiatives", next);
                          }}
                        />
                      </WithTooltip>
                      <div className="relative w-[95px] flex-shrink-0">
                        <OwnerSelect
                          value={row.owner}
                          onChange={v => {
                            const next = [...form.keyInitiatives];
                            next[i] = { ...next[i], owner: v };
                            set("keyInitiatives", next);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <CritBlock label="Critical #" value={form.criticalNumGoals} onChange={v => set("criticalNumGoals", v)} />
                <CritBlock label="Balancing Critical #" value={form.balancingCritNumGoals} onChange={v => set("balancingCritNumGoals", v)} />
              </div>
            </Card>
          </div>
          </div>{/* end overflow-x-auto */}

          {/* Process + Weaknesses */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {(["processItems","weaknesses"] as const).map((key, ci) => (
              <div key={key}>
                <p className="text-sm font-medium text-gray-700 mb-2">{["Strengths/Core Competencies","Weaknesses:"][ci]}</p>
                <Card className="space-y-2">
                  {[0,1,2].map(i => <FInput key={i} value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} />)}
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════ PROCESS ══════════════════════════ */}
        <div>
          <div className="mb-4">
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">PROCESS</p>
            <p className="text-xs text-gray-500">(Productivity Drivers)</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            {(["makeBuy","sell","recordKeeping"] as const).map((key, ci) => (
              <div key={key}>
                <p className="text-sm font-medium text-gray-700 mb-2">{["Make/Buy","Sell","Record Keeping"][ci]}</p>
                <Card className="space-y-2">
                  {[0,1,2].map(i => <FInput key={i} value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} />)}
                </Card>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">

            {/* Actions QTR */}
            <Card className="space-y-4">
              <div>
                <CardH title="ACTIONS (QTR)" subtitle="(How)" expand onExpand={() => setActionsOpen(true)} />
                <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="col-span-3">Category</span>
                  <span className="col-span-2 text-right">Projected</span>
                </div>
                {form.actionsQtr.map((row, i) => {
                  const g = i < form.goalRows.length ? form.goalRows[i] : null;
                  const qKey = form.quarter.toLowerCase() as keyof GoalRow;
                  const gQVal = g ? String(g[qKey] ?? "").trim() : "";
                  const inherited = !!(g && g.category.trim() && g.projected.trim() && gQVal);
                  return (
                    <div key={i} className="grid grid-cols-5 gap-1.5 items-start py-0.5">
                      <div className="col-span-3 min-w-0">
                        {inherited ? (
                          <div className="w-full flex items-center justify-between border border-gray-200 rounded px-2 py-1.5 bg-gray-50 gap-1 cursor-not-allowed">
                            <WithTooltip content={displayCategory(row.category) || ""} className="relative flex-1 min-w-0">
                              <span className="block text-sm whitespace-nowrap truncate text-left text-gray-500">{displayCategory(row.category) || "—"}</span>
                            </WithTooltip>
                            <WithTooltip content="Locked — set in Goals" className="relative flex-shrink-0">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </WithTooltip>
                          </div>
                        ) : (
                          <CategorySelect value={row.category} onChange={v => {
                            const next = [...form.actionsQtr]; next[i] = { ...next[i], category: v, projected: "", m1: "", m2: "", m3: "" }; set("actionsQtr", next);
                          }} />
                        )}
                      </div>
                      <div className="col-span-2 min-w-0">
                        {inherited ? (
                          <div className="flex items-center border border-gray-200 rounded bg-gray-50 overflow-hidden cursor-not-allowed">
                            <WithTooltip content={row.projected || ""} className="relative flex-1 min-w-0">
                              <span className="block text-sm text-gray-500 truncate px-2 py-1.5">{row.projected || "—"}</span>
                            </WithTooltip>
                            <WithTooltip content="Locked — set in Goals" className="relative flex-shrink-0 mr-1.5">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </WithTooltip>
                          </div>
                        ) : (
                          <ProjectedInput
                            categoryName={row.category}
                            value={row.projected}
                            onChange={v => {
                              const next = [...form.actionsQtr]; next[i] = { ...next[i], projected: v }; set("actionsQtr", next);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Rocks — 3-column table (rank | Quarterly Priority | Who/OwnerSelect). Matches Key Thrusts/Capabilities pattern. */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-gray-800 uppercase">Rocks</p>
                    <p className="text-xs text-gray-500">Quarterly Priorities</p>
                  </div>
                  <button onClick={() => setRocksOpen(true)} data-expand="true" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="w-5 flex-shrink-0">#</span>
                  <span className="flex-1">Quarterly Priorities</span>
                  <span className="w-[95px] flex-shrink-0">Who</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {form.rocks.map((row, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-1.5">
                      <span className="text-xs text-gray-400 w-5 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <WithTooltip content={row.desc} className="relative flex-1 min-w-0">
                        <FInput
                          value={row.desc}
                          placeholder="Quarterly Priority"
                          onChange={v => {
                            const next = [...form.rocks];
                            next[i] = { ...next[i], desc: v };
                            set("rocks", next);
                          }}
                        />
                      </WithTooltip>
                      <div className="relative w-[95px] flex-shrink-0">
                        <OwnerSelect
                          value={row.owner}
                          onChange={v => {
                            const next = [...form.rocks];
                            next[i] = { ...next[i], owner: v };
                            set("rocks", next);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <CritBlock label="Critical #" value={form.criticalNumProcess} onChange={v => set("criticalNumProcess", v)} />
                <CritBlock label="Balancing Critical #" value={form.balancingCritNumProcess} onChange={v => set("balancingCritNumProcess", v)} />
              </div>
            </Card>

            {/* Theme — equal split between all 4 sections */}
            <Card className="flex flex-col gap-0 p-0 overflow-hidden">
              <div className="flex-1 flex flex-col p-4">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1">THEME</p>
                <p className="text-xs text-gray-500 mb-2">(QTR/ANNUAL)</p>
                <FTextarea value={form.theme} onChange={v => set("theme", v)} rows={4} className="flex-1 min-h-[60px]" />
              </div>
              <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-800 uppercase mb-0.5">Scoreboard Design</p>
                <p className="text-xs text-gray-500 mb-2">Describe and/or sketch your design in this space</p>
                <FTextarea value={form.scoreboardDesign} onChange={v => set("scoreboardDesign", v)} rows={3} className="flex-1 min-h-[60px]" />
              </div>
              <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-800 uppercase mb-2">Celebration</p>
                <FTextarea value={form.celebration} onChange={v => set("celebration", v)} rows={3} className="flex-1 min-h-[60px]" />
              </div>
              <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-800 uppercase mb-2">Reward</p>
                <FTextarea value={form.reward} onChange={v => set("reward", v)} rows={3} className="flex-1 min-h-[60px]" />
              </div>
            </Card>

            {/* Your Accountability */}
            <Card className="flex flex-col gap-4">
              <div className="flex flex-col gap-4">
                <CardH title="YOUR ACCOUNTABILITY" subtitle="(Who/When)" expand onExpand={() => setKpiAcctOpen(true)} />

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-12">S.no.</th>
                        <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">KPIs</th>
                        <th className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">Goal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.kpiAccountability.map((row, i) => (
                        <tr key={i} className="border-b border-gray-200 last:border-b-0">
                          <td className="border-r border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center w-12">
                            {String(i + 1).padStart(2, "0")}
                          </td>
                          <td className="border-r border-gray-200 px-3 py-1.5">
                            <input
                              value={row.kpi}
                              onChange={e => {
                                const next = [...form.kpiAccountability];
                                next[i] = { ...next[i], kpi: e.target.value };
                                set("kpiAccountability", next);
                              }}
                              placeholder="Input text"
                              className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={row.goal}
                              onChange={e => {
                                const next = [...form.kpiAccountability];
                                next[i] = { ...next[i], goal: e.target.value };
                                set("kpiAccountability", next);
                              }}
                              placeholder="Input text"
                              className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quarterly Priorities — below KPI table, above Critical # */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-bold text-gray-800">Quarterly Priorities</p>
                  <button onClick={() => setQPrioritiesOpen(true)} data-expand="true" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-12">S.no.</th>
                        <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">Quarterly Priorities</th>
                        <th className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-32">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.quarterlyPriorities.map((row, i) => (
                        <tr key={i} className="border-b border-gray-200 last:border-b-0">
                          <td className="border-r border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center w-12">
                            {String(i + 1).padStart(2, "0")}
                          </td>
                          <td className="border-r border-gray-200 px-3 py-1.5">
                            <WithTooltip content={row.priority} className="relative block w-full">
                              <input
                                value={row.priority}
                                onChange={e => {
                                  const next = [...form.quarterlyPriorities];
                                  next[i] = { ...next[i], priority: e.target.value };
                                  set("quarterlyPriorities", next);
                                }}
                                placeholder="Input text"
                                className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                              />
                            </WithTooltip>
                          </td>
                          <td className="px-3 py-1.5 w-32">
                            <div className="relative flex items-center gap-2 cursor-pointer">
                              <span className={`flex-1 text-xs truncate ${row.dueDate ? "text-gray-700" : "text-gray-400"}`}>
                                {row.dueDate
                                  ? new Date(row.dueDate + "T00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                  : "Due Date"}
                              </span>
                              <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              <input
                                type="date"
                                value={row.dueDate}
                                onChange={e => {
                                  const next = [...form.quarterlyPriorities];
                                  next[i] = { ...next[i], dueDate: e.target.value };
                                  set("quarterlyPriorities", next);
                                }}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-3">
                <CritBlock label="Critical #" value={form.criticalNumAcct} onChange={v => set("criticalNumAcct", v)} />
                <CritBlock label="Balancing Critical #" value={form.balancingCritNumAcct} onChange={v => set("balancingCritNumAcct", v)} />
              </div>
            </Card>
          </div>

          {/* Trends */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Trends</p>
            <div className="grid grid-cols-2 gap-4">
              {[0,1].map(col => (
                <Card key={col} className="space-y-2">
                  {[0,1,2].map(row => {
                    const idx = col * 3 + row;
                    return <FInput key={row} value={form.trends[idx] ?? ""} onChange={v => {
                      const next = [...form.trends]; next[idx] = v; set("trends", next);
                    }} />;
                  })}
                </Card>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
