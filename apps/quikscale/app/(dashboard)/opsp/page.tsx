"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
} from "./components/category";
import {
  WithTooltip,
  OwnerSelect,
  QuarterDropdown,
} from "./components/pickers";
import { TargetsModal, GoalsModal, RocksModal } from "./components/modals";
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
  Copy,
  Calendar, X, Loader2, Printer, Download,
} from "lucide-react";

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
const emptyAction = (): ActionRow[]     => Array.from({ length: 5 }, () => ({ category:"", projected:"" }));
const emptyKPI    = (): KPIAcctRow[]    => Array.from({ length: 5 }, () => ({ kpi:"", goal:"" }));
const emptyQP     = (): QPriorRow[]     => Array.from({ length: 5 }, () => ({ priority:"", dueDate:"" }));

const defaultForm = (): FormData => ({
  year: new Date().getFullYear(), quarter: "Q1", targetYears: 5, status: "draft",
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

  const handleDownloadPDF = useCallback(async () => {
    if (!pagesRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      // A4 landscape: 297mm × 210mm
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();   // 297
      const pdfH = pdf.internal.pageSize.getHeight();  // 210
      const margin = 6; // mm margin on all sides

      const pages = pagesRef.current.querySelectorAll<HTMLElement>("[data-opsp-page]");

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        // Temporarily force a fixed width matching A4 landscape aspect ratio
        // A4 landscape ratio ≈ 1.414 → for clean rendering use 1120px
        const captureW = 1120;
        const origWidth = page.style.width;
        const origMaxWidth = page.style.maxWidth;
        const origPadding = page.style.paddingBottom;
        page.style.width = `${captureW}px`;
        page.style.maxWidth = `${captureW}px`;
        page.style.paddingBottom = "12px";

        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: captureW,
        });

        // Restore
        page.style.width = origWidth;
        page.style.maxWidth = origMaxWidth;
        page.style.paddingBottom = origPadding;

        const imgData = canvas.toDataURL("image/jpeg", 0.92);

        if (i > 0) pdf.addPage();

        // Fill the full page width (minus margins), let height scale proportionally
        const drawW = pdfW - margin * 2;
        const drawH = (canvas.height / canvas.width) * drawW;
        const drawX = margin;
        // If content is shorter than page, center vertically; if taller, top-align
        const drawY = drawH < (pdfH - margin * 2)
          ? margin + ((pdfH - margin * 2) - drawH) / 2
          : margin;

        pdf.addImage(imgData, "JPEG", drawX, drawY, drawW, Math.min(drawH, pdfH - margin * 2));
      }

      pdf.save(`OPSP_${form.year}_${form.quarter}.pdf`);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [downloading, form.year, form.quarter]);

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

  /* ── shared cell classes ── */
  const td = "border border-gray-400 px-1.5 py-1 align-top text-[9px] leading-snug text-gray-800";
  const thBold = "text-center font-bold uppercase text-[9px] bg-gray-50";
  const sub = "font-normal italic text-gray-500 text-[7px]";
  const innerTd = "border border-gray-300 px-1.5 py-0.5 text-[9px] text-gray-800";

  /* ── reusable sub-components ── */
  function CritBlock({ crit, label }: { crit: CritCard; label: string }) {
    return (
      <div className="mb-1.5">
        <div className="text-[8px] font-bold mb-0.5">
          {label}{crit.title ? ` ${crit.title}` : ""}
        </div>
        <div className="flex flex-col gap-px">
          {crit.bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px]">
              <span className={`w-2.5 h-2.5 flex-shrink-0 ${critColors[i] ?? "bg-gray-400"}`} />
              <span className="text-gray-700">{b || "\u00a0"}</span>
            </div>
          ))}
        </div>
        <div className="text-[7px] italic text-gray-400 mt-0.5">Between green &amp; red</div>
      </div>
    );
  }

  function CatProjTable({ rows, showEmpty = false }: { rows: { category: string; projected: string }[]; showEmpty?: boolean }) {
    const visible = showEmpty ? rows : rows.filter(r => r.category);
    if (visible.length === 0) return null;
    return (
      <table className="w-full border-collapse mb-1">
        <thead>
          <tr>
            <th className={cn(innerTd, "font-bold text-left")}>Category</th>
            <th className={cn(innerTd, "font-bold text-right whitespace-nowrap")} style={{ width: "80px" }}>Projected</th>
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
    return (
      <table className="w-full border-collapse">
        {rows.filter(r => r.desc).map((r, i) => (
          <tr key={i}>
            <td className="pr-1 text-gray-800 align-top whitespace-nowrap text-[9px]" style={{ width: "1em" }}>{i + 1}</td>
            <td className="text-[9px] text-gray-800 py-px">{r.desc}</td>
            <td className="text-[9px] text-gray-500 text-right whitespace-nowrap pl-1 py-px">{nameResolver(r.owner)}</td>
          </tr>
        ))}
      </table>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 print:bg-white print:static">
      {/* ── App toolbar (hidden on print) ── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-gray-900 text-white flex-shrink-0 print:hidden">
        <span className="text-sm font-medium tracking-wide">OPSP Preview — {form.year} {form.quarter}</span>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadPDF} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors disabled:opacity-50">
            {downloading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {downloading ? "Generating..." : "Download PDF"}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Scrollable pages ── */}
      <div className="flex-1 overflow-y-auto bg-gray-400 py-8 px-4 print:overflow-visible print:bg-white print:p-0">
        <div ref={pagesRef} className="max-w-[1120px] mx-auto space-y-10 print:space-y-0" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>

          {/* ═══════════════ PAGE 1 : PEOPLE ═══════════════ */}
          <div data-opsp-page="1" className="bg-white shadow-xl print:shadow-none">

            {/* Blue header bar */}
            <div className="flex bg-[#2563EB] text-white">
              <div className="flex-1 px-3 py-1.5 flex items-center gap-1">
                <span className="text-[11px] font-bold tracking-wide">Strategy:</span>
                <span className="text-[10px]">One-Page Strategic Plan (OPSP)</span>
              </div>
              <div className="border-l border-accent-400 px-3 py-1.5 flex items-center gap-1 text-[10px]">
                <span className="font-semibold">Organization:</span>
              </div>
            </div>

            <div className="px-4 pb-5 pt-2">
              {/* Section title */}
              <div className="text-center mb-2">
                <span className="text-[13px] font-bold text-accent-700">People</span>
                <span className="text-[11px] font-normal text-gray-600"> (Reputation Drivers)</span>
              </div>

              {/* ── 3-col people names ── */}
              <table className="w-full border-collapse mb-3 text-[10px]" style={{ tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "33.3%" }} /><col style={{ width: "33.4%" }} /><col style={{ width: "33.3%" }} /></colgroup>
                <tbody>
                  {[0, 1, 2].map(i => (
                    <tr key={i}>
                      {(["employees", "customers", "shareholders"] as const).map(key => (
                        <td key={key} className="px-2 py-0.5">
                          <div className="flex items-baseline gap-1 min-h-[16px] pb-0.5">
                            <span className="text-gray-800">{i + 1}.</span>
                            <span className="text-gray-800">{(form[key] as string[])[i]}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Main 4-column table ── */}
              <table className="w-full border-collapse mb-2" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "26%" }} />
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
                      <div className="prose-preview text-[9px] leading-snug [&_p]:mb-1.5 [&_strong]:font-bold" dangerouslySetInnerHTML={html(form.coreValues)} />
                    </td>

                    {/* ── Col 2: Purpose + Actions + Profit per X + BHAG ── */}
                    <td className={td}>
                      <div className="prose-preview text-[9px] leading-snug [&_p]:mb-1 mb-1" dangerouslySetInnerHTML={html(form.purpose)} />

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold uppercase text-[8px] text-center">Actions</div>
                        <div className="italic text-gray-500 text-[7px] text-center mb-0.5">To Live Values, Purposes, BHAG</div>
                        {form.actions.map((v, i) => (
                          <div key={i} className="flex gap-1 min-h-[12px] py-px">
                            <span className="text-gray-800 flex-shrink-0">{i + 1}</span>
                            <span className="text-gray-800 break-words min-w-0">{v}</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold text-[8px]">Profit per X</div>
                        <div className="prose-preview text-[9px] [&_p]:mb-1" dangerouslySetInnerHTML={html(form.profitPerX)} />
                      </div>

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold uppercase text-[8px]">BHAG&reg;</div>
                        <div className="prose-preview text-[9px] [&_p]:mb-1" dangerouslySetInnerHTML={html(form.bhag)} />
                      </div>
                    </td>

                    {/* ── Col 3: Targets + Sandbox + Key Thrusts + Brand Promise ── */}
                    <td className={td}>
                      <CatProjTable rows={form.targetRows} />

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold italic text-[8px]">Sandbox</div>
                        <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-700" dangerouslySetInnerHTML={html(form.sandbox)} />
                      </div>

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold uppercase text-[8px] text-center">Key Thrusts/Capabilities</div>
                        <div className="italic text-gray-500 text-[7px] text-center mb-0.5">3-5 Year Priorities</div>
                        <NumberedOwnerRows rows={form.keyThrusts} nameResolver={ownerName} />
                      </div>

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold text-[8px]">Brand Promise KPIs</div>
                        <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-700" dangerouslySetInnerHTML={html(form.brandPromiseKPIs)} />
                      </div>

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold text-[8px]">Brand Promises</div>
                        <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-700" dangerouslySetInnerHTML={html(form.brandPromise)} />
                      </div>
                    </td>

                    {/* ── Col 4: Goals + Key Initiatives + Critical # ── */}
                    <td className={td}>
                      <CatProjTable rows={form.goalRows} />

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="font-bold uppercase text-[8px] text-center">Key Initiatives</div>
                        <div className="italic text-gray-500 text-[7px] text-center mb-0.5">1 Year Priorities</div>
                        {/* 3-column rank | description | owner table, same pattern as Key Thrusts preview */}
                        <table className="w-full text-[9px] border-collapse">
                          <tbody>
                            {form.keyInitiatives
                              .filter(r => (r.desc && r.desc.trim().length > 0) || (r.owner && r.owner.trim().length > 0))
                              .map((r, i) => {
                                const owner = users.find(u => u.id === r.owner);
                                const ownerLabel = owner ? `${owner.firstName} ${owner.lastName}` : (r.owner || "");
                                return (
                                  <tr key={i} className="align-top">
                                    <td className="pr-1 text-gray-500 w-[14px]">{String(i + 1).padStart(2, "0")}</td>
                                    <td className="pr-1 leading-snug">{r.desc}</td>
                                    <td className="text-gray-500 whitespace-nowrap">{ownerLabel}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>

                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <CritBlock crit={form.criticalNumGoals} label="Critical #: " />
                      </div>
                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <CritBlock crit={form.balancingCritNumGoals} label="Balancing Critical #: " />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Strengths / Weaknesses ── */}
              <table className="w-full border-collapse border border-gray-400 text-[9px]">
                <tbody>
                  <tr>
                    <td className="w-1/2 border border-gray-400 px-2 py-2 align-top">
                      <div className="font-bold text-[9px] mb-1">Strengths/Core Competencies</div>
                      {form.processItems.map((v, i) => (
                        <div key={i} className="flex gap-1 min-h-[16px] py-0.5">
                          <span className="text-gray-800">{i + 1}.</span><span className="text-gray-800">{v}</span>
                        </div>
                      ))}
                    </td>
                    <td className="w-1/2 border border-gray-400 px-2 py-2 align-top">
                      <div className="font-bold text-[9px] mb-1">Weaknesses:</div>
                      {form.weaknesses.map((v, i) => (
                        <div key={i} className="flex gap-1 min-h-[16px] py-0.5">
                          <span className="text-gray-800">{i + 1}.</span><span className="text-gray-800">{v}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══════════════ PAGE 2 : PROCESS ═══════════════ */}
          <div data-opsp-page="2" className="bg-white shadow-xl print:shadow-none print:break-before-page">

            {/* Blue header bar — Your Name / Date / SCALING UP */}
            <div className="flex bg-[#2563EB] text-white">
              <div className="flex-1 px-3 py-1.5 flex items-center gap-2 text-[10px]">
                <span className="font-semibold">Your Name:</span>
                <span className="border-b border-white/60 min-w-[120px] pb-px">{form.employees?.[0] ?? ""}</span>
              </div>
              <div className="border-l border-accent-400 px-3 py-1.5 flex items-center gap-1 text-[10px]">
                <span className="font-semibold">Date:</span>
                <span>{form.year} / {form.quarter}</span>
              </div>
              <div className="border-l border-accent-400 px-3 py-1.5 flex items-center text-[11px] font-bold tracking-wider">
                SCALING UP
              </div>
            </div>

            <div className="px-4 pb-5 pt-2">
              {/* Section title */}
              <div className="text-center mb-2">
                <span className="text-[13px] font-bold text-accent-700">Process</span>
                <span className="text-[11px] font-normal text-gray-600"> (Productivity Drivers)</span>
              </div>

              {/* ── 3-col people names ── */}
              <table className="w-full border-collapse mb-3 text-[10px]" style={{ tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "33.3%" }} /><col style={{ width: "33.4%" }} /><col style={{ width: "33.3%" }} /></colgroup>
                <tbody>
                  {[0, 1, 2].map(i => (
                    <tr key={i}>
                      {(["makeBuy", "sell", "recordKeeping"] as const).map(key => (
                        <td key={key} className="px-2 py-0.5">
                          <div className="flex items-baseline gap-1 min-h-[16px] pb-0.5">
                            <span className="text-gray-800">{i + 1}.</span>
                            <span className="text-gray-800">{(form[key] as string[])[i]}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Main 3-column table ── */}
              <table className="w-full border-collapse mb-2" style={{ tableLayout: "fixed" }}>
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
                      <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-800" dangerouslySetInnerHTML={html(form.theme)} />
                    </td>

                    {/* ── Col 3: Your KPIs ── */}
                    <td className={td}>
                      <table className="w-full border-collapse mb-1">
                        <thead>
                          <tr>
                            <th className={cn(innerTd, "font-bold text-left")}>Your KPI&apos;s</th>
                            <th className={cn(innerTd, "font-bold text-right whitespace-nowrap")} style={{ width: "70px" }}>Goal</th>
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
              <table className="w-full border-collapse mb-2" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "33.3%" }} />
                  <col style={{ width: "33.4%" }} />
                  <col style={{ width: "33.3%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50">
                    <th className={cn(td, thBold)}>Rocks<br /><span className={sub}>1 Quarterly Priorities</span></th>
                    <th className={cn(td, thBold)}>Scoreboard Design<br /><span className={sub}>Describe and/or sketch your design in this space</span></th>
                    <th className={cn(td, "text-right text-[8px]")}>
                      <div className="flex justify-between font-bold text-[8px]">
                        <span>Your Quarterly Priorities</span><span className="italic font-normal text-gray-500">Due</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {/* Rocks — 3-column rank | description | owner (same format as Key Thrusts preview) */}
                    <td className={td}>
                      <table className="w-full text-[9px] border-collapse">
                        <tbody>
                          {form.rocks
                            .filter(r => (r.desc && r.desc.trim().length > 0) || (r.owner && r.owner.trim().length > 0))
                            .map((r, i) => {
                              const owner = users.find(u => u.id === r.owner);
                              const ownerLabel = owner ? `${owner.firstName} ${owner.lastName}` : (r.owner || "");
                              return (
                                <tr key={i} className="align-top">
                                  <td className="pr-1 text-gray-500 w-[14px]">{String(i + 1).padStart(2, "0")}</td>
                                  <td className="pr-1 leading-snug">{r.desc}</td>
                                  <td className="text-gray-500 whitespace-nowrap">{ownerLabel}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </td>

                    {/* Scoreboard Design */}
                    <td className={td}>
                      <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-800" dangerouslySetInnerHTML={html(form.scoreboardDesign)} />
                    </td>

                    {/* Your Quarterly Priorities with due dates */}
                    <td className={td}>
                      {form.quarterlyPriorities.map((row, i) => (
                        <div key={i} className="flex gap-1 min-h-[14px] py-px text-[9px]">
                          <span className="flex-1 text-gray-800">{row.priority}</span>
                          <span className="text-gray-600 flex-shrink-0">{fmtDue(row.dueDate)}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Bottom 3-column: Critical # / Celebration+Reward / Critical # ── */}
              <table className="w-full border-collapse mb-2" style={{ tableLayout: "fixed" }}>
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
                      <div className="font-bold text-[8px] mb-0.5">Celebration</div>
                      <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-800 mb-2" dangerouslySetInnerHTML={html(form.celebration)} />
                      <div className="font-bold text-[8px] mb-0.5 border-t border-gray-300 pt-1">Reward</div>
                      <div className="prose-preview text-[9px] [&_p]:mb-1 text-gray-800" dangerouslySetInnerHTML={html(form.reward)} />
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
              <div className="border border-gray-400 px-2 py-1.5 text-[9px]">
                <div className="font-bold text-[9px] mb-1">Trends</div>
                <div className="grid grid-cols-2 gap-x-8">
                  {[0, 1].map(col => (
                    <div key={col}>
                      {[0, 1, 2].map(row => {
                        const idx = row * 2 + col;
                        return (
                          <div key={idx} className="flex gap-1 min-h-[14px] py-px">
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
              <div className="flex justify-between text-[7px] text-gray-400 mt-1">
                <span>To get help implementing these tools, please go to www.ScalingUp.com</span>
                <span>v2.0/2C &mdash; &copy; 2020 by Scaling Up Coaches S4</span>
              </div>
            </div>
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
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [loading, setLoading] = useState(true);
  // Tenant's fiscal year start month (1 = Jan, 4 = Apr, etc.). Defaults to Jan until loaded.
  const [fiscalYearStart, setFiscalYearStart] = useState<number>(1);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [rocksOpen, setRocksOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data: allUsers = [] } = useUsers();
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const isFirstLoad = useRef(true);
  const skipNextSave = useRef(false);

  /* ── Pre-load category meta cache on mount ── */
  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(j => { if (j.success) populateCatCache(j.data); })
      .catch(() => {});
  }, []);

  /* ── Load on mount ── */
  useEffect(() => {
    (async () => {
      try {
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
  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const setArr = (key: keyof FormData, idx: number, value: string) =>
    setForm(prev => {
      const arr = [...(prev[key] as string[])];
      arr[idx] = value;
      return { ...prev, [key]: arr };
    });

  /* ── Finalize ── */
  const handleFinalize = async () => {
    await fetch("/api/opsp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: form.year, quarter: form.quarter }),
    });
    set("status", "finalized");
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-900">Create OPSP Data</h1>
          <SaveBadge />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-300 rounded-lg text-sm relative">
            <span className="px-3 py-1.5 font-medium text-gray-700 border-r border-gray-300">{form.year}</span>
            <QuarterDropdown value={form.quarter} onChange={q => {
              setForm(prev => ({ ...prev, quarter: q }));
              loadForPeriod(form.year, q);
            }} />
          </div>
          <button className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"><Copy className="h-4 w-4" /></button>
          <button onClick={handleFinalize}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium",
              form.status === "finalized"
                ? "border-green-500 text-green-600 bg-green-50"
                : "border-accent-500 text-accent-600 hover:bg-accent-50")}>
            <Check className="h-4 w-4" />
            {form.status === "finalized" ? "Finalized" : "Finalize"}
          </button>
          <button onClick={() => setPreviewOpen(true)} className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50" title="Preview OPSP"><Eye className="h-4 w-4" /></button>
          <button onClick={() => save(form)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700">
            <Maximize2 className="h-3.5 w-3.5" /> Update OPSP
          </button>
        </div>
      </div>

      {/* ── Preview ── */}
      <OPSPPreview open={previewOpen} onClose={() => setPreviewOpen(false)} form={form} users={allUsers} />

      {/* ── Modals ── */}
      <TargetsModal open={targetsOpen} onClose={() => setTargetsOpen(false)}
        rows={form.targetRows} onChange={r => set("targetRows", r)} targetYears={form.targetYears}
        fiscalYear={form.year} fiscalYearStart={fiscalYearStart} />
      <GoalsModal open={goalsOpen} onClose={() => setGoalsOpen(false)}
        rows={form.goalRows} onChange={r => set("goalRows", r)} />
      <RocksModal open={rocksOpen} onClose={() => setRocksOpen(false)}
        rows={form.rocks} onChange={r => set("rocks", r)} />

      <div className="px-6 py-6 space-y-8">

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
                  <button onClick={() => setTargetsOpen(true)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="col-span-3">Category</span>
                  <span className="col-span-2 text-right">Projected</span>
                </div>
                {form.targetRows.slice(0,3).map((row, i) => (
                  <div key={i} className="grid grid-cols-5 gap-1.5 items-start py-0.5">
                    <div className="col-span-3 min-w-0">
                      <CategorySelect value={row.category} onChange={v => {
                        const next = [...form.targetRows]; next[i] = { ...next[i], category: v }; set("targetRows", next);
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
                <div className="mb-2">
                  <p className="text-xs font-bold text-gray-800 uppercase">Key Thrusts/Capabilities</p>
                  <p className="text-xs text-gray-500">3–5 Year Priorities</p>
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
                  <button onClick={() => setGoalsOpen(true)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="col-span-3">Category</span>
                  <span className="col-span-2 text-right">Projected</span>
                </div>
                {form.goalRows.slice(0,6).map((row, i) => (
                  <div key={i} className="grid grid-cols-5 gap-1.5 items-start py-0.5">
                    <div className="col-span-3 min-w-0">
                      <CategorySelect value={row.category} onChange={v => {
                        const next = [...form.goalRows]; next[i] = { ...next[i], category: v }; set("goalRows", next);
                      }} />
                    </div>
                    <div className="col-span-2 min-w-0">
                      <ProjectedInput
                        categoryName={row.category}
                        value={row.projected}
                        onChange={v => {
                          const next = [...form.goalRows]; next[i] = { ...next[i], projected: v }; set("goalRows", next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {/* Key Initiatives — 3-column table (rank | description | owner), matches Key Thrusts/Capabilities */}
              <div className="border-t border-gray-100 pt-3">
                <div className="mb-2">
                  <p className="text-xs font-bold text-gray-800 uppercase">Key Initiatives</p>
                  <p className="text-xs text-gray-500">1 Year Priorities</p>
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
                <p className="text-sm font-medium text-gray-700 mb-2">{["Strength","Weaknesses:"][ci]}</p>
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
                <CardH title="ACTIONS (QTR)" subtitle="(How)" expand />
                <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
                  <span className="col-span-3">Category</span>
                  <span className="col-span-2 text-right">Projected</span>
                </div>
                {form.actionsQtr.map((row, i) => (
                  <div key={i} className="grid grid-cols-5 gap-1.5 items-start py-0.5">
                    <div className="col-span-3 min-w-0">
                      <CategorySelect value={row.category} onChange={v => {
                        const next = [...form.actionsQtr]; next[i] = { ...next[i], category: v }; set("actionsQtr", next);
                      }} />
                    </div>
                    <div className="col-span-2 min-w-0">
                      <ProjectedInput
                        categoryName={row.category}
                        value={row.projected}
                        onChange={v => {
                          const next = [...form.actionsQtr]; next[i] = { ...next[i], projected: v }; set("actionsQtr", next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {/* Rocks — 3-column table (rank | Quarterly Priority | Who/OwnerSelect). Matches Key Thrusts/Capabilities pattern. */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-gray-800 uppercase">Rocks</p>
                    <p className="text-xs text-gray-500">Quarterly Priorities</p>
                  </div>
                  <button onClick={() => setRocksOpen(true)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5">
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
                <CardH title="YOUR ACCOUNTABILITY" subtitle="(Who/When)" expand />

                {/* KPI Accountability table */}
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

                {/* Quarterly Priorities table */}
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

              <div className="border-t border-gray-100 pt-3 space-y-3 mt-auto">
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
