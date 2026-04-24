"use client";

/**
 * MasterListPage — generic list+CRUD page for simple masters.
 *
 * Drive it with a column config and a FieldConfig list. The component handles
 * fetch, create, edit, archive, empty-state, and the slide-in form panel.
 * Use this for ANY master where the form is "some text inputs, maybe a
 * select, maybe a checkbox". Bespoke forms (Project, Financial Year, Banks)
 * are hand-built.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AddButton,
  EmptyState,
  useConfirm,
  SlidePanel,
  Button,
  Input,
  Select,
  Textarea,
  NumberInput,
  Checkbox,
  Field,
  FormRow,
  FormSection,
  type SelectOption,
} from "@quikit/ui";
import { ArrowLeft, Pencil, Trash2, type LucideIcon } from "lucide-react";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "checkbox";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** For type=select. */
  options?: SelectOption[];
  /** Minimum characters / number minimum. */
  min?: number;
  /** Max length / number max. */
  max?: number;
  /** Transform value on input (e.g. uppercase). */
  transform?: "uppercase" | "lowercase";
  /** Render width — "half" = 2 per row, "full" = whole row, "third" = 3 per row. Defaults to "full". */
  width?: "full" | "half" | "third";
  /** Number-only: force integer input. */
  integerOnly?: boolean;
}

export interface ColumnConfig<Row> {
  key: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
  className?: string;
  width?: number | string;
}

interface MasterListPageProps<Row> {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Fetch endpoint (GET). */
  endpoint: string;
  /** Columns for the table. */
  columns: ColumnConfig<Row>[];
  /** Form field metadata. Drives the slide-in panel's body. */
  fields: FieldConfig[];
  /** Defaults applied when creating a new record. */
  newRecordDefault?: Record<string, unknown>;
  /** Row id accessor. */
  getId: (row: Row) => string;
  /** Display name accessor for confirmation dialogs. */
  getLabel: (row: Row) => string;
}

function rowWidthClass(width?: FieldConfig["width"]) {
  switch (width) {
    case "half":
      return "col-span-1";
    case "third":
      return "col-span-1";
    default:
      return "col-span-full";
  }
}

export function MasterListPage<Row>({
  title,
  subtitle,
  icon: Icon,
  endpoint,
  columns,
  fields,
  newRecordDefault = {},
  getId,
  getLabel,
}: MasterListPageProps<Row>) {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      const j = await res.json();
      if (j.success) setItems(j.data);
    } catch (e) {
      console.error(`[${title}] list failed:`, e);
    } finally {
      setLoading(false);
    }
  }, [endpoint, title]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(row: Row) {
    const ok = await confirm({
      title: `Archive this ${title.toLowerCase().replace(/s$/, "")}?`,
      description: `"${getLabel(row)}" will be moved to trash.`,
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    await fetch(`${endpoint}/${getId(row)}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/masters" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Masters
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        <AddButton
          onClick={() => {
            setEditing(null);
            setPanelOpen(true);
          }}
        >
          Add {title.replace(/s$/, "")}
        </AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={`No ${title.toLowerCase()} yet`}
          message="Add the first record to get started."
          action={{ label: `Add ${title.replace(/s$/, "")}`, onClick: () => { setEditing(null); setPanelOpen(true); } }}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="text-left px-3 py-2" style={c.width ? { width: c.width } : undefined}>
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={getId(row)} className="border-t border-gray-100 hover:bg-gray-50">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 text-gray-700 ${c.className ?? ""}`}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setEditing(row); setPanelOpen(true); }}
                      className="text-gray-400 hover:text-accent-600 p-1"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      className="text-gray-400 hover:text-red-600 p-1"
                      title="Archive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MasterFormPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={title.replace(/s$/, "")}
        endpoint={endpoint}
        editingId={editing ? getId(editing) : null}
        initial={editing ? (editing as unknown as Record<string, unknown>) : newRecordDefault}
        fields={fields}
        onSaved={refresh}
      />
    </div>
  );
}

// ─── Form panel (shared across every MasterListPage) ───────────────────────

interface FormPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  endpoint: string;
  editingId: string | null;
  initial: Record<string, unknown>;
  fields: FieldConfig[];
  onSaved: () => void;
}

function MasterFormPanel({
  open,
  onClose,
  title,
  endpoint,
  editingId,
  initial,
  fields,
  onSaved,
}: FormPanelProps) {
  const [form, setForm] = useState<Record<string, unknown>>({ ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...initial });
      setErr(null);
    }
  }, [open, initial]);

  const isEdit = !!editingId;

  function update(name: string, value: unknown) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const url = isEdit ? `${endpoint}/${editingId}` : endpoint;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Save failed");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  // Group fields by intended row layout. Consecutive half/third fields pack.
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

  const saveDisabled =
    busy ||
    fields.filter((f) => f.required).some((f) => {
      const v = form[f.name];
      return v === null || v === undefined || v === "";
    });

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${title}` : `Add ${title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saveDisabled}>
            {busy ? "Saving…" : isEdit ? "Save" : "Create"}
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
        <FormSection>
          {rows.map((row, i) => (
            <FormRow key={i} cols={row.cols as 1 | 2 | 3}>
              {row.fields.map((f) => (
                <Field key={f.name} label={f.label} required={f.required} hint={f.hint} className={rowWidthClass(f.width)}>
                  {renderControl(f, form[f.name], (v) => update(f.name, v))}
                </Field>
              ))}
            </FormRow>
          ))}
        </FormSection>
      </div>
    </SlidePanel>
  );
}

function renderControl(
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
            else if (f.transform === "lowercase") v = v.toLowerCase();
            set(v || null);
          }}
        />
      );
    case "textarea":
      return (
        <Textarea
          rows={3}
          value={(value as string | null) ?? ""}
          placeholder={f.placeholder}
          onChange={(e) => set(e.target.value || null)}
        />
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
    case "checkbox":
      return (
        <Checkbox
          checked={Boolean(value)}
          onChange={(e) => set(e.target.checked)}
          label={f.placeholder ?? ""}
        />
      );
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _rowWidthClass = rowWidthClass;
