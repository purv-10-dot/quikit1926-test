"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Settings2, PanelTop, FileText, Table as TableIcon, Calculator, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { type TemplateConfig, type ColumnKey } from "@/lib/pdf-templates/config";
import { sampleDocument } from "@/lib/pdf-templates/document";
import { TemplatePreview } from "./TemplatePreview";

type EditorTemplate = { id: string; name: string; config: TemplateConfig };

const TABS = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "header", label: "Header & Footer", icon: PanelTop },
  { key: "details", label: "Transaction Details", icon: FileText },
  { key: "table", label: "Table", icon: TableIcon },
  { key: "total", label: "Total", icon: Calculator },
  { key: "other", label: "Other Details", icon: StickyNote }
] as const;

export function PdfTemplateEditor({ template, onClose, onSaved }: { template: EditorTemplate; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template.name);
  const [config, setConfig] = useState<TemplateConfig>(template.config);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("general");
  const [busy, setBusy] = useState(false);

  const up = (partial: Partial<TemplateConfig>) => setConfig((c) => ({ ...c, ...partial }));
  const upField = (k: keyof TemplateConfig["fields"], v: boolean) => setConfig((c) => ({ ...c, fields: { ...c.fields, [k]: v } }));
  const upMargin = (k: keyof TemplateConfig["margins"], v: number) => setConfig((c) => ({ ...c, margins: { ...c.margins, [k]: v } }));
  const upColumn = (key: ColumnKey, patch: Partial<TemplateConfig["columns"][number]>) =>
    setConfig((c) => ({ ...c, columns: c.columns.map((col) => (col.key === key ? { ...col, ...patch } : col)) }));

  const save = async () => {
    if (!name.trim()) { toast.error("Enter a template name."); return; }
    setBusy(true);
    try {
      const r1 = await fetch(`/api/v1/settings/pdf-templates/${template.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), config }) });
      if (!r1.ok) { const b = await r1.json().catch(() => null); toast.error(b?.error?.message ?? "Could not save the template."); return; }
      toast.success("Template saved.");
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <h2 className="text-[15px] font-semibold">Edit Template</h2>
        <div className="flex items-center gap-2">
          <a href={`/api/v1/settings/pdf-templates/${template.id}/preview`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">Preview PDF</Button>
          </a>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tab rail */}
        <div className="flex w-[88px] flex-col border-r bg-card py-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={cn("flex flex-col items-center gap-1 px-1 py-3 text-[10px] leading-tight", tab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50")}>
                <Icon className="h-4 w-4" /><span className="text-center">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="w-[340px] shrink-0 overflow-y-auto border-r p-4">
          {tab === "general" ? (
            <div className="space-y-4">
              <Field label="Template Name*"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Paper Size"><Segmented options={["A5", "A4", "Letter"]} value={config.paperSize} onChange={(v) => up({ paperSize: v as TemplateConfig["paperSize"] })} /></Field>
              <Field label="Orientation"><Segmented options={["portrait", "landscape"]} value={config.orientation} onChange={(v) => up({ orientation: v as TemplateConfig["orientation"] })} /></Field>
              <Field label="Layout"><Segmented options={["standard", "spreadsheet"]} value={config.layout} onChange={(v) => up({ layout: v as TemplateConfig["layout"] })} /></Field>
              <div>
                <Label className="mb-1.5 block">Margins (inches)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(["top", "bottom", "left", "right"] as const).map((k) => (
                    <div key={k}><span className="text-[10px] capitalize text-muted-foreground">{k}</span><Input type="number" step="0.05" className="h-8" value={config.margins[k]} onChange={(e) => upMargin(k, Number(e.target.value))} /></div>
                  ))}
                </div>
              </div>
              <Field label="Accent Color"><ColorInput value={config.accentColor} onChange={(v) => up({ accentColor: v })} /></Field>
            </div>
          ) : null}

          {tab === "header" ? (
            <div className="space-y-3">
              <Toggle label="Show Organization Name" checked={config.showOrgName} onChange={(v) => up({ showOrgName: v })} />
              <Toggle label="Show Organization Address" checked={config.showOrgAddress} onChange={(v) => up({ showOrgAddress: v })} />
              <Field label="Header Background"><ColorInput value={config.headerBg} onChange={(v) => up({ headerBg: v })} /></Field>
              <Field label="Footer Text"><Input value={config.footerText} onChange={(e) => up({ footerText: e.target.value })} placeholder="e.g. Thank you for your business" /></Field>
            </div>
          ) : null}

          {tab === "details" ? (
            <div className="space-y-3">
              <Toggle label="Show Document Title" checked={config.showDocumentTitle} onChange={(v) => up({ showDocumentTitle: v })} />
              <Field label="Document Title"><Input value={config.documentTitle} onChange={(e) => up({ documentTitle: e.target.value })} /></Field>
              <Field label="Title Font Size"><Input type="number" className="h-8 w-24" value={config.titleFontSize} onChange={(e) => up({ titleFontSize: Number(e.target.value) })} /></Field>
              <Field label="Title Color"><ColorInput value={config.titleColor} onChange={(v) => up({ titleColor: v })} /></Field>
              <div className="pt-1">
                <Label className="mb-1.5 block">Document Information</Label>
                <div className="space-y-2">
                  {([["number", "Number Field"], ["date", "Date Field"], ["terms", "Terms"], ["dueDate", "Due Date"], ["reference", "Reference Field"], ["subject", "Subject"]] as const).map(([k, lbl]) => (
                    <Toggle key={k} label={lbl} checked={config.fields[k]} onChange={(v) => upField(k, v)} />
                  ))}
                </div>
              </div>
              <div className="pt-1 space-y-2">
                <Toggle label="Show Bill To" checked={config.showBillTo} onChange={(v) => up({ showBillTo: v })} />
                <Toggle label="Show Ship To" checked={config.showShipTo} onChange={(v) => up({ showShipTo: v })} />
              </div>
            </div>
          ) : null}

          {tab === "table" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_56px] gap-2 pb-1 text-[10px] uppercase text-muted-foreground"><span>Field / Label</span><span className="text-right">Width %</span></div>
              {config.columns.map((col) => (
                <div key={col.key} className="rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={col.show} onChange={(e) => upColumn(col.key, { show: e.target.checked })} className="h-4 w-4" />
                    <Input className="h-7 flex-1 text-xs" value={col.label} onChange={(e) => upColumn(col.key, { label: e.target.value })} />
                    <Input type="number" className="h-7 w-14 text-right text-xs" value={col.width} onChange={(e) => upColumn(col.key, { width: Number(e.target.value) })} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "total" ? (
            <div className="space-y-3">
              <Toggle label="Sub Total" checked={config.showSubTotal} onChange={(v) => up({ showSubTotal: v })} />
              <Toggle label="Discount" checked={config.showDiscount} onChange={(v) => up({ showDiscount: v })} />
              <Toggle label="Shipping Charges" checked={config.showShipping} onChange={(v) => up({ showShipping: v })} />
              <Toggle label="Show Tax Details" checked={config.showTaxDetails} onChange={(v) => up({ showTaxDetails: v })} />
              <Toggle label="Show Amount in Words" checked={config.showAmountInWords} onChange={(v) => up({ showAmountInWords: v })} />
              <Field label="Currency Symbol"><Segmented options={["before", "after"]} value={config.currencyPosition} onChange={(v) => up({ currencyPosition: v as TemplateConfig["currencyPosition"] })} /></Field>
            </div>
          ) : null}

          {tab === "other" ? (
            <div className="space-y-3">
              <Toggle label="Show Notes" checked={config.showNotes} onChange={(v) => up({ showNotes: v })} />
              <Field label="Notes Label"><Input value={config.notesLabel} onChange={(e) => up({ notesLabel: e.target.value })} /></Field>
              <Toggle label="Show Terms & Conditions" checked={config.showTerms} onChange={(v) => up({ showTerms: v })} />
              <Field label="Terms Label"><Input value={config.termsLabel} onChange={(e) => up({ termsLabel: e.target.value })} /></Field>
              <Toggle label="Show Signature" checked={config.showSignature} onChange={(v) => up({ showSignature: v })} />
              <Field label="Signature Label"><Input value={config.signatureLabel} onChange={(e) => up({ signatureLabel: e.target.value })} /></Field>
            </div>
          ) : null}
        </div>

        {/* Live preview */}
        <div className="min-w-0 flex-1 overflow-auto bg-muted/40 p-6">
          <TemplatePreview config={config} doc={sampleDocument(config.documentTitle)} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={cn("rounded-md px-3 py-1 text-xs capitalize", value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{o}</button>
      ))}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border" />
      <Input className="h-8 w-28" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
