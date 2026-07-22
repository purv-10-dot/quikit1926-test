"use client";

import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { Tile, IssueList } from "../components/parts";
import { MODE_LABEL } from "../lib/constants";
import type { ImportMode } from "../lib/types";
import { useBoqImport } from "../hooks/useBoqImport";

type Props = Pick<
  ReturnType<typeof useBoqImport>,
  | "preview" | "replaceExisting" | "setReplaceExisting" | "stage"
  | "file" | "fileInputRef" | "onFileInputChange"
>;

export function Preview({
  preview, replaceExisting, setReplaceExisting, stage,
  file, fileInputRef, onFileInputChange,
}: Props) {
  if (!preview) return null;
  return (
            <>
              <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file?.name}</p>
                  <p className="text-xs text-gray-500">
                    Detected:{" "}
                    <span className="font-semibold">
                      {MODE_LABEL[(preview.detectedMode as ImportMode) ?? "AUTO"] ?? preview.detectedMode}
                    </span>
                    {" · "}Imported as:{" "}
                    <span className="font-semibold">{MODE_LABEL[preview.selectedMode as ImportMode]}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1"
                  disabled={stage === "confirming"}
                >
                  <RefreshCw className="w-3 h-3" /> Replace file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={onFileInputChange}
                />
              </div>

              {/* Summary tiles */}
              <div className="grid grid-cols-4 gap-2">
                <Tile label="Total rows" value={preview.summary.totalRows} />
                <Tile label="Billable" value={preview.summary.leafItems} />
                <Tile label="Groups" value={preview.summary.groupHeaders} />
                <Tile label="Sheets parsed" value={`${preview.summary.sheetsParsed}/${preview.summary.sheetsParsed + preview.summary.sheetsSkipped}`} />
              </div>

              {/* Per-category breakdown */}
              {Object.keys(preview.summary.perCategory).length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Items by category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(preview.summary.perCategory).map(([cat, n]) => (
                      <span
                        key={cat}
                        className="text-xs bg-gray-100 text-gray-700 rounded-full px-3 py-1"
                      >
                        {cat} <span className="font-bold">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {preview.errors.length > 0 && (
                <IssueList
                  title={`Errors (${preview.errors.length}) — must fix before import`}
                  issues={preview.errors}
                  tone="error"
                />
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <IssueList
                  title={`Warnings (${preview.warnings.length}) — review but not blocking`}
                  issues={preview.warnings}
                  tone="warning"
                />
              )}

              {/* Sample rows */}
              {preview.sampleRows.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Sample (first {preview.sampleRows.length} billable items)
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">BOQ No</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Description</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Unit</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.sampleRows.map((r, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 text-gray-700">{r.boqNo}</td>
                            <td className="px-2 py-1.5 text-gray-900 truncate max-w-[260px]">
                              {r.displayName}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600">{r.unit ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700">
                              {r.tenderQty?.toLocaleString("en-IN") ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700">
                              {r.rate?.toLocaleString("en-IN") ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-900 font-medium">
                              {r.estimateAmt?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-sheet detection */}
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Per-sheet detection details
                </summary>
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Sheet</th>
                        <th className="px-2 py-1.5 text-left">Detected as</th>
                        <th className="px-2 py-1.5 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.detection.perSheet.map((s) => (
                        <tr key={s.sheetName}>
                          <td className="px-2 py-1.5 text-gray-700">{s.sheetName}</td>
                          <td className="px-2 py-1.5 text-gray-700">
                            {MODE_LABEL[(s.detectedMode as ImportMode) ?? "AUTO"] ?? s.detectedMode}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                  disabled={stage === "confirming"}
                />
                <span className="text-xs text-gray-700">
                  Replace existing BOQ for this project
                  {replaceExisting && (
                    <span className="text-amber-600 ml-1 font-medium">
                      (current items will be deleted)
                    </span>
                  )}
                </span>
              </label>
            </>
  );
}
