"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, RefreshCw, Upload } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { Tile } from "../components/parts";
import type { UniversalField } from "../lib/types";
import {
  UNIVERSAL_FIELD_LABELS,
  UNIVERSAL_FIELD_OPTIONS,
  FIELD_GROUP,
  GROUP_DOT_COLOR,
  REQUIRED_FIELDS,
} from "../lib/constants";
import { useBoqImport } from "../hooks/useBoqImport";

type Props = Pick<
  ReturnType<typeof useBoqImport>,
  | "uniDetected" | "setUniDetected" | "uniFieldToCol" | "setUniFieldToCol"
  | "setUniColForField" | "resetUniToSuggestions" | "uniStats" | "descriptionMapped" | "setStage"
>;

export function ColumnMapping({
  uniDetected, setUniDetected, uniFieldToCol, setUniFieldToCol,
  setUniColForField, resetUniToSuggestions, uniStats, descriptionMapped, setStage,
}: Props) {
  if (!uniDetected) return null;
  return (
            <div className="space-y-4">
              {/* Top file bar with Reset + Replace */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{uniDetected.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {uniDetected.sheets.length} sheet{uniDetected.sheets.length !== 1 && "s"} detected · map each column to a standard BOQ field
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetUniToSuggestions}
                  className="text-xs text-gray-700 hover:bg-gray-100 font-medium flex items-center gap-1 border border-gray-200 rounded px-2 py-1"
                  title="Revert every dropdown to its heuristic suggestion"
                >
                  <RefreshCw className="w-3 h-3" /> Reset to suggestions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUniDetected(null);
                    setUniFieldToCol({});
                    setStage("pick");
                  }}
                  className="text-xs text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" /> Replace file
                </button>
              </div>

              {/* Summary stat cards */}
              <div className="grid grid-cols-4 gap-2">
                <Tile label="Detected columns" value={uniStats.totalColumns} />
                <Tile label="Fields mapped" value={uniStats.fieldsMapped} />
                <Tile label="Columns unused" value={uniStats.columnsIgnored} />
                <Tile label="Needs review" value={uniStats.needsReview} />
              </div>

              {/* Computed-fields reminder — spec §2.1 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <b>Total Done</b>, <b>Balance</b>, <b>Amount Balance</b> and <b>Progress %</b> are computed automatically from Tender Qty · Rate · Sub-Co · Self — never map a column to them.
                </span>
              </div>

              {/* Per-sheet "System Field → Import Column" table (image 1 layout) */}
              {uniDetected.sheets.map((s) => {
                const byField = uniFieldToCol[s.sheetName] ?? {};
                // Reverse lookup: which field has this column claimed? lets us
                // disable the column in other field-rows to prevent 1 col → 2 fields.
                const columnClaimedBy = new Map<number, UniversalField>();
                for (const field of UNIVERSAL_FIELD_OPTIONS) {
                  if (field === "IGNORE") continue;
                  const idx = byField[field];
                  if (typeof idx === "number") columnClaimedBy.set(idx, field);
                }

                return (
                  <div key={s.sheetName} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <div className="text-sm font-semibold text-gray-900">{s.sheetName}</div>
                      <div className="text-[11px] text-gray-500">
                        {s.headerRowIndex >= 0
                          ? `Header detected at row ${s.headerRowIndex + 1} · ${s.columns.length} column(s) available`
                          : "No header row auto-detected — sheet will be skipped"}
                      </div>
                    </div>

                    {s.headerRowIndex < 0 || s.columns.length === 0 ? (
                      <div className="px-4 py-6 text-xs text-gray-500 italic">
                        No columns to map — this sheet will be skipped.
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-white text-gray-500 uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold border-b border-gray-200 w-56">System BOQ field</th>
                            <th className="px-3 py-2 text-left font-semibold border-b border-gray-200">Import column</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(["boq_number", "description", "unit", "qty_tender", "rate", "amt_estimated", "qty_scope", "qty_subco", "qty_self", "amt_billed"] as Exclude<UniversalField, "IGNORE">[]).map((field) => {
                            const pickedCol = byField[field] ?? null;
                            const pickedColObj = pickedCol !== null
                              ? s.columns.find((c) => c.index === pickedCol)
                              : null;
                            const isRequired = REQUIRED_FIELDS.includes(field);
                            const isUnmapped = pickedCol === null || pickedCol === undefined;
                            const missingRequired = isRequired && isUnmapped;

                            // Row visual state
                            let rowBg = "bg-white";
                            if (missingRequired) rowBg = "bg-red-50/60";
                            else if (!isUnmapped) rowBg = "bg-green-50/40";
                            else rowBg = "bg-gray-50/40";

                            return (
                              <tr key={field} className={`${rowBg} border-b border-gray-100`}>
                                <td className="px-3 py-2.5 align-middle">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${GROUP_DOT_COLOR[FIELD_GROUP[field]]}`} />
                                    <span className="text-sm font-medium text-gray-900">
                                      {UNIVERSAL_FIELD_LABELS[field]}
                                      {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                                    </span>
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider ml-1">
                                      {FIELD_GROUP[field]}
                                    </span>
                                  </div>
                                  {pickedColObj && pickedColObj.samples.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5 pl-3">
                                      {pickedColObj.samples.slice(0, 3).map((v, i) => (
                                        <span
                                          key={i}
                                          className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 max-w-[140px] truncate"
                                          title={v}
                                        >
                                          {v}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 align-middle">
                                  <SelectInput
                                    value={pickedCol === null || pickedCol === undefined ? "" : String(pickedCol)}
                                    onChange={(v) => {
                                      setUniColForField(
                                        s.sheetName,
                                        field,
                                        v === "" ? null : Number(v),
                                      );
                                    }}
                                    invalid={missingRequired}
                                    placeholder="— Choose matching column —"
                                    options={s.columns.map((c) => {
                                      const claimedByField = columnClaimedBy.get(c.index);
                                      const isClaimedElsewhere =
                                        claimedByField !== undefined && claimedByField !== field;
                                      const sample = c.samples.length > 0 ? ` — ${c.samples.slice(0, 2).join(", ")}` : "";
                                      const claimSuffix = isClaimedElsewhere
                                        ? ` (used by ${UNIVERSAL_FIELD_LABELS[claimedByField!]})`
                                        : "";
                                      return {
                                        value: String(c.index),
                                        label: `${c.name}${sample}${claimSuffix}`,
                                        disabled: isClaimedElsewhere,
                                      };
                                    })}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

              {/* Spec §2.5 Section D — Field coverage pills */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Field coverage
                </div>
                <div className="flex flex-wrap gap-2">
                  {UNIVERSAL_FIELD_OPTIONS.filter((f) => f !== "IGNORE").map((f) => {
                    const field = f as Exclude<UniversalField, "IGNORE">;
                    const isMapped = uniStats.fieldsInUse.has(field);
                    const isRequired = REQUIRED_FIELDS.includes(field);
                    const missingRequired = isRequired && !isMapped;
                    const base =
                      "inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 border";
                    const colorClass = missingRequired
                      ? "bg-red-50 border-red-300 text-red-700"
                      : isMapped
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "bg-gray-50 border-gray-200 text-gray-500";
                    return (
                      <span key={f} className={`${base} ${colorClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${GROUP_DOT_COLOR[FIELD_GROUP[field]]}`} />
                        {UNIVERSAL_FIELD_LABELS[field]}
                        {isRequired && <span className="text-red-500">*</span>}
                        {isMapped && <CheckCircle2 className="w-3 h-3" />}
                      </span>
                    );
                  })}
                </div>
                {!descriptionMapped && (
                  <div className="mt-3 text-[11px] text-red-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <b>Description</b> must be mapped to at least one column before you can continue.
                  </div>
                )}
              </div>
            </div>
  );
}
