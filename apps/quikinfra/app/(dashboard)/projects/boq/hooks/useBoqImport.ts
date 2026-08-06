"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ImportMode,
  UniversalField,
  DetectColumnsResponse,
  PreviewData,
  Stage,
} from "../lib/types";
import { UNIVERSAL_FIELD_OPTIONS } from "../lib/constants";
import { boqUploadError } from "../lib/utils";

export function useBoqImport(projectId: string, onClose: () => void) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>("AUTO");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    warnings: number;
  } | null>(null);

  // Universal Import (Custom Mapping) state.
  // `uniFieldToCol[sheetName][field] = columnIndex | null`
  // — one row per standard BOQ field; user picks which file column supplies
  //   data for that field. null = not mapped. This mirrors the AAKAR Column
  //   Mapper spec's "System BOQ Field → Import Column" layout.
  const [uniDetected, setUniDetected] = useState<DetectColumnsResponse | null>(null);
  const [uniFieldToCol, setUniFieldToCol] = useState<Record<string, Partial<Record<UniversalField, number | null>>>>({});

  const reset = useCallback(() => {
    setStage("pick");
    setFile(null);
    setMode("AUTO");
    setPreview(null);
    setReplaceExisting(true);
    setError("");
    setImportResult(null);
    setUniDetected(null);
    setUniFieldToCol({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Universal Import flow ────────────────────────────────────────
  // Step 1 of 3: upload → /detect-columns → show mapping screen.
  const handleUniversalFile = async (f: File) => {
    setError("");
    setFile(f);
    setStage("detecting");
    setUniDetected(null);

    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(
        `/api/projects/${projectId}/boq/detect-columns`,
        { method: "POST", body: fd },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(boqUploadError(res, json, "Failed to scan workbook"));
        setStage("pick");
        return;
      }
      const data = (json.data ?? json) as DetectColumnsResponse;
      setUniDetected(data);

      // Seed per-sheet field→column suggestions. Walk detected columns in
      // order and for each suggested field that isn't IGNORE, adopt the
      // FIRST column that suggested it (so a single field never ends up
      // mapped to two columns in the seeded default).
      const seeded: Record<string, Partial<Record<UniversalField, number | null>>> = {};
      for (const s of data.sheets) {
        const byField: Partial<Record<UniversalField, number | null>> = {};
        for (const c of s.columns) {
          if (c.suggested === "IGNORE") continue;
          if (byField[c.suggested] === undefined) byField[c.suggested] = c.index;
        }
        seeded[s.sheetName] = byField;
      }
      setUniFieldToCol(seeded);
      setStage("mapping");
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Network error"));
      setStage("pick");
    }
  };

  // Pick (or clear) the file column that supplies a given system field.
  // Passing `null` un-maps the field.
  const setUniColForField = (
    sheetName: string,
    field: UniversalField,
    columnIndex: number | null,
  ) =>
    setUniFieldToCol((prev) => ({
      ...prev,
      [sheetName]: { ...(prev[sheetName] ?? {}), [field]: columnIndex },
    }));

  // Restore every sheet's field→column mapping to the heuristic suggestions.
  const resetUniToSuggestions = () => {
    if (!uniDetected) return;
    const seeded: Record<string, Partial<Record<UniversalField, number | null>>> = {};
    for (const s of uniDetected.sheets) {
      const byField: Partial<Record<UniversalField, number | null>> = {};
      for (const c of s.columns) {
        if (c.suggested === "IGNORE") continue;
        if (byField[c.suggested] === undefined) byField[c.suggested] = c.index;
      }
      seeded[s.sheetName] = byField;
    }
    setUniFieldToCol(seeded);
  };

  // Roll up what's currently mapped — drives the summary stats, the field-
  // coverage pills, and the Confirm-button lock.
  const uniStats = useMemo(() => {
    if (!uniDetected) {
      return {
        totalColumns: 0,
        fieldsMapped: 0,
        columnsIgnored: 0,
        needsReview: 0,
        fieldsInUse: new Set<UniversalField>(),
      };
    }
    let totalColumns = 0;
    let fieldsMapped = 0;
    let needsReview = 0;
    const fieldsInUse = new Set<UniversalField>();
    for (const s of uniDetected.sheets) {
      totalColumns += s.columns.length;
      const byField = uniFieldToCol[s.sheetName] ?? {};
      for (const field of UNIVERSAL_FIELD_OPTIONS) {
        if (field === "IGNORE") continue;
        const colIdx = byField[field];
        if (colIdx === undefined || colIdx === null) continue;
        fieldsMapped++;
        fieldsInUse.add(field);
        const col = s.columns.find((c) => c.index === colIdx);
        if (col && col.confidence < 0.7) needsReview++;
      }
    }
    // "columns ignored" = detected columns not chosen by any field mapping.
    let columnsIgnored = 0;
    for (const s of uniDetected.sheets) {
      const claimed = new Set<number>();
      const byField = uniFieldToCol[s.sheetName] ?? {};
      for (const field of UNIVERSAL_FIELD_OPTIONS) {
        if (field === "IGNORE") continue;
        const idx = byField[field];
        if (typeof idx === "number") claimed.add(idx);
      }
      columnsIgnored += s.columns.filter((c) => !claimed.has(c.index)).length;
    }
    return { totalColumns, fieldsMapped, columnsIgnored, needsReview, fieldsInUse };
  }, [uniDetected, uniFieldToCol]);

  const descriptionMapped = uniStats.fieldsInUse.has("description");

  // Step 2 of 3: user confirms mapping → /preview-upload with universalMapping.
  const handleUniversalConfirmMapping = async () => {
    if (!file || !uniDetected) return;
    setError("");
    setStage("parsing");
    setPreview(null);

    try {
      // Invert field→col back to col→field for the backend (which still
      // expects the column-keyed shape).
      const bySheet: Record<string, { headerRowIndex: number; colMap: Record<number, UniversalField> }> = {};
      for (const s of uniDetected.sheets) {
        if (s.headerRowIndex < 0) continue;
        const byField = uniFieldToCol[s.sheetName] ?? {};
        const colMap: Record<number, UniversalField> = {};
        for (const field of UNIVERSAL_FIELD_OPTIONS) {
          if (field === "IGNORE") continue;
          const idx = byField[field];
          if (typeof idx === "number") colMap[idx] = field;
        }
        bySheet[s.sheetName] = { headerRowIndex: s.headerRowIndex, colMap };
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "UNIVERSAL");
      fd.append("universalMapping", JSON.stringify({ bySheet }));

      const res = await fetch(
        `/api/projects/${projectId}/boq/preview-upload`,
        { method: "POST", body: fd },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(boqUploadError(res, json, "Failed to parse workbook"));
        setStage("mapping");
        return;
      }
      const data = (json.data ?? json) as PreviewData;
      setPreview(data);
      setStage("preview");
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Network error during preview"));
      setStage("mapping");
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ── Step 1 → 2: upload + parse via dual-import preview ─────────
  const handleFile = async (f: File, forcedMode?: ImportMode) => {
    setError("");
    setFile(f);
    setStage("parsing");
    setPreview(null);

    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("mode", forcedMode ?? mode);
      const res = await fetch(`/api/projects/${projectId}/boq/preview-upload`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(boqUploadError(res, json, "Failed to parse file"));
        setStage("pick");
        return;
      }
      const data = (json.data ?? json) as PreviewData;
      setPreview(data);
      setStage("preview");
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Network error"));
      setStage("pick");
    }
  };

  // Pick the right upload handler based on the current mode.
  const uploadForMode = (f: File) => {
    if (mode === "UNIVERSAL") return void handleUniversalFile(f);
    return void handleFile(f);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadForMode(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) uploadForMode(f);
  };

  // Re-run preview when user changes mode (only if a file is loaded).
  // Universal swaps in a mapping-review step between upload and preview.
  const handleModeChange = (next: ImportMode) => {
    setMode(next);
    if (next === "UNIVERSAL") {
      setStage("pick");
      setPreview(null);
      setFile(null);
      setUniDetected(null);
      setUniFieldToCol({});
      return;
    }
    if (file && stage === "preview") {
      void handleFile(file, next);
    }
  };

  // ── Step 3: confirm import — send the parsed rows back ─────────
  const handleConfirm = async () => {
    if (!projectId) {
      setError("No project selected");
      return;
    }

    const rowsToImport = preview?.rows ?? [];
    const selectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "ALPHABETIC_SOR" | "UNIVERSAL" =
      preview?.selectedMode ?? "STRICT_TEMPLATE";
    const fileName = file?.name;

    if (rowsToImport.length === 0) {
      setError("Nothing to import — add at least one line item");
      return;
    }
    if (preview && preview.errors.length > 0) {
      setError("Cannot import — fix the errors above first");
      return;
    }

    setStage("confirming");
    setError("");

    try {
      const res = await fetch(`/api/projects/${projectId}/boq/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `boq-import-${projectId}-${Date.now()}`,
        },
        body: JSON.stringify({
          fileName,
          mode: selectedMode,
          rows: rowsToImport,
          replaceExisting,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(boqUploadError(res, json, `Import failed (HTTP ${res.status})`));
        setStage("preview");  // UNIVERSAL uses "preview" too
        return;
      }

      qc.invalidateQueries({ queryKey: ["boq"] });
      qc.invalidateQueries({ queryKey: ["boq-infinite"] });
      setImportResult({
        imported: json.imported ?? 0,
        warnings: (json.warnings?.length ?? 0) as number,
      });
      setStage("done");
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Network error during import"));
      setStage("preview");
    }
  };

  const canConfirm =
    !!projectId &&
    !!preview &&
    preview.rows.length > 0 &&
    preview.errors.length === 0 &&
    (stage === "preview" || stage === "confirming");

  const stageStep =
    stage === "pick" || stage === "parsing" || stage === "detecting"
      ? 1
      : stage === "done"
      ? 3
      : 2;

  return {
    stage, setStage,
    file, setFile,
    mode, setMode,
    preview, setPreview,
    replaceExisting, setReplaceExisting,
    error, setError,
    importResult, setImportResult,
    uniDetected, setUniDetected,
    uniFieldToCol, setUniFieldToCol,
    fileInputRef,
    uniStats,
    canConfirm, descriptionMapped, stageStep,
    reset, resetUniToSuggestions, setUniColForField,
    handleClose, handleConfirm, handleFile, handleModeChange,
    handleUniversalConfirmMapping, handleUniversalFile,
    onDrop, onFileInputChange, uploadForMode,
  };
}
