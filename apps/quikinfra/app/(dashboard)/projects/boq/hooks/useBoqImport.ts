"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ImportMode,
  UniversalField,
  DetectColumnsResponse,
  ImportIssue,
  NormalizedBoqRow,
  PreviewData,
  Stage,
  SFLineItem,
  SFChildMode,
  SFChild,
  SFParent,
} from "../lib/types";
import {
  UNIVERSAL_FIELD_LABELS,
  UNIVERSAL_FIELD_OPTIONS,
  FIELD_GROUP,
  REQUIRED_FIELDS,
  CATEGORY_OPTIONS,
  newId,
  makeLineItem,
  makeChild,
  makeParent,
} from "../lib/constants";
import { numOrNull, flattenSelfFill, boqUploadError } from "../lib/utils";

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

  // Self-Fill builder state
  const [sfCategory, setSfCategory] = useState<string>(CATEGORY_OPTIONS[0]);
  const [sfParents, setSfParents] = useState<SFParent[]>(() => [makeParent()]);

  const sfRows = useMemo(
    () => flattenSelfFill(sfParents, sfCategory),
    [sfParents, sfCategory],
  );

  // Rollup amounts: sum leaf estimate_amt onto every ancestor by prefix match.
  // Mirrors the server-side rollup so the live preview shows the same totals
  // the BOQ grid would display after import.
  const sfRolledAmt = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of sfRows) {
      if (r.isGroup) continue;
      const amt = r.estimateAmt ?? 0;
      map.set(r.boqNo, (map.get(r.boqNo) ?? 0) + amt);
      const parts = r.boqNo.split(".");
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join(".");
        map.set(ancestor, (map.get(ancestor) ?? 0) + amt);
      }
    }
    return map;
  }, [sfRows]);

  const sfSummary = useMemo(() => {
    const leaves = sfRows.filter((r) => !r.isGroup);
    const groups = sfRows.filter((r) => r.isGroup);
    const totalAmt = leaves.reduce((sum, r) => sum + (r.estimateAmt ?? 0), 0);
    return {
      totalRows: sfRows.length,
      leaves: leaves.length,
      groups: groups.length,
      totalAmt,
    };
  }, [sfRows]);

  const reset = useCallback(() => {
    setStage("pick");
    setFile(null);
    setMode("AUTO");
    setPreview(null);
    setReplaceExisting(true);
    setError("");
    setImportResult(null);
    setSfCategory(CATEGORY_OPTIONS[0]);
    setSfParents([makeParent()]);
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

  // ── Self-Fill mutators ──────────────────────────────────────────
  const addParent = () => setSfParents((ps) => [...ps, makeParent()]);
  const removeParent = (pid: string) =>
    setSfParents((ps) => ps.filter((p) => p.id !== pid));
  const updateParent = (pid: string, patch: Partial<SFParent>) =>
    setSfParents((ps) =>
      ps.map((p) => (p.id === pid ? { ...p, ...patch } : p)),
    );

  const addChild = (pid: string, mode: SFChildMode = "leaf") =>
    setSfParents((ps) =>
      ps.map((p) => {
        if (p.id !== pid) return p;
        const base = makeChild();
        const next =
          mode === "group"
            ? { ...base, mode: "group" as const, lineItems: [makeLineItem()] }
            : base;
        return { ...p, children: [...p.children, next] };
      }),
    );
  const removeChild = (pid: string, cid: string) =>
    setSfParents((ps) =>
      ps.map((p) =>
        p.id === pid
          ? { ...p, children: p.children.filter((c) => c.id !== cid) }
          : p,
      ),
    );
  const updateChild = (pid: string, cid: string, patch: Partial<SFChild>) =>
    setSfParents((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              children: p.children.map((c) =>
                c.id === cid ? { ...c, ...patch } : c,
              ),
            }
          : p,
      ),
    );

  const setChildMode = (pid: string, cid: string, next: SFChildMode) =>
    setSfParents((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              children: p.children.map((c) => {
                if (c.id !== cid) return c;
                if (c.mode === next) return c;
                // switching to group: seed with one empty line item so the user
                // has something to type into immediately.
                if (next === "group" && c.lineItems.length === 0) {
                  return { ...c, mode: next, lineItems: [makeLineItem()] };
                }
                return { ...c, mode: next };
              }),
            }
          : p,
      ),
    );

  const addLineItem = (pid: string, cid: string) =>
    setSfParents((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              children: p.children.map((c) =>
                c.id === cid
                  ? { ...c, lineItems: [...c.lineItems, makeLineItem()] }
                  : c,
              ),
            }
          : p,
      ),
    );
  const removeLineItem = (pid: string, cid: string, lid: string) =>
    setSfParents((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              children: p.children.map((c) =>
                c.id === cid
                  ? {
                      ...c,
                      lineItems: c.lineItems.filter((li) => li.id !== lid),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );
  const updateLineItem = (
    pid: string,
    cid: string,
    lid: string,
    patch: Partial<SFLineItem>,
  ) =>
    setSfParents((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              children: p.children.map((c) =>
                c.id === cid
                  ? {
                      ...c,
                      lineItems: c.lineItems.map((li) =>
                        li.id === lid ? { ...li, ...patch } : li,
                      ),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );

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
  // Self-Fill is inline — never re-parses a file.
  // Universal swaps in a mapping-review step between upload and preview.
  const handleModeChange = (next: ImportMode) => {
    setMode(next);
    if (next === "SELF_FILL") {
      setStage("pick");
      setPreview(null);
      setFile(null);
      return;
    }
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

    // Pick the row set based on current mode
    const rowsToImport =
      mode === "SELF_FILL" ? sfRows : preview?.rows ?? [];
    const selectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "ALPHABETIC_SOR" | "UNIVERSAL" =
      mode === "SELF_FILL"
        ? "STRICT_TEMPLATE"
        : (preview?.selectedMode ?? "STRICT_TEMPLATE");
    const fileName = mode === "SELF_FILL" ? "Self-Fill" : file?.name;

    if (rowsToImport.length === 0) {
      setError("Nothing to import — add at least one line item");
      return;
    }
    if (mode !== "SELF_FILL" && preview && preview.errors.length > 0) {
      setError("Cannot import — fix the errors above first");
      return;
    }
    if (mode === "SELF_FILL") {
      // Minimal client-side validation for self-fill
      const badLeaf = rowsToImport.find(
        (r) => !r.isGroup && (r.tenderQty === null || r.rate === null || !r.unit),
      );
      if (badLeaf) {
        setError(
          `Line ${badLeaf.boqNo}: unit, tender qty, and rate are required`,
        );
        return;
      }
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
        setStage(mode === "SELF_FILL" ? "pick" : "preview");  // UNIVERSAL uses "preview" too
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
      setStage(mode === "SELF_FILL" ? "pick" : "preview");
    }
  };

  const canConfirm =
    !!projectId &&
    ((mode === "SELF_FILL" && sfSummary.leaves > 0) ||
      (mode !== "SELF_FILL" &&
        !!preview &&
        preview.rows.length > 0 &&
        preview.errors.length === 0 &&
        (stage === "preview" || stage === "confirming")));

  const stageStep =
    stage === "pick" || stage === "parsing" || stage === "detecting"
      ? 1
      : stage === "done"
      ? 3
      : 2;
  const selfFillActive = mode === "SELF_FILL" && stage === "pick";

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
    sfCategory, setSfCategory,
    sfParents, setSfParents,
    fileInputRef,
    sfRows, sfRolledAmt, sfSummary, uniStats,
    canConfirm, descriptionMapped, selfFillActive, stageStep,
    reset, resetUniToSuggestions, setUniColForField,
    addChild, addLineItem, addParent,
    removeChild, removeLineItem, removeParent,
    updateChild, updateLineItem, updateParent, setChildMode,
    handleClose, handleConfirm, handleFile, handleModeChange,
    handleUniversalConfirmMapping, handleUniversalFile,
    onDrop, onFileInputChange, uploadForMode,
  };
}
