"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { CurrencySelect } from "@/components/shared/CurrencySelect";
import { useNextNumber } from "@/lib/hooks/use-next-number";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type Line = { account_id: string; description: string; contact_id: string; debit: string; credit: string };
type Attachment = { id?: string; file_name: string; content_type?: string | null; size_bytes: number; data?: string };

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const emptyLine = (): Line => ({ account_id: "", description: "", contact_id: "", debit: "", credit: "" });
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const REPORTING = [
  { value: "accrual_and_cash", label: "Accrual and Cash" },
  { value: "accrual_only", label: "Accrual Only" },
  { value: "cash_only", label: "Cash Only" }
];
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function JournalEntryForm({ journalId }: { journalId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency: orgCurrency } = useCurrency();
  const isEdit = Boolean(journalId);

  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const [reverseDate, setReverseDate] = useState("");
  const [reverseOnlyOnDate, setReverseOnlyOnDate] = useState(false);
  const [number, setNumber] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reportingMethod, setReportingMethod] = useState("accrual_and_cash");
  const [currency, setCurrency] = useState(orgCurrency || "INR");
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["je-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({ id: String(r.id), label: `${r.code} · ${r.name}` }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["je-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: departments = [] } = useQuery({ queryKey: ["je-departments"], queryFn: async () => (await fetchList("/api/v1/departments")).map((r) => ({ id: String(r.id), label: r.type === "division" ? `${r.name} (Division)` : String(r.name ?? "") }) as Option) });
  const { data: contacts = [] } = useQuery({
    queryKey: ["je-contacts"],
    queryFn: async () => {
      const [customers, vendors] = await Promise.all([fetchList("/api/v1/customers?per_page=200"), fetchList("/api/v1/vendors?per_page=200")]);
      const seen = new Set<string>();
      const merged: Option[] = [];
      for (const r of [...customers, ...vendors]) {
        const id = String(r.id);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push({ id, label: String(r.display_name ?? "Contact") });
      }
      return merged.sort((a, b) => a.label.localeCompare(b.label));
    }
  });

  const { data: existing } = useQuery({
    queryKey: ["journal", journalId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/journal-entries/${journalId}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setLocationId(existing.location_id ? String(existing.location_id) : "");
    setDepartmentId(existing.department_id ? String(existing.department_id) : "");
    setEntryDate(String(existing.entry_date ?? todayISO()).slice(0, 10));
    setReverseDate(existing.reverse_date ? String(existing.reverse_date).slice(0, 10) : "");
    setReverseOnlyOnDate(Boolean(existing.reverse_only_on_date));
    setNumber(String(existing.entry_number ?? ""));
    setReference(String(existing.reference_number ?? ""));
    setNotes(String(existing.memo ?? ""));
    setReportingMethod(String(existing.reporting_method ?? "accrual_and_cash"));
    setCurrency(String(existing.currency ?? orgCurrency ?? "INR").trim());
    const rows = Array.isArray(existing.lines) ? (existing.lines as Array<Record<string, unknown>>) : [];
    if (rows.length) setLines(rows.map((l) => ({ account_id: String(l.account_id ?? ""), description: String(l.description ?? ""), contact_id: String(l.contact_id ?? ""), debit: Number(l.debit) ? String(l.debit) : "", credit: Number(l.credit) ? String(l.credit) : "" })));
    const atts = Array.isArray(existing.attachments) ? (existing.attachments as Array<Record<string, unknown>>) : [];
    setAttachments(atts.map((a) => ({ id: String(a.id), file_name: String(a.file_name ?? "file"), content_type: a.content_type ? String(a.content_type) : null, size_bytes: Number(a.size_bytes ?? 0) })));
  }, [existing, orgCurrency]);

  // Prefill the next journal number (Zoho-style) for new journals.
  const nextNum = useNextNumber("journal", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  const totals = useMemo(() => {
    const debit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
    const credit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
    return { debit, credit, difference: round2(debit - credit), balanced: debit > 0 && debit === credit };
  }, [lines]);

  const updateLine = (i: number, patch: Partial<Line>) => setLines((c) => c.map((l, p) => (p === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((c) => [...c, emptyLine()]);
  const removeLine = (i: number) => setLines((c) => (c.length <= 2 ? c : c.filter((_, p) => p !== i)));

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (attachments.length >= 5) { toast.error("You can upload a maximum of 5 files."); return; }
      if (file.size > MAX_ATTACHMENT_BYTES) { toast.error(`${file.name} exceeds 10 MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => setAttachments((cur) => [...cur, { file_name: file.name, content_type: file.type || null, size_bytes: file.size, data: String(reader.result) }]);
      reader.readAsDataURL(file);
    });
  };
  const removeAttachment = (i: number) => setAttachments((cur) => cur.filter((_, p) => p !== i));

  const save = async (status: "draft" | "posted") => {
    if (!notes.trim()) { toast.error("Notes are required."); return; }
    const validLines = lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast.error("Add at least two lines with accounts and amounts."); return; }
    if (!totals.balanced) { toast.error("Please ensure that the Debits and Credits are equal."); return; }

    const payload = {
      journal_number: nextNum.numberToSubmit(number),
      entry_date: entryDate,
      reverse_date: reverseDate || null,
      reverse_only_on_date: reverseOnlyOnDate,
      reference_number: reference.trim() || null,
      notes: notes.trim(),
      reporting_method: reportingMethod,
      currency,
      location_id: locationId || null,
      department_id: departmentId || null,
      status,
      lines: validLines.map((l) => ({ account_id: l.account_id, contact_id: l.contact_id || null, description: l.description.trim() || null, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      attachments: attachments.map((a) => ({ id: a.id, file_name: a.file_name, content_type: a.content_type, size_bytes: a.size_bytes, data: a.data }))
    };

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/journal-entries/${journalId}` : "/api/v1/journal-entries", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the journal.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      const id = saved?.data?.id ?? journalId;
      toast.success(isEdit ? "Journal updated." : status === "posted" ? "Journal published." : "Journal saved as draft.");
      qc.invalidateQueries({ queryKey: ["module", "journal-entries"] });
      router.push(id ? `/journal-entries/${id}` : "/journal-entries");
    } finally { setSubmitting(false); }
  };

  const fieldRow = "grid gap-2 md:grid-cols-[150px_1fr] md:items-center";

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Journal" : "New Journal"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/journal-entries" aria-label="Close"><X className="h-4 w-4" /></a></Button>
      </div>

      <Card><CardContent className="space-y-4 pt-6">
        <div className={fieldRow}><Label>Location</Label>
          <div className="max-w-md"><Combobox value={locationId} onChange={setLocationId} placeholder="Select a location" searchPlaceholder="Search locations…" options={warehouses.map((w) => ({ value: w.id, label: w.label }))} /></div>
        </div>
        {departments.length ? (
          <div className={fieldRow}><Label>Department</Label>
            <div className="max-w-md"><Combobox value={departmentId} onChange={setDepartmentId} placeholder="Select a department / division" searchPlaceholder="Search departments…" options={departments.map((d) => ({ value: d.id, label: d.label }))} /></div>
          </div>
        ) : null}
        <div className={fieldRow}><Label className="text-destructive">Date*</Label>
          <Input type="date" className="max-w-md" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>
        <div className={fieldRow}><Label>Reverse Journal Date</Label>
          <div className="max-w-md space-y-2">
            <Input type="date" value={reverseDate} onChange={(e) => setReverseDate(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-sky-600" checked={reverseOnlyOnDate} onChange={(e) => setReverseOnlyOnDate(e.target.checked)} disabled={!reverseDate} />
              Publish reverse journal only on the reverse journal date
            </label>
          </div>
        </div>
        <div className={fieldRow}><Label className="text-destructive">Journal#*</Label>
          <Input className="max-w-md" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto-generated (e.g. JE-00001)" />
        </div>
        <div className={fieldRow}><Label>Reference#</Label>
          <Input className="max-w-md" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className={fieldRow}><Label className="text-destructive">Notes*</Label>
          <Textarea className="max-w-md" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Max. 500 characters" />
        </div>
        <div className={fieldRow}><Label>Reporting Method</Label>
          <div className="flex flex-wrap gap-4 text-sm">
            {REPORTING.map((r) => (
              <label key={r.value} className="flex items-center gap-2">
                <input type="radio" name="reporting-method" className="accent-sky-600" checked={reportingMethod === r.value} onChange={() => setReportingMethod(r.value)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div className={fieldRow}><Label>Currency</Label>
          <div className="max-w-md"><CurrencySelect value={currency} onChange={setCurrency} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-6">
        <div className="hidden gap-2 text-xs font-semibold uppercase text-muted-foreground md:grid md:grid-cols-[1.4fr_1.4fr_1.2fr_120px_120px_40px]">
          <span>Account</span><span>Description</span><span>Contact</span><span className="text-right">Debits</span><span className="text-right">Credits</span><span />
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1.4fr_1.4fr_1.2fr_120px_120px_40px] md:items-start">
            <Combobox value={line.account_id} placeholder="Select an account" searchPlaceholder="Search accounts…" onChange={(val) => updateLine(index, { account_id: val })} options={accounts.map((a) => ({ value: a.id, label: a.label }))} />
            <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
            <Combobox value={line.contact_id} placeholder="Select Contact" searchPlaceholder="Search contacts…" onChange={(val) => updateLine(index, { contact_id: val })} options={contacts.map((c) => ({ value: c.id, label: c.label }))} />
            <Input type="number" min="0" step="0.01" className="text-right" value={line.debit} onChange={(e) => updateLine(index, { debit: e.target.value, credit: "" })} />
            <Input type="number" min="0" step="0.01" className="text-right" value={line.credit} onChange={(e) => updateLine(index, { credit: e.target.value, debit: "" })} />
            <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Add New Row</Button>

        <div className="flex justify-end pt-2">
          <div className="w-full max-w-sm space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{totals.debit.toFixed(2)} &nbsp; {totals.credit.toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{totals.debit.toFixed(2)} &nbsp; {totals.credit.toFixed(2)}</span></div>
            <div className={cn("flex justify-between", totals.difference !== 0 ? "text-destructive" : "text-muted-foreground")}><span>Difference</span><span className="tabular-nums">{totals.difference.toFixed(2)}</span></div>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm font-semibold">Attachments</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
          <Paperclip className="h-4 w-4" /><span>Upload File</span>
          <input type="file" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <p className="text-xs text-muted-foreground">You can upload a maximum of 5 files, 10MB each</p>
        {attachments.length ? (
          <ul className="divide-y rounded-md border">
            {attachments.map((a, i) => (
              <li key={a.id ?? `new-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{a.file_name}</span><span className="shrink-0 text-xs text-muted-foreground">{humanSize(a.size_bytes)}</span></span>
                <Button type="button" variant="ghost" size="sm" aria-label="Remove attachment" onClick={() => removeAttachment(i)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent></Card>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => save("posted")} disabled={submitting}>Save and Publish</Button>
        <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={submitting}>Save as Draft</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/journal-entries")}>Cancel</Button>
      </div>
    </div>
  );
}
