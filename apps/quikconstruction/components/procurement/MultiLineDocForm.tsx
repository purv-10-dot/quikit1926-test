"use client";

/**
 * MultiLineDocForm — generic header+lines slide-in form.
 *
 * Used by every transactional doc (PR, PO, GRN, MI, Returns, Transfer, etc.).
 * Config-driven: pass headerFields + lineColumns + an `onSubmit(body)` that
 * constructs the API payload. Handles:
 *   - header FieldConfig (same shape as MasterListPage)
 *   - repeating line rows (add/remove)
 *   - automatic cascade: each new line starts empty
 *   - running total display if the line config provides `computeTotal(line)`
 *   - server error surfacing
 *
 * Users won't need to build forms from scratch for Phase 3b modules — just
 * describe the field shape and we render it.
 */
import { useEffect, useState } from "react";
import {
  SlidePanel,
  Button,
  Input,
  Select,
  Textarea,
  NumberInput,
  Field,
  FormRow,
  FormSection,
  type SelectOption,
} from "@quikit/ui";
import { Plus, Trash2 } from "lucide-react";
import type { FieldConfig } from "@/components/masters/MasterListPage";

export interface LineColumn {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  width?: number;
  required?: boolean;
  integerOnly?: boolean;
  min?: number;
  max?: number;
  options?: SelectOption[];
  placeholder?: string;
  readOnly?: boolean;
  /** Optional formula computed on every render (e.g. amount = qty * rate). */
  compute?: (line: Record<string, unknown>) => number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  endpoint: string;
  headerFields: FieldConfig[];
  lineColumns: LineColumn[];
  /** Initial header values (for defaulting status etc.). */
  headerDefaults?: Record<string, unknown>;
  /** Initial blank line object (for shape). */
  lineDefault?: Record<string, unknown>;
  /** Transform form state → request body. Default: `{...header, lines}`. */
  buildBody?: (header: Record<string, unknown>, lines: Array<Record<string, unknown>>) => Record<string, unknown>;
  /** Called after a successful save (to refresh parent list). */
  onSaved: () => void;
  /** Label for the add-line button ("Add Item", "Add Vendor", etc.). */
  addLineLabel?: string;
  /** Render a running-total row below the lines if any line has `compute`. */
  showTotal?: boolean;
}

export function MultiLineDocForm({
  open,
  onClose,
  title,
  endpoint,
  headerFields,
  lineColumns,
  headerDefaults = {},
  lineDefault = {},
  buildBody,
  onSaved,
  addLineLabel = "Add Line",
  showTotal = false,
}: Props) {
  const [header, setHeader] = useState<Record<string, unknown>>({ ...headerDefaults });
  const [lines, setLines] = useState<Array<Record<string, unknown>>>([{ ...lineDefault }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHeader({ ...headerDefaults });
      setLines([{ ...lineDefault }]);
      setErr(null);
    }
  }, [open, headerDefaults, lineDefault]);

  function updateHeader(name: string, value: unknown) {
    setHeader((h) => ({ ...h, [name]: value }));
  }
  function updateLine(idx: number, name: string, value: unknown) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [name]: value } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { ...lineDefault }]);
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
  }

  const headerValid = headerFields
    .filter((f) => f.required)
    .every((f) => {
      const v = header[f.name];
      return v !== null && v !== undefined && v !== "";
    });
  const linesValid = lines.every((l) =>
    lineColumns
      .filter((c) => c.required)
      .every((c) => {
        const v = l[c.key];
        return v !== null && v !== undefined && v !== "";
      }),
  );

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = buildBody ? buildBody(header, lines) : { ...header, lines };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const total = showTotal
    ? lines.reduce((sum, l) => {
        const amt = lineColumns.find((c) => c.compute)?.compute?.(l);
        return sum + (amt ?? 0);
      }, 0)
    : 0;

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={`Add ${title}`}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !headerValid || !linesValid}>
            {busy ? "Saving…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {err}
          </div>
        )}

        <FormSection title="Header">
          {renderHeaderRows(headerFields, header, updateHeader)}
        </FormSection>

        <FormSection title="Lines">
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  {lineColumns.map((c) => (
                    <th key={c.key} className="py-2 pr-2 font-semibold" style={c.width ? { width: c.width } : undefined}>
                      {c.label}
                      {c.required && <span className="text-red-500 ml-0.5">*</span>}
                    </th>
                  ))}
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    {lineColumns.map((c) => (
                      <td key={c.key} className="py-1.5 pr-2 align-top">
                        {renderLineCell(c, line, (v) => updateLine(idx, c.key, v))}
                      </td>
                    ))}
                    <td className="py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {showTotal && (
                <tfoot>
                  <tr>
                    <td colSpan={lineColumns.length - 1} className="py-2 pr-2 text-right text-gray-500 font-semibold">
                      Total
                    </td>
                    <td colSpan={2} className="py-2 text-gray-900 font-semibold">
                      ₹{total.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <button
            type="button"
            onClick={addLine}
            className="mt-2 flex items-center gap-1.5 text-xs text-accent-700 hover:text-accent-800 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            {addLineLabel}
          </button>
        </FormSection>
      </div>
    </SlidePanel>
  );
}

// ─── Renderers ─────────────────────────────────────────────────

function renderHeaderRows(
  fields: FieldConfig[],
  values: Record<string, unknown>,
  update: (name: string, value: unknown) => void,
) {
  // Pack same-width consecutive fields into rows
  const rows: Array<{ cols: 1 | 2 | 3; fields: FieldConfig[] }> = [];
  for (const f of fields) {
    const cols = f.width === "half" ? 2 : f.width === "third" ? 3 : 1;
    const last = rows[rows.length - 1];
    if (last && last.cols === cols && cols !== 1 && last.fields.length < cols) {
      last.fields.push(f);
    } else {
      rows.push({ cols, fields: [f] });
    }
  }
  return rows.map((row, i) => (
    <FormRow key={i} cols={row.cols}>
      {row.fields.map((f) => (
        <Field key={f.name} label={f.label} required={f.required} hint={f.hint}>
          {renderHeaderControl(f, values[f.name], (v) => update(f.name, v))}
        </Field>
      ))}
    </FormRow>
  ));
}

function renderHeaderControl(
  f: FieldConfig,
  value: unknown,
  set: (v: unknown) => void,
): React.ReactNode {
  switch (f.type) {
    case "text":
      return (
        <Input
          value={(value as string | null) ?? ""}
          placeholder={f.placeholder}
          maxLength={f.max}
          onChange={(e) => {
            let v: string | null = e.target.value;
            if (f.transform === "uppercase") v = v.toUpperCase();
            set(v || null);
          }}
        />
      );
    case "textarea":
      return (
        <Textarea rows={2} value={(value as string | null) ?? ""} onChange={(e) => set(e.target.value || null)} />
      );
    case "number":
      return (
        <NumberInput
          value={(value as number | null) ?? null}
          min={f.min}
          max={f.max}
          integerOnly={f.integerOnly}
          onChange={(v) => set(v)}
        />
      );
    case "select":
      return (
        <Select
          value={((value as string | null) ?? "").toString()}
          onChange={(e) => set(e.target.value || null)}
          options={f.options ?? []}
          placeholder={f.placeholder}
        />
      );
    default:
      return null;
  }
}

function renderLineCell(
  c: LineColumn,
  line: Record<string, unknown>,
  set: (v: unknown) => void,
): React.ReactNode {
  if (c.compute) {
    const computed = c.compute(line);
    return (
      <span className="block px-2 py-1 text-right text-gray-900 font-medium">
        {computed == null ? "—" : computed.toLocaleString()}
      </span>
    );
  }
  const v = line[c.key];
  switch (c.type) {
    case "text":
      return (
        <Input
          value={(v as string | null) ?? ""}
          placeholder={c.placeholder}
          readOnly={c.readOnly}
          onChange={(e) => set(e.target.value || null)}
          className="text-xs"
        />
      );
    case "number":
      return (
        <NumberInput
          value={(v as number | null) ?? null}
          integerOnly={c.integerOnly}
          min={c.min}
          max={c.max}
          onChange={(val) => set(val)}
          className="text-xs text-right"
        />
      );
    case "select":
      return (
        <Select
          value={((v as string | null) ?? "").toString()}
          onChange={(e) => set(e.target.value || null)}
          options={c.options ?? []}
          placeholder={c.placeholder}
          className="text-xs"
        />
      );
    default:
      return null;
  }
}
