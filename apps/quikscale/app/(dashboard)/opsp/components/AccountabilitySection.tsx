"use client";

/**
 * AccountabilitySection — "YOUR ACCOUNTABILITY / KPIs / Quarterly Priorities / Critical #"
 *
 * Extracted from `page.tsx` in Phase 3 of the OPSP decomposition.
 * The two tables (KPI goals + quarterly priorities with due dates) are
 * rendered here directly rather than via a shared helper — they share
 * structure but diverge on the due-date cell.
 */

import { Calendar, Maximize2, Download } from "lucide-react";
import { Card, CardH } from "./Card";
import { CritBlock } from "./CritBlock";
import { WithTooltip } from "./pickers";
import type { FormData } from "../hooks/useOPSPForm";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  onExpandKpiAcct: () => void;
  onExpandQPriorities: () => void;
  /** Show the Export-to-KPI / Export-to-Priority buttons (sections editable). */
  showExport?: boolean;
  /** Open the Export → Create KPIs stepper (seeded from the KPI rows). */
  onExportKPI?: () => void;
  /** Open the Export → Create Priorities stepper (seeded from the rows). */
  onExportPriority?: () => void;
}

export function AccountabilitySection({
  form,
  set,
  onExpandKpiAcct,
  onExpandQPriorities,
  showExport = false,
  onExportKPI,
  onExportPriority,
}: Props) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex-1 flex flex-col gap-4">
        <CardH
          title="YOUR ACCOUNTABILITY"
          subtitle="(Who/When)"
          expand
          onExpand={onExpandKpiAcct}
        />

        <div className="flex-1 rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full h-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-12">
                  S.no.
                </th>
                <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">
                  KPIs
                </th>
                <th className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">
                  Goal
                </th>
              </tr>
            </thead>
            <tbody>
              {form.kpiAccountability.map((row, i) => (
                <tr
                  key={i}
                  data-opsp-field={`kpiAccountability.${i}`}
                  className="border-b border-gray-200 last:border-b-0"
                >
                  <td className="border-r border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center w-12">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="border-r border-gray-200 px-3 py-1.5">
                    <input
                      value={row.kpi}
                      onChange={(e) => {
                        const next = [...form.kpiAccountability];
                        next[i] = { ...next[i], kpi: e.target.value };
                        set("kpiAccountability", next);
                      }}
                      placeholder="Input text"
                      className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {/* Goal is numeric — same input type as the Individual KPI
                        Target Value field, so letters/spaces can't be typed. */}
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={row.goal}
                      onChange={(e) => {
                        const next = [...form.kpiAccountability];
                        next[i] = { ...next[i], goal: e.target.value };
                        set("kpiAccountability", next);
                      }}
                      placeholder="0"
                      className="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showExport && (
          <div className="text-right" data-expand="true">
            <button
              onClick={onExportKPI}
              className="inline-flex items-center gap-1.5 bg-accent-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent-700"
            >
              <Download className="h-3.5 w-3.5" /> Export to KPI
            </button>
          </div>
        )}
      </div>

      {/* Quarterly Priorities — below KPI table, above Critical # */}
      <div className="flex-1 flex flex-col border-t border-gray-100 pt-3">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Quarterly Priorities</p>
          <button
            onClick={onExpandQPriorities}
            data-expand="true"
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full h-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-12">
                  S.no.
                </th>
                <th className="border-b border-r border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left">
                  Quarterly Priorities
                </th>
                <th className="border-b border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 text-left w-32">
                  Due
                </th>
              </tr>
            </thead>
            <tbody>
              {form.quarterlyPriorities.map((row, i) => (
                <tr
                  key={i}
                  data-opsp-field={`quarterlyPriorities.${i}`}
                  className="border-b border-gray-200 last:border-b-0"
                >
                  <td className="border-r border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center w-12">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="border-r border-gray-200 px-3 py-1.5">
                    <WithTooltip
                      content={row.priority}
                      className="relative block w-full"
                    >
                      <input
                        value={row.priority}
                        onChange={(e) => {
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
                      <span
                        className={`flex-1 text-xs truncate ${
                          row.dueDate ? "text-gray-700" : "text-gray-400"
                        }`}
                      >
                        {row.dueDate
                          ? new Date(
                              row.dueDate + "T00:00",
                            ).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "Due Date"}
                      </span>
                      <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => {
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

        {showExport && (
          <div className="text-right mt-3" data-expand="true">
            <button
              onClick={onExportPriority}
              className="inline-flex items-center gap-1.5 bg-accent-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent-700"
            >
              <Download className="h-3.5 w-3.5" /> Export to Priority
            </button>
          </div>
        )}
      </div>

      {/* Crit cards are equal-weight siblings of the two tables above so the
          column's leftover height (it is stretched by the parent grid to match
          its taller neighbours) is shared evenly across all four blocks. Each
          card grows via flex-1 and `fill` spreads its rows to fill that share. */}
      <div className="flex-1 flex flex-col border-t border-gray-100 pt-3">
        <CritBlock
          label="Critical #"
          value={form.criticalNumAcct}
          onChange={(v) => set("criticalNumAcct", v)}
          fill
        />
      </div>
      <div className="flex-1 flex flex-col">
        <CritBlock
          label="Balancing Critical #"
          value={form.balancingCritNumAcct}
          onChange={(v) => set("balancingCritNumAcct", v)}
          fill
        />
      </div>
    </Card>
  );
}

export type AccountabilitySectionProps = Props;
