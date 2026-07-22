"use client";

/**
 * BOQ Upload Revision drawer — Dual Import Engine
 *
 *   Step 1: User picks a .xlsx file. (Optional: pre-select import mode.)
 *   Step 2: Server runs the dual import pipeline (detect → adapter → validate)
 *           and returns a preview: detected mode, errors, warnings, sample rows,
 *           per-category counts. User reviews and confirms.
 *   Step 3: Confirm → server re-validates and persists. Done.
 *
 * Modes:
 *   AUTO (default) — server sniffs the workbook and picks STRICT or GENERIC
 *   STRICT_TEMPLATE — force the QuikInfra 6-column template
 *   GENERIC_SOR     — force the Aakar/govt-style 9-column SOR BOQ format
 *
 * The "Replace existing BOQ" toggle wipes the project's current BOQ before
 * insert. It's checked by default because re-uploads are far more common
 * than partial appends.
 */

import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  ChevronRight,
  PencilLine,
  Folder,
  Download,
} from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";
import { RIGHT_DRAWER_BACKDROP, RIGHT_DRAWER_FRAME, RIGHT_DRAWER_PANEL } from "@/components/FormDrawer";
import type { ImportMode } from "../lib/types";
import { MODE_LABEL, MODE_HINT } from "../lib/constants";
import { useBoqImport } from "../hooks/useBoqImport";
import { SelfFill } from "../steps/SelfFill";
import { ColumnMapping } from "../steps/ColumnMapping";
import { Preview } from "../steps/Preview";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function BOQImportDrawer({ open, onClose, projectId }: Props) {
  const {
    stage, setStage,
    file,
    mode,
    preview,
    replaceExisting, setReplaceExisting,
    error, setError,
    importResult,
    uniDetected, setUniDetected,
    uniFieldToCol, setUniFieldToCol,
    sfCategory, setSfCategory,
    sfParents,
    fileInputRef,
    sfRows, sfRolledAmt, sfSummary, uniStats,
    canConfirm, descriptionMapped, selfFillActive, stageStep,
    reset, resetUniToSuggestions, setUniColForField,
    addChild, addLineItem, addParent,
    removeChild, removeLineItem, removeParent,
    updateChild, updateLineItem, updateParent, setChildMode,
    handleClose, handleConfirm, handleModeChange,
    handleUniversalConfirmMapping,
    onDrop, onFileInputChange,
  } = useBoqImport(projectId, onClose);

  if (!open) return null;

  return (
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={handleClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div
          className={`${RIGHT_DRAWER_PANEL} transition-[max-width] ${selfFillActive ? "max-w-6xl" : "max-w-3xl"}`}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Upload BOQ Revision</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {stageStep} of 3 ·{" "}
              {stage === "pick" && "Choose Excel file"}
              {stage === "parsing" && "Parsing workbook…"}
              {stage === "detecting" && "Scanning columns…"}
              {stage === "mapping" && "Map columns to standard fields"}
              {stage === "preview" && "Review parsed BOQ"}
              {stage === "confirming" && "Importing…"}
              {stage === "done" && "Complete"}
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6 sm:px-8">
          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError("")}
                className="text-red-400 hover:text-red-600"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {!projectId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
              Select a project on the BOQ page first.
            </div>
          )}

          {/* Mode selector — visible in pick + preview */}
          {(stage === "pick" || stage === "preview") && projectId && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Import Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(["AUTO", "GENERIC_SOR"] as ImportMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleModeChange(m)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      mode === m
                        ? "bg-accent-50 border-accent-300 ring-1 ring-accent-200"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      {m === "SELF_FILL" && <PencilLine className="w-3.5 h-3.5 text-accent-500" />}
                      {m === "UNIVERSAL" && <FileSpreadsheet className="w-3.5 h-3.5 text-accent-500" />}
                      {m === "ALPHABETIC_SOR" && <Folder className="w-3.5 h-3.5 text-accent-500" />}
                      {MODE_LABEL[m]}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">{MODE_HINT[m]}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Download blank templates — visible alongside the file picker */}
          {stage === "pick" && projectId && mode !== "SELF_FILL" && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Download Sample Template
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Download a blank template, fill in your BOQ, and re-upload below.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a
                  href={`/api/projects/${projectId}/boq/template-download?format=numeric`}
                  className="flex items-start gap-2 p-2.5 rounded-md bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors group"
                >
                  <Download className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900">QuikInfra Template</div>
                    <div className="text-[10px] text-gray-500 leading-snug">
                      6 cols · BOQ No · SOR No · Description · Unit · Rate · Op. Undone Qty
                    </div>
                  </div>
                </a>
                <a
                  href={`/api/projects/${projectId}/boq/template-download?format=alphabetic`}
                  className="flex items-start gap-2 p-2.5 rounded-md bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors group"
                >
                  <Download className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900">Alphabetic SOR Template</div>
                    <div className="text-[10px] text-gray-500 leading-snug">
                      5 cols · I/NO. · SOR Numbers · Description · Total Qty · Unit (A.1 · A.2.2.1 · a.)
                    </div>
                  </div>
                </a>
              </div>
            </div>
          )}

          {/* Step 1a — file picker (hidden in SELF_FILL and STRICT_TEMPLATE
              modes; STRICT_TEMPLATE is download-only — switch to AUTO to upload) */}
          {stage === "pick" && projectId && mode !== "SELF_FILL" && mode !== "STRICT_TEMPLATE" && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-accent-400 hover:bg-accent-50 cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                Click to choose, or drag a .xlsx file here
              </p>
              <p className="text-xs text-gray-500">
                Supports both the strict QuikInfra template and generic SOR BOQ formats.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={onFileInputChange}
              />
            </div>
          )}

          {/* STRICT_TEMPLATE → download-only hint (replaces the dropzone) */}
          {stage === "pick" && projectId && mode === "STRICT_TEMPLATE" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Download-only format</div>
                <div className="text-amber-700 mt-0.5">
                  Download a template above, fill it in Excel, then switch to <b>Auto Detect</b> to upload it.
                </div>
              </div>
            </div>
          )}

          {/* Step 1b — Self-Fill builder + live Excel grid */}
          {stage === "pick" && projectId && mode === "SELF_FILL" && (
            <SelfFill
              sfCategory={sfCategory}
              setSfCategory={setSfCategory}
              sfParents={sfParents}
              addParent={addParent}
              removeParent={removeParent}
              updateParent={updateParent}
              addChild={addChild}
              removeChild={removeChild}
              updateChild={updateChild}
              setChildMode={setChildMode}
              addLineItem={addLineItem}
              removeLineItem={removeLineItem}
              updateLineItem={updateLineItem}
              sfRows={sfRows}
              sfRolledAmt={sfRolledAmt}
              sfSummary={sfSummary}
              replaceExisting={replaceExisting}
              setReplaceExisting={setReplaceExisting}
            />
          )}

          {/* Parsing spinner */}
          {stage === "parsing" && (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Parsing {file?.name}…
            </div>
          )}

          {/* Universal: detect-columns spinner */}
          {stage === "detecting" && (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Scanning {file?.name} for columns…
            </div>
          )}

          {/* Universal: column-mapping screen (Column Mapper Spec v1.0) */}
          {stage === "mapping" && uniDetected && projectId && (
            <ColumnMapping
              uniDetected={uniDetected}
              setUniDetected={setUniDetected}
              uniFieldToCol={uniFieldToCol}
              setUniFieldToCol={setUniFieldToCol}
              setUniColForField={setUniColForField}
              resetUniToSuggestions={resetUniToSuggestions}
              uniStats={uniStats}
              descriptionMapped={descriptionMapped}
              setStage={setStage}
            />
          )}

          {/* Step 2 — preview */}
          {(stage === "preview" || stage === "confirming") && preview && (
            <Preview
              preview={preview}
              replaceExisting={replaceExisting}
              setReplaceExisting={setReplaceExisting}
              stage={stage}
              file={file}
              fileInputRef={fileInputRef}
              onFileInputChange={onFileInputChange}
            />
          )}

          {/* Step 3 — done */}
          {stage === "done" && importResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">
                Imported {importResult.imported} BOQ items
              </h3>
              {importResult.warnings > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  {importResult.warnings} warning{importResult.warnings !== 1 && "s"} (review the BOQ grid)
                </p>
              )}
              <div className="mt-4 flex justify-center gap-2">
                <SecondaryButton onClick={reset}>Import another</SecondaryButton>
                <PrimaryButton onClick={handleClose}>Done</PrimaryButton>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {stage !== "done" && (
          <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50">
            <div className="text-xs text-gray-500">
              {stage === "preview" &&
                preview &&
                `${preview.summary.totalRows} rows ready · ${preview.errors.length} error(s) · ${preview.warnings.length} warning(s)`}
              {stage === "parsing" && "Reading file…"}
              {stage === "detecting" && "Scanning columns…"}
              {stage === "mapping" && uniDetected &&
                `${uniDetected.sheets.length} sheet(s) · review each column's mapping then continue`}
              {stage === "confirming" && "Importing…"}
              {stage === "pick" && mode === "SELF_FILL" &&
                (sfSummary.leaves > 0
                  ? `${sfSummary.totalRows} rows · ${sfSummary.leaves} line item(s) · ₹${sfSummary.totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                  : "Add at least one line item")}
              {stage === "pick" && mode !== "SELF_FILL" && "Choose a file to begin"}
            </div>
            <div className="flex items-center gap-3">
              <SecondaryButton onClick={handleClose}>Cancel</SecondaryButton>
              {stage === "mapping" ? (
                <PrimaryButton
                  onClick={handleUniversalConfirmMapping}
                  disabled={
                    !uniDetected ||
                    uniDetected.sheets.every((s) => s.headerRowIndex < 0) ||
                    !descriptionMapped
                  }
                >
                  <ChevronRight className="w-4 h-4" /> Confirm mapping & preview import
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={handleConfirm} disabled={!canConfirm || stage === "confirming"}>
                  {stage === "confirming" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" /> Import
                      {mode === "SELF_FILL"
                        ? sfSummary.totalRows > 0
                          ? ` (${sfSummary.totalRows})`
                          : ""
                        : preview && ` (${preview.summary.totalRows})`}
                    </>
                  )}
                </PrimaryButton>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
