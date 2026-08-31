"use client";

import { useState } from "react";
import { RightPanel } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { SAMPLE_CSV, mapRows, type MappedCase, type RowIssue } from "@/lib/test/importMap";
import { ImportDropzone } from "./import-dropzone";
import { ImportPreview } from "./import-preview";

/**
 * Import test cases from a spreadsheet into the CURRENT suite.
 *
 * Project, suite and folder are passed in from where the user opened this, so nothing
 * has to be re-selected — that was the owner's explicit requirement.
 *
 * The file is parsed IN THE BROWSER and the rows are posted as JSON. That means the
 * preview needs no round-trip, no upload endpoint has to accept arbitrary files, and
 * the user sees exactly what will be created before anything is written.
 */

type Stage = "choose" | "preview" | "done";

interface ImportSummary {
  imported: number;
  createdSections: string[];
  skipped: Array<{ rowNumber: number; title: string; reason: string }>;
  firstRefId: number | null;
  lastRefId: number | null;
}

export function ImportCasesPanel({
  open,
  onClose,
  projectId,
  suiteId,
  suiteName,
  sectionId,
  sectionName,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  suiteId: string | null;
  suiteName: string | null;
  /** Folder rows with no Section land in. Null = the suite's first folder. */
  sectionId: string | null;
  sectionName: string | null;
  onImported: () => void;
}) {
  const [stage, setStage] = useState<Stage>("choose");
  const [fileName, setFileName] = useState("");
  const [cases, setCases] = useState<MappedCase[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage("choose");
    setFileName("");
    setCases([]);
    setIssues([]);
    setUnknownHeaders([]);
    setSummary(null);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleParsed = (
    name: string,
    parsed: { headers: string[]; rows: Record<string, string>[] },
  ) => {
    setError(null);
    setFileName(name);

    if (parsed.rows.length === 0) {
      setError("That file has no data rows — only a header, or nothing at all.");
      return;
    }

    const mapped = mapRows(parsed.rows, parsed.headers);
    if (mapped.cases.length === 0) {
      setError(
        "No row in that file has a Title, so there is nothing to import. Check the column names against the sample.",
      );
      setIssues(mapped.issues);
      return;
    }

    setCases(mapped.cases);
    setIssues(mapped.issues);
    setUnknownHeaders(mapped.unknownHeaders);
    setStage("preview");
  };

  const downloadSample = () => {
    // A blob + object URL rather than a data: URI — Excel chokes on some data URIs,
    // and this gives the file a real name.
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiktest-import-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!suiteId) {
      setError("Open a suite before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/test/cases/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          suiteId,
          sectionId,
          cases: cases.map((c) => ({
            rowNumber: c.rowNumber,
            title: c.title,
            templateKind: c.templateKind,
            sectionPath: c.sectionPath,
            description: c.description,
            preconditions: c.preconditions,
            expectedResult: c.expectedResult,
            priority: c.priority,
            type: c.type,
            automationStatus: c.automationStatus,
            automationId: c.automationId,
            refTickets: c.refTickets,
            estimateMs: c.estimateMs,
            steps: c.steps.map((s) => ({
              action: s.action,
              expected: s.expected || undefined,
            })),
          })),
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: ImportSummary;
      };
      if (!json.success || !json.data) {
        setError(json.error ?? "The import failed. Nothing was created.");
        return;
      }
      setSummary(json.data);
      setStage("done");
      onImported();
    } catch {
      setError("The import failed. Nothing was created.");
    } finally {
      setImporting(false);
    }
  };

  const errorCount = issues.filter((i) => i.severity === "error").length;

  return (
    <RightPanel
      open={open}
      onClose={close}
      title="Import test cases"
      subtitle={
        suiteName
          ? `Into ${suiteName}${sectionName ? ` › ${sectionName}` : ""}`
          : undefined
      }
      size="lg"
      footer={
        <PanelFooter>
          {stage === "preview" && (
            <button
              type="button"
              onClick={runImport}
              disabled={importing || cases.length === 0}
              className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
            >
              {importing
                ? "Importing…"
                : `Import ${cases.length} case${cases.length === 1 ? "" : "s"}`}
            </button>
          )}
          {stage === "preview" && (
            <button
              type="button"
              onClick={reset}
              disabled={importing}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Choose another file
            </button>
          )}
          <button
            type="button"
            onClick={close}
            disabled={importing}
            className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {stage === "done" ? "Done" : "Cancel"}
          </button>
        </PanelFooter>
      }
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {stage === "choose" && (
          <ImportDropzone
            onParsed={handleParsed}
            onError={setError}
            onDownloadSample={downloadSample}
          />
        )}

        {stage === "preview" && (
          <ImportPreview
            fileName={fileName}
            cases={cases}
            issues={issues}
            unknownHeaders={unknownHeaders}
            errorCount={errorCount}
            targetName={
              sectionName ? `${suiteName} › ${sectionName}` : (suiteName ?? "")
            }
          />
        )}

        {stage === "done" && summary && (
          <ImportResult summary={summary} />
        )}
      </div>
    </RightPanel>
  );
}

/** Success/error summary (the spec's final step). */
function ImportResult({ summary }: { summary: ImportSummary }) {
  const range =
    summary.firstRefId !== null && summary.lastRefId !== null
      ? summary.firstRefId === summary.lastRefId
        ? `TC-${summary.firstRefId}`
        : `TC-${summary.firstRefId} – TC-${summary.lastRefId}`
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm font-medium text-green-900">
          Imported {summary.imported} test case
          {summary.imported === 1 ? "" : "s"}
          {range ? ` (${range})` : ""}.
        </p>
        {summary.createdSections.length > 0 && (
          <p className="mt-1 text-xs text-green-800">
            Created {summary.createdSections.length} new folder
            {summary.createdSections.length === 1 ? "" : "s"}:{" "}
            {summary.createdSections.join(", ")}.
          </p>
        )}
      </div>

      {/* Skipped rows are reported even on success — an importer that quietly drops
          rows is how you end up with a suite that is missing tests nobody noticed. */}
      {summary.skipped.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            {summary.skipped.length} row
            {summary.skipped.length === 1 ? " was" : "s were"} skipped
          </p>
          <ul className="mt-1.5 space-y-1">
            {summary.skipped.map((s) => (
              <li key={s.rowNumber} className="text-xs text-amber-800">
                <span className="font-medium">Row {s.rowNumber}</span>
                {s.title ? ` (${s.title})` : ""} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
