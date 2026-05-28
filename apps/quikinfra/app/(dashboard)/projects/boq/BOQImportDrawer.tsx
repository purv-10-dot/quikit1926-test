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

import { useState, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Info,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  PencilLine,
  Folder,
  FileText,
  Download,
} from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";
import { SelectInput, RIGHT_DRAWER_BACKDROP, RIGHT_DRAWER_FRAME, RIGHT_DRAWER_PANEL } from "@/components/FormDrawer";

type ImportMode =
  | "AUTO"
  | "STRICT_TEMPLATE"
  | "GENERIC_SOR"
  | "ALPHABETIC_SOR"
  | "SELF_FILL"
  | "UNIVERSAL";

// Standard BOQ fields a user can map a detected column to (spec §1.1 + §4).
// Kept in sync with UniversalField in src/lib/boq/import/universal-adapter.ts.
type UniversalField =
  | "boq_number"
  | "description"
  | "unit"
  | "rate"
  | "qty_tender"
  | "qty_scope"
  | "qty_subco"
  | "qty_self"
  | "amt_estimated"
  | "amt_billed"
  | "IGNORE";

const UNIVERSAL_FIELD_LABELS: Record<UniversalField, string> = {
  boq_number: "BOQ No.",
  description: "Description",
  unit: "Unit",
  rate: "Rate",
  qty_tender: "Tender Qty",
  qty_scope: "Scope Qty",
  qty_subco: "Sub-Co Qty",
  qty_self: "Self Qty",
  amt_estimated: "Estimated Amount",
  amt_billed: "Billed Amount",
  IGNORE: "— Ignore —",
};

const UNIVERSAL_FIELD_OPTIONS: UniversalField[] = [
  "boq_number",
  "description",
  "unit",
  "rate",
  "qty_tender",
  "qty_scope",
  "qty_subco",
  "qty_self",
  "amt_estimated",
  "amt_billed",
  "IGNORE",
];

// Field groups per Column Mapper Spec v1.0 §2.3. Drives the <optgroup>
// structure in the mapping dropdown and the color dots on the coverage pills.
type UniversalGroup = "Identity" | "Quantities" | "Amounts";

const FIELD_GROUP: Record<Exclude<UniversalField, "IGNORE">, UniversalGroup> = {
  boq_number: "Identity",
  description: "Identity",
  unit: "Identity",
  rate: "Quantities",
  qty_tender: "Quantities",
  qty_scope: "Quantities",
  qty_subco: "Quantities",
  qty_self: "Quantities",
  amt_estimated: "Amounts",
  amt_billed: "Amounts",
};

const GROUP_ORDER: UniversalGroup[] = ["Identity", "Quantities", "Amounts"];

const GROUP_DOT_COLOR: Record<UniversalGroup, string> = {
  Identity: "bg-orange-500",
  Quantities: "bg-green-500",
  Amounts: "bg-amber-500",
};

// description is the only required field (Column Mapper Spec §1.2).
const REQUIRED_FIELDS: UniversalField[] = ["description"];

interface DetectedColumn {
  index: number;
  name: string;
  samples: string[];
  suggested: UniversalField;
  confidence: number;
}

interface DetectedSheetColumns {
  sheetName: string;
  headerRowIndex: number;
  headerScore: number;
  columns: DetectedColumn[];
}

interface DetectColumnsResponse {
  fileName: string;
  fileSize: number;
  sheets: DetectedSheetColumns[];
}

interface ImportIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  sheet?: string;
  rowNumber?: number;
  boqNo?: string | null;
  field?: string;
}

interface NormalizedBoqRow {
  category: string;
  sourceSheet: string;
  sourceRowNumber: number;
  boqNo: string;
  parentBoqNo: string | null;
  depth: number;
  isGroup: boolean;
  displayName: string;
  description: string;
  unit: string | null;
  tenderQty: number | null;
  rate: number | null;
  estimateAmt: number | null;
  importMode: "STRICT_TEMPLATE" | "GENERIC_SOR";
  warnings?: ImportIssue[];
}

interface DetectedSheet {
  sheetName: string;
  detectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "UNKNOWN";
  confidence: number;
  reason: string;
  headerRowIndex?: number;
}

interface PreviewData {
  fileName: string;
  fileSize: number;
  selectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "ALPHABETIC_SOR" | "UNIVERSAL";
  detectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "ALPHABETIC_SOR" | "UNIVERSAL" | "UNKNOWN";
  supportedModes: string[];
  detection: { workbookMode: string; perSheet: DetectedSheet[] };
  summary: {
    totalRows: number;
    leafItems: number;
    groupHeaders: number;
    sheetsParsed: number;
    sheetsSkipped: number;
    perCategory: Record<string, number>;
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
  sampleRows: NormalizedBoqRow[];
  rows: NormalizedBoqRow[]; // full set for confirm round-trip
}

type Stage =
  | "pick"
  | "parsing"          // running the auto/strict/generic preview
  | "detecting"        // Universal: detect-columns in flight
  | "mapping"          // Universal: user is reviewing/editing column mapping
  | "preview"
  | "confirming"
  | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

const MODE_LABEL: Record<ImportMode, string> = {
  AUTO: "Auto Detect",
  STRICT_TEMPLATE: "QuikInfra Template",
  GENERIC_SOR: "Generic SOR BOQ",
  ALPHABETIC_SOR: "Alphabetic SOR",
  SELF_FILL: "Self Fill",
  UNIVERSAL: "Custom Mapping",
};

const MODE_HINT: Record<ImportMode, string> = {
  AUTO: "Server sniffs the workbook and picks the right format.",
  STRICT_TEMPLATE: "6 columns: BOQ No · SOR No · Description · Unit · Rate · Op. Undone Qty",
  GENERIC_SOR: "9 columns: S.No · SOR Item · Sub Item · Item Name · Description · Unit · Qty · Rate · Amount",
  ALPHABETIC_SOR: "Alphabetic numbering — I/NO. · SOR Numbers · Description · Total Qty · Unit (A.1 · A.2.2.1 · a. · b.)",
  SELF_FILL: "Build BOQ inline — parent → child → line items, no Excel needed.",
  UNIVERSAL: "Any format — you pick which column is which. No fixed structure required.",
};

// Self-Fill tree model — user builds parent groups with children that are either
// leaves (hold qty/rate directly, no sub-items) or groups (contain line items).
// String inputs so fields can be cleared while typing; parsed when flattened.
interface SFLineItem {
  id: string;
  /** Override the last numeric segment of the BOQ No (e.g. "3" for 2.7.3).
   *  Empty string falls back to the sequential position (1-based). */
  boqNoOverride: string;
  displayName: string;
  unit: string;
  tenderQty: string;
  rate: string;
}

type SFChildMode = "leaf" | "group";

interface SFChild {
  id: string;
  /** Override the last numeric segment (e.g. "6" → "2.6"). Empty = auto. */
  boqNoOverride: string;
  mode: SFChildMode;
  displayName: string;
  // leaf fields (used when mode === "leaf")
  unit: string;
  tenderQty: string;
  rate: string;
  // group fields (used when mode === "group")
  lineItems: SFLineItem[];
}

interface SFParent {
  id: string;
  /** Override the top-level BOQ No (e.g. "4"). Empty = auto. */
  boqNoOverride: string;
  displayName: string;
  children: SFChild[];
}

const CATEGORY_OPTIONS = ["Civil Building", "Electrical", "Road Works"] as const;

const newId = () => Math.random().toString(36).slice(2, 10);

const makeLineItem = (): SFLineItem => ({
  id: newId(),
  boqNoOverride: "",
  displayName: "",
  unit: "",
  tenderQty: "",
  rate: "",
});

const makeChild = (): SFChild => ({
  id: newId(),
  boqNoOverride: "",
  mode: "leaf",
  displayName: "",
  unit: "",
  tenderQty: "",
  rate: "",
  lineItems: [],
});

const makeParent = (): SFParent => ({
  id: newId(),
  boqNoOverride: "",
  displayName: "",
  children: [makeChild()],
});

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Flatten the Self-Fill tree into NormalizedBoqRow[] for the import pipeline.
 *
 * Numbering follows the existing convention:
 *   parent     → "1", "2"
 *   child leaf → "1.1", "1.2"    (isGroup=false, depth=1, has qty/rate)
 *   child grp  → "1.1", "1.2"    (isGroup=true,  depth=1, no qty/rate)
 *   line item  → "1.1.1"         (isGroup=false, depth=2, under a child group)
 *
 * A child can be either a leaf (direct qty/rate, no sub-items) or a group
 * (contains line items). This mirrors the real BOQ where parents can have
 * leaf children directly (e.g. 2.2, 2.6) OR group children with sub-leaves
 * (e.g. 2.7 → 2.7.1).
 */
function flattenSelfFill(
  parents: SFParent[],
  category: string,
): NormalizedBoqRow[] {
  const rows: NormalizedBoqRow[] = [];
  let rowNum = 1;

  // BOQ No resolver: override wins, else 1-based position.
  // Accepts full dotted override ("2.6") or last-segment only ("6").
  const resolveSegment = (override: string, position: number): string => {
    const t = override.trim();
    if (!t) return String(position);
    // if user typed a dotted path, use its last segment here (full path reconstructed below)
    const parts = t.split(".");
    return parts[parts.length - 1] || String(position);
  };

  parents.forEach((parent, pIdx) => {
    const parentNo = resolveSegment(parent.boqNoOverride, pIdx + 1);

    const hasContent =
      parent.displayName.trim() ||
      parent.children.some(
        (c) =>
          c.displayName.trim() ||
          (c.mode === "group" &&
            c.lineItems.some((li) => li.displayName.trim())),
      );
    if (!hasContent) return;

    rows.push({
      category,
      sourceSheet: "Self Fill",
      sourceRowNumber: rowNum++,
      boqNo: parentNo,
      parentBoqNo: null,
      depth: 0,
      isGroup: true,
      displayName: parent.displayName.trim() || `Group ${parentNo}`,
      description: parent.displayName.trim(),
      unit: null,
      tenderQty: null,
      rate: null,
      estimateAmt: null,
      importMode: "STRICT_TEMPLATE",
      warnings: [],
    });

    parent.children.forEach((child, cIdx) => {
      const childSeg = resolveSegment(child.boqNoOverride, cIdx + 1);
      const childNo = `${parentNo}.${childSeg}`;

      if (child.mode === "leaf") {
        const qty = numOrNull(child.tenderQty);
        const rate = numOrNull(child.rate);
        const amt = qty !== null && rate !== null ? qty * rate : null;
        rows.push({
          category,
          sourceSheet: "Self Fill",
          sourceRowNumber: rowNum++,
          boqNo: childNo,
          parentBoqNo: parentNo,
          depth: 1,
          isGroup: false,
          displayName: child.displayName.trim() || `Item ${childNo}`,
          description: child.displayName.trim(),
          unit: child.unit.trim() || null,
          tenderQty: qty,
          rate,
          estimateAmt: amt,
          importMode: "STRICT_TEMPLATE",
          warnings: [],
        });
        return;
      }

      // group mode: emit group row + its line items
      rows.push({
        category,
        sourceSheet: "Self Fill",
        sourceRowNumber: rowNum++,
        boqNo: childNo,
        parentBoqNo: parentNo,
        depth: 1,
        isGroup: true,
        displayName: child.displayName.trim() || `Sub-group ${childNo}`,
        description: child.displayName.trim(),
        unit: null,
        tenderQty: null,
        rate: null,
        estimateAmt: null,
        importMode: "STRICT_TEMPLATE",
        warnings: [],
      });

      child.lineItems.forEach((li, lIdx) => {
        const liSeg = resolveSegment(li.boqNoOverride, lIdx + 1);
        const liNo = `${childNo}.${liSeg}`;
        const qty = numOrNull(li.tenderQty);
        const rate = numOrNull(li.rate);
        const amt = qty !== null && rate !== null ? qty * rate : null;
        rows.push({
          category,
          sourceSheet: "Self Fill",
          sourceRowNumber: rowNum++,
          boqNo: liNo,
          parentBoqNo: childNo,
          depth: 2,
          isGroup: false,
          displayName: li.displayName.trim() || `Item ${liNo}`,
          description: li.displayName.trim(),
          unit: li.unit.trim() || null,
          tenderQty: qty,
          rate,
          estimateAmt: amt,
          importMode: "STRICT_TEMPLATE",
          warnings: [],
        });
      });
    });
  });

  return rows;
}

export function BOQImportDrawer({ open, onClose, projectId }: Props) {
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
        setError(json.error ?? json.message ?? "Failed to scan workbook");
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
    } catch (e: any) {
      setError(e?.message ?? "Network error");
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
        setError(json.error ?? json.message ?? "Failed to parse workbook");
        setStage("mapping");
        return;
      }
      const data = (json.data ?? json) as PreviewData;
      setPreview(data);
      setStage("preview");
    } catch (e: any) {
      setError(e?.message ?? "Network error during preview");
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
        setError(json.error ?? json.message ?? "Failed to parse file");
        setStage("pick");
        return;
      }
      const data = (json.data ?? json) as PreviewData;
      setPreview(data);
      setStage("preview");
    } catch (e: any) {
      setError(e?.message ?? "Network error");
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
        setError(json.error ?? json.message ?? `Import failed (HTTP ${res.status})`);
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
    } catch (e: any) {
      setError(e?.message ?? "Network error during import");
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

  if (!open) return null;

  const stageStep =
    stage === "pick" || stage === "parsing" || stage === "detecting"
      ? 1
      : stage === "done"
      ? 3
      : 2;
  const selfFillActive = mode === "SELF_FILL" && stage === "pick";

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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(["AUTO", "STRICT_TEMPLATE", "GENERIC_SOR"] as ImportMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleModeChange(m)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      mode === m
                        ? "bg-orange-50 border-orange-300 ring-1 ring-orange-200"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      {m === "SELF_FILL" && <PencilLine className="w-3.5 h-3.5 text-orange-500" />}
                      {m === "UNIVERSAL" && <FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" />}
                      {m === "ALPHABETIC_SOR" && <Folder className="w-3.5 h-3.5 text-orange-500" />}
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
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-orange-400 hover:bg-orange-50/30 cursor-pointer transition-colors"
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
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Left: builder */}
              <div className="lg:col-span-3 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Category
                  </label>
                  <div className="min-w-[180px]">
                    <SelectInput
                      value={sfCategory}
                      onChange={setSfCategory}
                      options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {sfParents.map((parent, pIdx) => (
                    <div
                      key={parent.id}
                      className="border border-gray-200 rounded-lg bg-white"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                        <input
                          type="text"
                          placeholder={String(pIdx + 1)}
                          value={parent.boqNoOverride}
                          onChange={(e) =>
                            updateParent(parent.id, { boqNoOverride: e.target.value })
                          }
                          className="w-12 text-[11px] font-mono font-bold text-orange-700 bg-orange-100 border border-orange-200 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder-orange-300"
                          title="BOQ No (leave blank to auto-number)"
                        />
                        <input
                          type="text"
                          placeholder="Parent group name (e.g. Structural Work)"
                          value={parent.displayName}
                          onChange={(e) =>
                            updateParent(parent.id, { displayName: e.target.value })
                          }
                          className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none text-gray-900 placeholder-gray-400"
                        />
                        <button
                          onClick={() => removeParent(parent.id)}
                          disabled={sfParents.length === 1}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove parent"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-3 space-y-2">
                        {parent.children.map((child, cIdx) => (
                          <div
                            key={child.id}
                            className="border border-gray-100 rounded-md"
                          >
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50/60">
                              {child.mode === "group" ? (
                                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <input
                                type="text"
                                placeholder={String(cIdx + 1)}
                                value={child.boqNoOverride}
                                onChange={(e) =>
                                  updateChild(parent.id, child.id, {
                                    boqNoOverride: e.target.value,
                                  })
                                }
                                className="w-10 text-[10px] font-mono text-gray-700 bg-white border border-gray-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-gray-400"
                                title="BOQ No suffix (e.g. 6 → 2.6). Leave blank to auto-number."
                              />
                              <input
                                type="text"
                                placeholder={
                                  child.mode === "group"
                                    ? "Sub-group name (e.g. Foundation)"
                                    : "Item description"
                                }
                                value={child.displayName}
                                onChange={(e) =>
                                  updateChild(parent.id, child.id, {
                                    displayName: e.target.value,
                                  })
                                }
                                className="flex-1 text-xs font-medium bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400 min-w-0"
                              />

                              {child.mode === "leaf" && (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Unit"
                                    value={child.unit}
                                    onChange={(e) =>
                                      updateChild(parent.id, child.id, {
                                        unit: e.target.value,
                                      })
                                    }
                                    className="w-16 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Qty"
                                    value={child.tenderQty}
                                    onChange={(e) =>
                                      updateChild(parent.id, child.id, {
                                        tenderQty: e.target.value,
                                      })
                                    }
                                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Rate"
                                    value={child.rate}
                                    onChange={(e) =>
                                      updateChild(parent.id, child.id, {
                                        rate: e.target.value,
                                      })
                                    }
                                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                  />
                                </>
                              )}

                              {/* Leaf ↔ Group toggle */}
                              <div className="flex border border-gray-200 rounded overflow-hidden text-[10px] shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChildMode(parent.id, child.id, "leaf")
                                  }
                                  className={`px-1.5 py-0.5 ${
                                    child.mode === "leaf"
                                      ? "bg-orange-500 text-white"
                                      : "bg-white text-gray-500 hover:bg-gray-50"
                                  }`}
                                  title="Child holds qty/rate directly (no sub-items)"
                                >
                                  Leaf
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChildMode(parent.id, child.id, "group")
                                  }
                                  className={`px-1.5 py-0.5 border-l border-gray-200 ${
                                    child.mode === "group"
                                      ? "bg-orange-500 text-white"
                                      : "bg-white text-gray-500 hover:bg-gray-50"
                                  }`}
                                  title="Child is a group with line items beneath"
                                >
                                  Group
                                </button>
                              </div>

                              <button
                                onClick={() => removeChild(parent.id, child.id)}
                                disabled={parent.children.length === 1}
                                className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                title="Remove child"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Line items — only when this child is a group */}
                            {child.mode === "group" && (
                              <div className="p-2 space-y-1.5">
                                {child.lineItems.map((li, lIdx) => (
                                  <div
                                    key={li.id}
                                    className="flex items-center gap-1.5"
                                  >
                                    <input
                                      type="text"
                                      placeholder={String(lIdx + 1)}
                                      value={li.boqNoOverride}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          boqNoOverride: e.target.value,
                                        })
                                      }
                                      className="w-10 text-[10px] font-mono text-gray-600 bg-white border border-gray-200 rounded px-1 py-0.5 text-center shrink-0 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-gray-400"
                                      title="BOQ No suffix. Leave blank to auto-number."
                                    />
                                    <input
                                      type="text"
                                      placeholder="Item description"
                                      value={li.displayName}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          displayName: e.target.value,
                                        })
                                      }
                                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300 min-w-0"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Unit"
                                      value={li.unit}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          unit: e.target.value,
                                        })
                                      }
                                      className="w-16 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    />
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="Qty"
                                      value={li.tenderQty}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          tenderQty: e.target.value,
                                        })
                                      }
                                      className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    />
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="Rate"
                                      value={li.rate}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          rate: e.target.value,
                                        })
                                      }
                                      className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    />
                                    <button
                                      onClick={() =>
                                        removeLineItem(parent.id, child.id, li.id)
                                      }
                                      disabled={child.lineItems.length === 1}
                                      className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title="Remove line item"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => addLineItem(parent.id, child.id)}
                                  className="text-[11px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 ml-12"
                                >
                                  <Plus className="w-3 h-3" /> Add line item
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => addChild(parent.id, "leaf")}
                            className="text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 border border-dashed border-orange-300 rounded px-2 py-1 font-medium flex items-center gap-1"
                            title="Add a leaf child (holds qty/rate directly, e.g. 1.2)"
                          >
                            <FileText className="w-3 h-3" />
                            <Plus className="w-3 h-3" /> Add leaf child
                          </button>
                          <button
                            onClick={() => addChild(parent.id, "group")}
                            className="text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-dashed border-amber-300 rounded px-2 py-1 font-medium flex items-center gap-1"
                            title="Add a group child (contains line items, e.g. 1.2 → 1.2.1)"
                          >
                            <Folder className="w-3 h-3" />
                            <Plus className="w-3 h-3" /> Add group child
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addParent}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-xs font-medium text-gray-600 hover:border-orange-300 hover:bg-orange-50/30 hover:text-orange-700 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add parent group
                </button>
              </div>

              {/* Right: live Excel-style preview */}
              <div className="lg:col-span-2 lg:sticky lg:top-0 lg:self-start">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Live Preview
                </label>
                <div className="border border-gray-200 rounded-md overflow-hidden bg-white">
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                          <th className="px-2 py-2 text-left font-semibold border-b border-gray-200 w-14">BOQ No.</th>
                          <th className="px-2 py-2 text-left font-semibold border-b border-gray-200 min-w-[220px]">
                            Description
                          </th>
                          <th className="px-2 py-2 text-left font-semibold border-b border-gray-200 w-14">Unit</th>
                          <th className="px-2 py-2 text-right font-semibold border-b border-gray-200 w-16">Rate</th>
                          <th className="px-2 py-2 text-right font-semibold border-b border-gray-200 w-20">Qty</th>
                          <th className="px-2 py-2 text-right font-semibold border-b border-gray-200 w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sfRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-2 py-10 text-center text-gray-400 italic"
                            >
                              Start adding parents, children, and line items on the left.
                            </td>
                          </tr>
                        ) : (
                          sfRows.map((r, i) => {
                            const isLeaf = !r.isGroup;
                            const rolled = sfRolledAmt.get(r.boqNo) ?? 0;
                            // Row styling mirrors the BOQ grid:
                            //   depth 0 group → bold, faint gray background
                            //   depth 1 group → semibold
                            //   leaf          → regular weight
                            const rowClass = r.isGroup
                              ? r.depth === 0
                                ? "bg-gray-50/80 font-bold text-gray-900"
                                : "bg-white font-semibold text-gray-800"
                              : "bg-white text-gray-700";
                            return (
                              <tr key={i} className={rowClass}>
                                <td className="px-2 py-1.5 font-mono align-top border-b border-gray-100 text-gray-500">
                                  {r.boqNo}
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100">
                                  <div
                                    className="flex items-start gap-1.5"
                                    style={{ paddingLeft: `${r.depth * 14}px` }}
                                  >
                                    {r.isGroup ? (
                                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                    )}
                                    <span className="break-words">
                                      {r.displayName}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-center text-orange-600 font-medium">
                                  {isLeaf ? r.unit ?? "" : ""}
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-right">
                                  {isLeaf ? r.rate?.toLocaleString("en-IN") ?? "" : ""}
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-right">
                                  {isLeaf ? r.tenderQty?.toLocaleString("en-IN") ?? "" : ""}
                                </td>
                                <td
                                  className={`px-2 py-1.5 align-top border-b border-gray-100 text-right ${
                                    r.isGroup ? "text-indigo-600" : "text-gray-900 font-medium"
                                  }`}
                                >
                                  {rolled > 0
                                    ? rolled.toLocaleString("en-IN", {
                                        maximumFractionDigits: 2,
                                      })
                                    : ""}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {sfRows.length > 0 && (
                        <tfoot className="bg-gray-50 font-bold text-gray-900 sticky bottom-0">
                          <tr>
                            <td colSpan={5} className="px-2 py-2 text-right border-t border-gray-300">
                              Total amount
                            </td>
                            <td className="px-2 py-2 text-right border-t border-gray-300">
                              ₹{sfSummary.totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Tile label="Parents" value={sfParents.length} />
                  <Tile label="Groups" value={sfSummary.groups} />
                  <Tile label="Line items" value={sfSummary.leaves} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-3">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
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
              </div>
            </div>
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
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
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
          )}

          {/* Step 2 — preview */}
          {(stage === "preview" || stage === "confirming") && preview && (
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
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
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
                            <td className="px-2 py-1.5 font-mono text-gray-700">{r.boqNo}</td>
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
                          <td className="px-2 py-1.5 font-mono text-gray-700">{s.sheetName}</td>
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
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
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

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: ImportIssue[];
  tone: "error" | "warning";
}) {
  const colors =
    tone === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-amber-50 border-amber-200 text-amber-700";
  const Icon = tone === "error" ? AlertTriangle : Info;
  return (
    <div className={`border rounded-lg ${colors}`}>
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b border-current/10 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      <ul className="divide-y divide-current/10 max-h-48 overflow-y-auto">
        {issues.slice(0, 50).map((i, idx) => (
          <li key={idx} className="px-4 py-2 text-xs">
            <span className="font-mono text-[10px] opacity-60">[{i.code}]</span>{" "}
            {i.sheet && <span className="font-semibold">{i.sheet}</span>}
            {i.rowNumber && <span className="opacity-60"> · row {i.rowNumber}</span>}
            {i.boqNo && <span className="opacity-60"> · {i.boqNo}</span>}
            <div className="mt-0.5">{i.message}</div>
          </li>
        ))}
        {issues.length > 50 && (
          <li className="px-4 py-2 text-[10px] opacity-60 italic">
            …and {issues.length - 50} more
          </li>
        )}
      </ul>
    </div>
  );
}
