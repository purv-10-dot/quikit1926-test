"use client";

/**
 * BOQ Excel/CSV import — two-step: upload → preview → commit.
 * Expected columns: Code, Description, Kind (item|group), UOM, Quantity,
 * Rate, GST, Group. Rows with errors are highlighted; user confirms before
 * committing. Server validates UOM codes exist in Masters → UOM.
 */
import { useEffect, useRef, useState } from "react";
import {
  SlidePanel, Button, Input, Select, Field, FormRow, FormSection,
} from "@quikit/ui";
import { Upload } from "lucide-react";

interface PreviewRow {
  rowIndex: number;
  kind: "item" | "group";
  code: string | null;
  description: string;
  uomCode: string | null;
  group: string | null;
  quantity: number | null;
  rate: number | null;
  gstRate: number | null;
  errors: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function BoqImportPanel({ open, onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [header, setHeader] = useState({
    boqNumber: `BOQ-${Date.now().toString().slice(-6)}`,
    projectId: "",
    boqDate: new Date().toISOString().slice(0, 10),
    currency: "INR",
  });
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; valid: number; invalid: number; items: number; groups: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader((h) => ({ ...h, boqNumber: `BOQ-${Date.now().toString().slice(-6)}`, boqDate: new Date().toISOString().slice(0, 10) }));
    setPreview(null); setSummary(null); setErr(null);
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
  }, [open]);

  async function uploadAndPreview() {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr("Pick an .xlsx or .csv file first"); return; }
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.set("file", f);
      const res = await fetch("/api/projects/boq/import-preview", { method: "POST", body: form });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Preview failed");
      setPreview(j.rows); setSummary(j.summary);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    if (summary && summary.invalid > 0) { setErr(`Fix ${summary.invalid} invalid row(s) first`); return; }
    if (!header.projectId) { setErr("Pick a project"); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/projects/boq/import-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...header,
          rows: preview.map(({ rowIndex, errors, ...row }) => row),
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Commit failed");
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Commit failed");
    } finally { setBusy(false); }
  }

  return (
    <SlidePanel open={open} onClose={onClose} title="Import BOQ from Spreadsheet" size="xl"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        {preview ? (
          <Button onClick={commit} disabled={busy || !summary || summary.invalid > 0 || !header.projectId}>
            {busy ? "Committing…" : `Commit (${summary?.valid ?? 0} rows)`}
          </Button>
        ) : (
          <Button onClick={uploadAndPreview} disabled={busy}>
            {busy ? "Uploading…" : "Upload & Preview"}
          </Button>
        )}
      </>}>
      <div className="space-y-5">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

        <FormSection title="Step 1 — Upload">
          <div className="text-xs text-gray-600 mb-2">
            Expected columns: <code className="bg-gray-100 px-1 rounded">Code, Description, Kind (item|group), UOM, Quantity, Rate, GST, Group</code>.
            UOM codes must exist in Masters → UOM.
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
            className="block w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-accent-100 file:text-accent-700 file:font-semibold hover:file:bg-accent-200" />
        </FormSection>

        {preview && summary && (
          <>
            <FormSection title={`Step 2 — Preview (${summary.total} rows: ${summary.valid} valid, ${summary.invalid} invalid)`}>
              <div className="max-h-80 overflow-auto rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-accent-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Row</th>
                      <th className="px-2 py-1.5 text-left">Kind</th>
                      <th className="px-2 py-1.5 text-left">Description</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-left">UOM</th>
                      <th className="px-2 py-1.5 text-right">Rate</th>
                      <th className="px-2 py-1.5 text-left">Group</th>
                      <th className="px-2 py-1.5 text-left">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(r => (
                      <tr key={r.rowIndex} className={`border-t border-gray-100 ${r.errors.length > 0 ? "bg-red-50" : ""}`}>
                        <td className="px-2 py-1 text-gray-400">{r.rowIndex}</td>
                        <td className="px-2 py-1">{r.kind}</td>
                        <td className="px-2 py-1">{r.description}</td>
                        <td className="px-2 py-1 text-right">{r.quantity ?? "—"}</td>
                        <td className="px-2 py-1">{r.uomCode ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{r.rate ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-500">{r.group ?? "—"}</td>
                        <td className="px-2 py-1 text-red-700">{r.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormSection>

            <FormSection title="Step 3 — Target BOQ">
              <FormRow cols={2}>
                <Field label="BOQ #" required><Input value={header.boqNumber} onChange={(e) => setHeader({ ...header, boqNumber: e.target.value.toUpperCase() })} /></Field>
                <Field label="Date" required><Input value={header.boqDate} onChange={(e) => setHeader({ ...header, boqDate: e.target.value })} /></Field>
              </FormRow>
              <FormRow cols={2}>
                <Field label="Project" required>
                  <Select value={header.projectId} onChange={(e) => setHeader({ ...header, projectId: e.target.value })}
                    options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— select —" />
                </Field>
                <Field label="Currency"><Input value={header.currency} onChange={(e) => setHeader({ ...header, currency: e.target.value.toUpperCase() })} /></Field>
              </FormRow>
            </FormSection>
          </>
        )}
      </div>
    </SlidePanel>
  );
}
