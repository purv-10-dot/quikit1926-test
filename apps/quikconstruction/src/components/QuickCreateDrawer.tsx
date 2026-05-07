"use client";

/**
 * QuickCreateDrawer — Generic transaction create drawer.
 * Used by: Indent, RFQ, PO, GRN, Work Order, DPR, RAB,
 *          Material Issue, Gate Pass, Good Return, Transfer, Reconciliation, Diesel Log.
 *
 * Each entity type has its own field config. The drawer renders dynamically.
 */

import { useState, useEffect, type ReactNode } from "react";
import { X, Plus, Trash2, Loader2, FileText } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";
import { SearchableSelect } from "./SearchableSelect";
import { SelectInput } from "./FormDrawer";
import type { ValidationResult } from "@/lib/validators";

// ─── Field Definition ───────────────────────────────────────────────

type OptionList = Array<{ value: string; label: string }>;

interface FieldDef {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    /** HTML5 datetime-local — renders a native combined date + time
     *  picker. Value is stored as `YYYY-MM-DDTHH:MM` (local time, no
     *  timezone offset). */
    | "datetime-local"
    | "time"
    | "select"
    | "textarea"
    | "checkbox"
    | "file";
  /** Comma-separated accept string for `type: "file"`. */
  accept?: string;
  /** Allow selecting multiple files for `type: "file"`. */
  multiple?: boolean;
  required?: boolean;
  /** Dynamic required-ness based on the current form state. Used for
   *  rules like "E-Way Bill No is required when Approx. Invoice Value
   *  >= 50,000". Takes precedence over `required` when both are set. */
  requiredIf?: (formData: Record<string, string>) => boolean;
  /** Conditionally hide the field (and skip its validation) based on
   *  the current form state. Used for fields that only apply to some
   *  records — e.g. WO Reference on the Material Issue form only makes
   *  sense when Issue Type = Sub-Contractor, so it's hidden for Direct
   *  Consumption / Internal Transfer / Self-Work etc. */
  hiddenIf?: (formData: Record<string, string>) => boolean;
  placeholder?: string;
  /** Options can be a static array or a function that receives the
      current form state — used by the PO drawer to filter Source RFQ
      based on the picked Source Indent, and vice-versa. */
  options?: OptionList | ((formData: Record<string, string>) => OptionList);
  /** Disable the field conditionally — used to lock Source Indent
      once the user has picked a Source RFQ. */
  disabled?: boolean | ((formData: Record<string, string>) => boolean);
  /** For `type: "select"` — swap the native `<select>` for a
   *  combobox with a type-to-filter search box. Use on long lists
   *  like States, Cities, Items, Vendors where scrolling hurts. */
  searchable?: boolean;
  span?: 1 | 2; // grid columns
  defaultValue?: string;
  /** Per-field validator — runs on submit after the required-check.
   *  Return `{ valid: false, error: "message" }` to fail validation. */
  validator?: (value: string) => ValidationResult;
  /** Transform the input value before storing. Useful for uppercase or stripping non-digits. */
  transform?: (raw: string) => string;
  /**
   * Fires after the field's new value is committed. Return either:
   *   - a plain patch of `{ [fieldKey]: value }` to auto-fill OTHER
   *     header fields (e.g. Source PR → Project, Required Date), OR
   *   - `{ fields?, lines? }` to patch header fields AND replace the
   *     line-items grid (e.g. Source PR → copy all material lines
   *     straight into the Indent's Material Lines).
   *
   * `formData` already reflects the new value for this field.
   */
  onChange?: (
    value: string,
    formData: Record<string, string>,
  ) =>
    | Record<string, string>
    | {
        fields?: Record<string, string>;
        lines?: Record<string, string>[];
        /** Replace the secondaryLineItems grid (e.g. PO's single
            Vendor row) when a source-doc selection should pre-fill
            it. Same wholesale-replace semantics as `lines`. */
        secondaryLines?: Record<string, any>[];
      }
    | void;
  /** HTML maxLength. */
  maxLength?: number;
  /** Minimum value for number/date inputs. Can be a function of the
   *  current form state — used to make a "Date To" field's earliest
   *  allowed value follow the value of "Date From". */
  min?: number | string | ((formData: Record<string, string>) => number | string | undefined);
  /** Maximum value for number/date inputs. Can be a function of the
   *  current form state — symmetric to `min` for the upper bound. */
  max?: number | string | ((formData: Record<string, string>) => number | string | undefined);
  /** Step for number inputs (e.g. "0.01"). */
  step?: string;
  /** Small hint rendered under the field. */
  hint?: string;
  /**
   * Optional node rendered below the field (below error/hint). Receives
   * the current field value and full form state so the caller can, for
   * instance, look up the body of a selected dropdown id and show it
   * as an inline preview.
   */
  afterNode?: (
    value: string,
    formData: Record<string, string>,
  ) => ReactNode;
}

interface LineFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "custom";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  width?: string;
  /** Same as the header-field flag — turn `type: "select"` into a
   *  searchable combobox. Use on long picker lists (Items, etc.). */
  searchable?: boolean;
  /**
   * Fires after this cell's new value is committed. Return a patch
   * object to auto-fill OTHER cells in the SAME line — e.g. picking a
   * material on the Indent form populates UOM + Rate from the item
   * master. `line` already reflects the new value for this cell.
   */
  onChange?: (
    value: string,
    line: Record<string, any>,
  ) => Record<string, any> | void;
  /**
   * Custom cell renderer for `type: "custom"`. Use when the field
   * doesn't fit a select/input — e.g. a button that opens a picker
   * modal for per-vendor item assignment on the RFQ drawer. Gets:
   *   - the full row (may carry array values, not just strings),
   *   - an `update(patch)` helper to set fields on THIS row,
   *   - a context with the primary line-items list so the renderer
   *     can, for instance, enumerate which items to show in a picker.
   */
  render?: (
    line: Record<string, any>,
    update: (patch: Record<string, any>) => void,
    ctx: { primaryLines: Record<string, any>[] },
  ) => ReactNode;
}

interface QuickCreateConfig {
  title: string;
  subtitle?: string;
  apiEndpoint: string;
  fields: FieldDef[];
  /**
   * Seed the primary line-items grid with pre-populated rows when the
   * drawer opens. Used by the "Create GRN from PO" flow where the PO's
   * material lines are already known and should flow straight into the
   * GRN form without the user having to pick materials one by one.
   */
  initialLines?: Record<string, any>[];
  lineItems?: {
    label: string;
    fields: LineFieldDef[];
    /** Optional pre-submit validator — runs AFTER the header-field
        validators and BEFORE the POST. Returns `null` when the
        lines are valid, or a user-facing error string that's shown
        as the drawer-level error banner. Used by PO Items to catch
        `poQty > maxQty` before it hits the server. */
    validateBeforeSubmit?: (
      lines: Record<string, any>[],
    ) => string | null;
    /** Override the per-row grid column count (default 4). Used by
        PO Items to fit 8 columns (Material / Location / UOM / Qty /
        Rate / Amount / GST / Net) in a single row without wrapping. */
    gridCols?: number;
    /** When true, renders a column header row above the first line
        using each field's `label`. Useful for grids with many
        columns where the inline labels aren't obvious. */
    showHeader?: boolean;
    /** Hide the "+ Add Line" button entirely. Used by flows like
        GRN where lines are pre-populated from the parent doc and
        the user isn't meant to add more rows ad-hoc. */
    hideAddLine?: boolean;
    /** Optional full-row renderer — when provided, the drawer
        bypasses the default field-grid rendering for each row and
        delegates the whole row to this callback. Used by PO Items
        to get a card-style multi-line layout (Material on top,
        Qty/UOM/Rate/Amount on row 2, Specification on row 3) that
        can't be expressed with the default inline grid. */
    rowRender?: (
      line: Record<string, any>,
      update: (patch: Record<string, any>) => void,
      ctx: {
        index: number;
        total: number;
        remove: () => void;
        /** Current header-level form values — exposed so the row can
            react to parent selections (e.g. Material Issue needs the
            form-level projectId to look up per-location stock). */
        formData: Record<string, string>;
      },
    ) => ReactNode;
    /** Optional node rendered below the line-items grid. Used for
        summary rows (Subtotal / Tax / Freight / Grand Total) or any
        other totals UI that belongs visually with the grid but lives
        outside the rows themselves. Receives the current lines +
        header form state so the consumer can compute totals and
        wire inline inputs (e.g. freight / discount) directly into
        formData. */
    footer?: (ctx: {
      lines: Record<string, any>[];
      formData: Record<string, string>;
      setFormData: (patch: Record<string, string>) => void;
    }) => ReactNode;
  };
  /**
   * Optional second line-items section. Used when the form has two
   * distinct lists — e.g. the RFQ drawer needs Material Lines and
   * Vendors to Send RFQ. Rendered below the primary lineItems and
   * sent to the API under `key` (defaults to `"secondaryLines"`).
   */
  secondaryLineItems?: {
    label: string;
    fields: LineFieldDef[];
    /** Payload key. Defaults to "secondaryLines". */
    key?: string;
    /** Add-row button label. Defaults to "Add Line". */
    addLabel?: string;
    /** Cap on rows. When the row count hits this, the Add button is
        hidden and the Trash icon disappears so the section behaves
        like a single-record card. Useful for PO Vendor (1 vendor per
        PO) that wants the same visual treatment as the multi-row
        RFQ Vendors section. */
    maxRows?: number;
  };
  /**
   * Optional third line-items section. Rendered below the secondary
   * section. Added for the RFQ drawer's "Contacts" list (name +
   * mobile pairs) — kept generic so other forms can reuse it. Sent
   * to the API under `key` (defaults to `"tertiaryLines"`).
   */
  tertiaryLineItems?: {
    label: string;
    fields: LineFieldDef[];
    /** Payload key. Defaults to "tertiaryLines". */
    key?: string;
    /** Add-row button label. Defaults to "Add Line". */
    addLabel?: string;
  };
  /** Called after a successful save. Receives the parsed JSON response
      so callers can read the newly-created entity (e.g. to route to a
      detail page via its id). */
  onSuccess?: (result: any) => void;
}

// ─── Component ──────────────────────────────────────────────────────

export function QuickCreateDrawer({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: QuickCreateConfig;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  // Row values use `any` so custom cells can stash non-string data
  // (e.g. `assignedItemIds: string[]` on an RFQ vendor row).
  const [lines, setLines] = useState<Record<string, any>[]>([{}]);
  const [secondaryLines, setSecondaryLines] = useState<
    Record<string, any>[]
  >([{}]);
  const [tertiaryLines, setTertiaryLines] = useState<
    Record<string, any>[]
  >([{}]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Per-field upload state for `type: "file"` fields. `meta` holds the
  // display info (name / size / type / url) for already-uploaded files
  // so we can render a removable chip per file; the form-data value
  // for the field stays a comma-separated list of URLs so the API
  // sees the same shape as a manual paste.
  type UploadedFile = {
    url: string;
    name: string;
    size: number;
    type: string;
  };
  const [fileUploads, setFileUploads] = useState<
    Record<string, { uploading: boolean; meta: UploadedFile[] }>
  >({});

  useEffect(() => {
    if (open) {
      const defaults: Record<string, string> = {};
      config.fields.forEach(f => { if (f.defaultValue) defaults[f.key] = f.defaultValue; });
      setFormData(defaults);
      setLines(
        Array.isArray(config.initialLines) && config.initialLines.length > 0
          ? config.initialLines.map((l) => ({ ...l }))
          : [{}],
      );
      setSecondaryLines([{}]);
      setTertiaryLines([{}]);
      setError("");
      setFieldErrors({});
      setFileUploads({});
    }
    // Intentionally deps only on `open`. `config` is rebuilt by the
    // parent on every render (new object reference), so including it
    // here makes any parent-side setState (e.g. opening a secondary
    // modal like the RFQ item picker) wipe the user's in-progress
    // form. We only want to reset on the closed→open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const updateLine = (idx: number, key: string, value: string) => {
    setLines(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [key]: value };
      return updated;
    });
  };

  /**
   * Same-line autofill: commit the cell, then run the field's onChange
   * hook and merge its patch into the SAME row. Used e.g. for picking
   * a material on the Indent form to populate UOM + Rate from the item
   * master without the user retyping them.
   */
  /**
   * Factory so both the primary and secondary line-item grids share
   * the same same-line autofill logic. Each grid has its own state
   * setter but identical semantics: commit the cell, run the field's
   * onChange hook, merge any patch back into the same row.
   */
  const makeLinePatcher =
    (setter: typeof setLines) =>
    (idx: number, lf: LineFieldDef, value: string) => {
      setter(prev => {
        const updated = [...prev];
        const nextLine: Record<string, string> = {
          ...(updated[idx] ?? {}),
          [lf.key]: value,
        };
        if (lf.onChange) {
          const patch = lf.onChange(value, nextLine);
          if (patch && Object.keys(patch).length) Object.assign(nextLine, patch);
        }
        updated[idx] = nextLine;
        return updated;
      });
    };
  const patchLineCell = makeLinePatcher(setLines);
  const patchSecondaryLineCell = makeLinePatcher(setSecondaryLines);
  const patchTertiaryLineCell = makeLinePatcher(setTertiaryLines);

  const handleSubmit = async () => {
    setError("");

    // Collect per-field errors (required + per-field validator).
    // Hidden fields skip validation entirely — their stored value (if
    // any) is preserved in formData but the user can't see or edit it,
    // so enforcing required / validator against it would block the
    // form for no reason.
    const errs: Record<string, string> = {};
    for (const field of config.fields) {
      if (typeof field.hiddenIf === "function" && field.hiddenIf(formData)) {
        continue;
      }
      const rawVal = formData[field.key] ?? "";
      const val = rawVal.trim();
      const isRequired =
        field.required ||
        (typeof field.requiredIf === "function" && field.requiredIf(formData));
      if (isRequired && !val) {
        errs[field.key] = `${field.label} is required`;
        continue;
      }
      if (val && field.validator) {
        const res = field.validator(val);
        if (!res.valid) {
          errs[field.key] = res.error ?? `${field.label} is invalid`;
        }
      }
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    // Line-level validator — catches `poQty > maxQty` for PO Items
    // and any other config-specific line rule. Failing this keeps
    // the form open with a visible banner error, so the user sees
    // what's wrong instead of hitting the server round-trip.
    if (config.lineItems?.validateBeforeSubmit) {
      const lineErr = config.lineItems.validateBeforeSubmit(lines);
      if (lineErr) {
        setError(lineErr);
        return;
      }
    }

    if (!config.apiEndpoint || config.apiEndpoint.includes("//")) {
      setError("Invalid configuration. Please select required fields first.");
      return;
    }

    setSaving(true);
    try {
      const payload: any = { ...formData };
      if (config.lineItems) {
        payload.lines = lines.filter(l => Object.values(l).some(v => v));
        payload.lineCount = payload.lines.length;
      }
      if (config.secondaryLineItems) {
        const key = config.secondaryLineItems.key ?? "secondaryLines";
        payload[key] = secondaryLines.filter(l =>
          Object.values(l).some(v => v),
        );
      }
      if (config.tertiaryLineItems) {
        const key = config.tertiaryLineItems.key ?? "tertiaryLines";
        payload[key] = tertiaryLines.filter(l =>
          Object.values(l).some(v => v),
        );
      }

      console.log("[QuickCreateDrawer] POST", config.apiEndpoint, payload);

      const res = await fetch(config.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = JSON.parse(errBody).error ?? errMsg; } catch {}
        throw new Error(errMsg);
      }

      const result = await res.json().catch(() => null);
      console.log("[QuickCreateDrawer] Success:", result);

      config.onSuccess?.(result);
      onClose();
    } catch (err: any) {
      console.error("[QuickCreateDrawer] Error:", err);
      setError(err.message ?? "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{config.title}</h2>
            {config.subtitle && <p className="text-xs text-gray-500 mt-0.5">{config.subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Header Fields */}
          <div className="grid grid-cols-2 gap-4">
            {config.fields.map(field => {
              // Hidden by condition on the current form state — skip
              // the render entirely so the grid collapses around it.
              if (
                typeof field.hiddenIf === "function" &&
                field.hiddenIf(formData)
              ) {
                return null;
              }
              const fieldError = fieldErrors[field.key];
              const baseCls = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2";
              const stateCls = fieldError
                ? "border-red-400 bg-red-50 focus:ring-red-500"
                : "border-gray-300 focus:ring-orange-500";
              const onChangeValue = (raw: string) => {
                const v = field.transform ? field.transform(raw) : raw;
                set(field.key, v);
                // Run the field-level derivation hook (if any). The hook
                // can return a plain field-patch OR a { fields, lines }
                // shape — the second form lets a field like "Source PR
                // Ref" also overwrite the Material Lines grid.
                if (field.onChange) {
                  const next = { ...formData, [field.key]: v };
                  const result = field.onChange(v, next);
                  if (result) {
                    const isStructured =
                      "fields" in result ||
                      "lines" in result ||
                      "secondaryLines" in result;
                    const fieldPatch: Record<string, string> = isStructured
                      ? ((result as any).fields ?? {})
                      : (result as Record<string, string>);
                    const linePatch = isStructured
                      ? (result as any).lines
                      : undefined;
                    const secondaryPatch = isStructured
                      ? (result as any).secondaryLines
                      : undefined;

                    if (Object.keys(fieldPatch).length) {
                      setFormData((prev) => ({ ...prev, [field.key]: v, ...fieldPatch }));
                      setFieldErrors((prev) => {
                        const out = { ...prev };
                        for (const k of Object.keys(fieldPatch)) delete out[k];
                        return out;
                      });
                    }
                    if (Array.isArray(linePatch)) {
                      // Replace the grid wholesale. If the source returned
                      // no lines, keep one empty row so the user can still
                      // add rows manually.
                      setLines(linePatch.length > 0 ? linePatch : [{}]);
                    }
                    if (Array.isArray(secondaryPatch)) {
                      // Same wholesale-replace for the secondary section
                      // (used by PO when a source RFQ pre-fills the
                      // Vendor + email row).
                      setSecondaryLines(
                        secondaryPatch.length > 0 ? secondaryPatch : [{}],
                      );
                    }
                  }
                }
              };
              // Checkboxes get a custom layout — label sits to the
              // right of the box rather than above it, so the
              // standard `<label>` + grid cell wrapper would look
              // wrong. Render and short-circuit before the rest of
              // the field switch.
              if (field.type === "checkbox") {
                const checked = (formData[field.key] ?? "") === "true";
                return (
                  <div
                    key={field.key}
                    className={field.span === 2 ? "col-span-2" : ""}
                  >
                    <label className="inline-flex items-start gap-2 cursor-pointer px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 w-full">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          onChangeValue(e.target.checked ? "true" : "")
                        }
                        className="mt-0.5 w-4 h-4 accent-orange-500"
                      />
                      <span className="text-sm text-gray-700">
                        {field.label}
                        {field.hint && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {field.hint}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                );
              }
              // Resolve dynamic options + disabled once per render —
              // `options` can be a static array or a function that
              // filters based on current form state (PO: Source RFQ
              // scoped to the selected Source Indent).
              const resolvedOptions: OptionList = Array.isArray(field.options)
                ? field.options
                : typeof field.options === "function"
                  ? field.options(formData)
                  : [];
              const isDisabled =
                typeof field.disabled === "function"
                  ? field.disabled(formData)
                  : Boolean(field.disabled);
              const disabledCls = isDisabled
                ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                : "";
              const showAsRequired =
                field.required ||
                (typeof field.requiredIf === "function" &&
                  field.requiredIf(formData));
              return (
                <div key={field.key} className={field.span === 2 ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {field.label} {showAsRequired && <span className="text-red-500">*</span>}
                  </label>
                  {field.type === "select" && field.searchable ? (
                    <SearchableSelect
                      value={formData[field.key] ?? ""}
                      onChange={(v) => onChangeValue(v)}
                      options={resolvedOptions}
                      placeholder={field.placeholder ?? "Select..."}
                      disabled={isDisabled}
                    />
                  ) : field.type === "select" ? (
                    <SelectInput
                      value={formData[field.key] ?? ""}
                      onChange={(v) => onChangeValue(v)}
                      disabled={isDisabled}
                      invalid={!!fieldError}
                      placeholder={field.placeholder ?? "Select..."}
                      options={resolvedOptions}
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={formData[field.key] ?? ""}
                      onChange={e => onChangeValue(e.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      rows={3}
                      disabled={isDisabled}
                      className={`${baseCls} resize-none ${stateCls} ${disabledCls}`}
                    />
                  ) : field.type === "file" ? (
                    (() => {
                      const fieldState = fileUploads[field.key] ?? {
                        uploading: false,
                        meta: [] as UploadedFile[],
                      };
                      const uploaded = fieldState.meta;
                      const uploading = fieldState.uploading;
                      const handlePick = async (
                        e: React.ChangeEvent<HTMLInputElement>,
                      ) => {
                        const picked = Array.from(e.target.files ?? []);
                        // Reset the native input so the user can re-pick
                        // the same filename later (e.g. after removing).
                        e.target.value = "";
                        if (picked.length === 0) return;
                        setFileUploads((prev) => ({
                          ...prev,
                          [field.key]: {
                            uploading: true,
                            meta: prev[field.key]?.meta ?? [],
                          },
                        }));
                        try {
                          const fd = new FormData();
                          for (const f of picked) fd.append("files", f);
                          const res = await fetch("/api/uploads", {
                            method: "POST",
                            body: fd,
                          });
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            throw new Error(
                              json?.error ??
                                `Upload failed (HTTP ${res.status})`,
                            );
                          }
                          const newMeta: UploadedFile[] = Array.isArray(
                            json?.files,
                          )
                            ? json.files
                            : [];
                          // Append for `multiple`, replace for single-file
                          // fields so the picker reads "swap, not append".
                          const nextMeta = field.multiple
                            ? [...uploaded, ...newMeta]
                            : newMeta;
                          setFileUploads((prev) => ({
                            ...prev,
                            [field.key]: { uploading: false, meta: nextMeta },
                          }));
                          onChangeValue(nextMeta.map((m) => m.url).join(","));
                        } catch (err: any) {
                          setFileUploads((prev) => ({
                            ...prev,
                            [field.key]: {
                              uploading: false,
                              meta: prev[field.key]?.meta ?? [],
                            },
                          }));
                          setFieldErrors((prev) => ({
                            ...prev,
                            [field.key]: err?.message ?? "Upload failed",
                          }));
                        }
                      };
                      const removeAt = (idx: number) => {
                        const nextMeta = uploaded.filter((_, i) => i !== idx);
                        setFileUploads((prev) => ({
                          ...prev,
                          [field.key]: { uploading: false, meta: nextMeta },
                        }));
                        onChangeValue(nextMeta.map((m) => m.url).join(","));
                      };
                      return (
                        <div className="space-y-2">
                          <label
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${
                              isDisabled || uploading
                                ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                                : "border-gray-300 hover:border-orange-400 hover:bg-orange-50/30 cursor-pointer"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium shrink-0">
                              {uploading ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Uploading…
                                </>
                              ) : uploaded.length > 0 && !field.multiple ? (
                                "Replace file"
                              ) : (
                                "Choose files"
                              )}
                            </span>
                            <span className="text-xs text-gray-500 truncate">
                              {uploaded.length === 0
                                ? "No file chosen"
                                : `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} attached`}
                            </span>
                            <input
                              type="file"
                              accept={field.accept}
                              multiple={field.multiple}
                              disabled={isDisabled || uploading}
                              onChange={handlePick}
                              className="hidden"
                            />
                          </label>
                          {uploaded.length > 0 && (
                            <ul className="space-y-1.5">
                              {uploaded.map((f, idx) => {
                                const isImg = (f.type || "").startsWith(
                                  "image/",
                                );
                                return (
                                  <li
                                    key={`${f.url}-${idx}`}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50"
                                  >
                                    {isImg ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={f.url}
                                        alt={f.name}
                                        className="w-8 h-8 object-cover rounded border border-gray-200 shrink-0"
                                      />
                                    ) : (
                                      <span className="w-8 h-8 rounded border border-gray-200 bg-white flex items-center justify-center text-gray-400 shrink-0">
                                        <FileText className="w-3.5 h-3.5" />
                                      </span>
                                    )}
                                    <a
                                      href={f.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 min-w-0 text-xs text-gray-700 hover:text-orange-600 truncate"
                                      title={f.name}
                                    >
                                      {f.name}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => removeAt(idx)}
                                      className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                                      aria-label={`Remove ${f.name}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })()
                  ) : (() => {
                    const resolvedMin = typeof field.min === "function"
                      ? field.min(formData)
                      : field.min;
                    const resolvedMax = typeof field.max === "function"
                      ? field.max(formData)
                      : field.max;
                    return (
                      <input
                        type={field.type}
                        value={formData[field.key] ?? ""}
                        onChange={e => onChangeValue(e.target.value)}
                        placeholder={field.placeholder}
                        maxLength={field.maxLength}
                        min={resolvedMin as any}
                        max={resolvedMax as any}
                        step={field.step}
                        disabled={isDisabled}
                        className={`${baseCls} ${stateCls} ${disabledCls}`}
                      />
                    );
                  })()}
                  {fieldError ? (
                    <p className="text-xs text-red-500 mt-1">{fieldError}</p>
                  ) : field.hint ? (
                    <p className="text-xs text-gray-400 mt-1">{field.hint}</p>
                  ) : null}
                  {field.afterNode?.(formData[field.key] ?? "", formData)}
                </div>
              );
            })}
          </div>

          {/* Line Items */}
          {config.lineItems && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{config.lineItems.label}</h3>
                {!config.lineItems.hideAddLine && (
                  <button
                    onClick={() => setLines(prev => [...prev, {}])}
                    className="text-xs text-orange-600 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Line
                  </button>
                )}
              </div>
              {config.lineItems.showHeader && (
                <div className="flex items-center gap-2 px-3 pb-2">
                  {/* Spacer to align with the numbered prefix on rows */}
                  <span className="w-4 shrink-0" />
                  <div
                    className="flex-1 grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${
                        config.lineItems?.gridCols ?? 4
                      }, minmax(0, 1fr))`,
                    }}
                  >
                    {config.lineItems.fields.map((lf) => (
                      <div
                        key={lf.key}
                        className={`text-[10px] font-bold uppercase tracking-wider text-gray-500 ${
                          lf.width === "wide" ? "col-span-2" : ""
                        }`}
                      >
                        {lf.label}
                      </div>
                    ))}
                  </div>
                  {/* Trash column spacer */}
                  <span className="w-[22px] shrink-0" />
                </div>
              )}
              {lines.map((line, i) => {
                // Card-style escape hatch — when a config provides
                // `rowRender`, the drawer delegates the whole row
                // to it (PO Items uses this to produce a labeled
                // multi-line card instead of the default grid).
                if (config.lineItems?.rowRender) {
                  return (
                    <div
                      key={i}
                      className="border border-gray-200 rounded-xl p-4 mb-3 bg-white"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-[10px] font-bold text-gray-400 w-4 pt-1 shrink-0">
                          {i + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          {config.lineItems.rowRender(
                            line,
                            (patch) =>
                              setLines((prev) => {
                                const next = [...prev];
                                next[i] = { ...(next[i] ?? {}), ...patch };
                                return next;
                              }),
                            {
                              index: i,
                              total: lines.length,
                              remove: () =>
                                setLines((prev) =>
                                  prev.filter((_, j) => j !== i),
                                ),
                              formData,
                            },
                          )}
                        </div>
                        {lines.length > 1 && (
                          <button
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                            className="p-1 text-gray-300 hover:text-red-500 shrink-0 pt-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">{i + 1}.</span>
                    <div
                      className="flex-1 grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${
                          config.lineItems?.gridCols ?? 4
                        }, minmax(0, 1fr))`,
                      }}
                    >
                      {config.lineItems!.fields.map(lf => (
                        <div key={lf.key} className={lf.width === "wide" ? "col-span-2" : ""}>
                          {lf.type === "custom" && lf.render ? (
                            lf.render(
                              line,
                              (patch) =>
                                setLines((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...(next[i] ?? {}), ...patch };
                                  return next;
                                }),
                              { primaryLines: lines },
                            )
                          ) : lf.type === "select" && lf.searchable ? (
                            <SearchableSelect
                              size="sm"
                              value={line[lf.key] ?? ""}
                              onChange={(v) => patchLineCell(i, lf, v)}
                              options={lf.options ?? []}
                              placeholder={lf.placeholder ?? lf.label}
                            />
                          ) : lf.type === "select" ? (
                            <SelectInput
                              value={line[lf.key] ?? ""}
                              onChange={(v) => patchLineCell(i, lf, v)}
                              placeholder={lf.placeholder ?? lf.label}
                              options={lf.options ?? []}
                            />
                          ) : (
                            <input
                              type={lf.type}
                              value={line[lf.key] ?? ""}
                              onChange={e => patchLineCell(i, lf, e.target.value)}
                              placeholder={lf.placeholder ?? lf.label}
                              className="w-full px-2 py-1.5 rounded border border-gray-300 text-xs"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {lines.length > 1 && (
                      <button onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                        className="p-1 text-gray-300 hover:text-red-500 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
              {config.lineItems.footer?.({
                lines,
                formData,
                setFormData: (patch) => setFormData((prev) => ({ ...prev, ...patch })),
              })}
            </div>
          )}

          {/* Secondary Line Items (e.g. RFQ's "Vendors to Send RFQ") */}
          {config.secondaryLineItems && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {config.secondaryLineItems.label}
                </h3>
                {!(
                  config.secondaryLineItems.maxRows !== undefined &&
                  secondaryLines.length >= config.secondaryLineItems.maxRows
                ) && (
                  <button
                    onClick={() => setSecondaryLines(prev => [...prev, {}])}
                    className="text-xs text-orange-600 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />{" "}
                    {config.secondaryLineItems.addLabel ?? "Add Line"}
                  </button>
                )}
              </div>
              {secondaryLines.map((line, i) => (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                      {i + 1}.
                    </span>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      {config.secondaryLineItems!.fields.map((lf) => (
                        <div
                          key={lf.key}
                          className={lf.width === "wide" ? "col-span-2" : ""}
                        >
                          {lf.type === "custom" && lf.render ? (
                            lf.render(
                              line,
                              (patch) =>
                                setSecondaryLines((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...(next[i] ?? {}), ...patch };
                                  return next;
                                }),
                              { primaryLines: lines },
                            )
                          ) : lf.type === "select" && lf.searchable ? (
                            <SearchableSelect
                              size="sm"
                              value={line[lf.key] ?? ""}
                              onChange={(v) =>
                                patchSecondaryLineCell(i, lf, v)
                              }
                              options={lf.options ?? []}
                              placeholder={lf.placeholder ?? lf.label}
                            />
                          ) : lf.type === "select" ? (
                            <SelectInput
                              value={line[lf.key] ?? ""}
                              onChange={(v) =>
                                patchSecondaryLineCell(i, lf, v)
                              }
                              placeholder={lf.placeholder ?? lf.label}
                              options={lf.options ?? []}
                            />
                          ) : (
                            <input
                              type={lf.type}
                              value={line[lf.key] ?? ""}
                              onChange={(e) =>
                                patchSecondaryLineCell(i, lf, e.target.value)
                              }
                              placeholder={lf.placeholder ?? lf.label}
                              className="w-full px-2 py-1.5 rounded border border-gray-300 text-xs"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {secondaryLines.length > 1 && (
                      <button
                        onClick={() =>
                          setSecondaryLines(prev =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
                        className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tertiary Line Items (e.g. RFQ's "Contacts" — multiple name+mobile pairs) */}
          {config.tertiaryLineItems && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {config.tertiaryLineItems.label}
                </h3>
                <button
                  onClick={() => setTertiaryLines(prev => [...prev, {}])}
                  className="text-xs text-orange-600 font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />{" "}
                  {config.tertiaryLineItems.addLabel ?? "Add Line"}
                </button>
              </div>
              {tertiaryLines.map((line, i) => (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                      {i + 1}.
                    </span>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      {config.tertiaryLineItems!.fields.map((lf) => (
                        <div
                          key={lf.key}
                          className={lf.width === "wide" ? "col-span-2" : ""}
                        >
                          {lf.type === "custom" && lf.render ? (
                            lf.render(
                              line,
                              (patch) =>
                                setTertiaryLines((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...(next[i] ?? {}), ...patch };
                                  return next;
                                }),
                              { primaryLines: lines },
                            )
                          ) : lf.type === "select" && lf.searchable ? (
                            <SearchableSelect
                              size="sm"
                              value={line[lf.key] ?? ""}
                              onChange={(v) =>
                                patchTertiaryLineCell(i, lf, v)
                              }
                              options={lf.options ?? []}
                              placeholder={lf.placeholder ?? lf.label}
                            />
                          ) : lf.type === "select" ? (
                            <SelectInput
                              value={line[lf.key] ?? ""}
                              onChange={(v) =>
                                patchTertiaryLineCell(i, lf, v)
                              }
                              placeholder={lf.placeholder ?? lf.label}
                              options={lf.options ?? []}
                            />
                          ) : (
                            <input
                              type={lf.type}
                              value={line[lf.key] ?? ""}
                              onChange={(e) =>
                                patchTertiaryLineCell(i, lf, e.target.value)
                              }
                              placeholder={lf.placeholder ?? lf.label}
                              className="w-full px-2 py-1.5 rounded border border-gray-300 text-xs"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {tertiaryLines.length > 1 && (
                      <button
                        onClick={() =>
                          setTertiaryLines(prev =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
                        className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3 shrink-0 bg-gray-50">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Create"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ─── Export CSV Utility ─────────────────────────────────────────────

export function exportCSV(data: any[], filename: string) {
  if (!data.length) { alert("No data to export"); return; }
  const keys = Object.keys(data[0]).filter(k => !["tenantId", "orgId", "createdBy", "updatedBy"].includes(k));
  const header = keys.join(",");
  const rows = data.map(row => keys.map(k => {
    const val = String(row[k] ?? "").replace(/"/g, '""');
    return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val}"` : val;
  }).join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
