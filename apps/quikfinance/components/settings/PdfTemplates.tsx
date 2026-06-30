"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Star, Pencil, Copy, Trash2, Eye, MoreVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";
import { PDF_MODULES, type TemplateConfig } from "@/lib/pdf-templates/config";
import { TEMPLATE_PRESETS, PRESET_CATEGORIES, type TemplatePreset } from "@/lib/pdf-templates/catalog";
import { sampleDocument } from "@/lib/pdf-templates/document";
import { TemplatePreview } from "./TemplatePreview";
import { PdfTemplateEditor } from "./PdfTemplateEditor";

type Template = { id: string; module: string; name: string; base: string; config: TemplateConfig; is_default: boolean };

export function PdfTemplates() {
  const qc = useQueryClient();
  const [module, setModule] = useState<string>("invoice");
  const [gallery, setGallery] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const { data: templates = [], isPending } = useQuery({
    queryKey: ["pdf-templates", module],
    queryFn: async () => {
      const r = await fetch(`/api/v1/settings/pdf-templates?module=${module}`);
      return r.ok ? (((await r.json()) as { data?: Template[] }).data ?? []) : [];
    }
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["pdf-templates", module] });
  const meta = PDF_MODULES.find((m) => m.key === module)!;

  const createFromPreset = async (preset: TemplatePreset) => {
    const res = await fetch("/api/v1/settings/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, name: preset.name, base: preset.key }) });
    const body = (await res.json().catch(() => null)) as { data?: { id: string }; error?: { message?: string } } | null;
    if (!res.ok) { toast.error(body?.error?.message ?? "Could not add the template."); return; }
    toast.success(`${preset.name} added.`);
    setGallery(false);
    await refresh();
    // Open the editor on the freshly-created template.
    if (body?.data?.id) {
      const r = await fetch(`/api/v1/settings/pdf-templates/${body.data.id}`);
      if (r.ok) setEditing(((await r.json()) as { data: Template }).data);
    }
  };

  const clone = async (t: Template) => {
    const res = await fetch("/api/v1/settings/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, name: `${t.name} (Copy)`, base: t.base, clone_from: t.id }) });
    if (res.ok) { toast.success("Template cloned."); refresh(); } else toast.error("Could not clone.");
    setMenuId(null);
  };

  const makeDefault = async (t: Template) => {
    const res = await fetch(`/api/v1/settings/pdf-templates/${t.id}/default`, { method: "POST" });
    if (res.ok) { toast.success(`${t.name} is now the default.`); refresh(); } else toast.error("Could not update.");
    setMenuId(null);
  };

  const remove = async (t: Template) => {
    setMenuId(null);
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    const res = await fetch(`/api/v1/settings/pdf-templates/${t.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Template deleted."); refresh(); } else toast.error("Could not delete.");
  };

  if (editing) {
    return <PdfTemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="PDF Templates" description="Design the print/PDF layout for each transaction type. The default template is used when you download or email a document." />

      <div className="flex gap-5">
        {/* Module sub-nav */}
        <div className="w-52 shrink-0 overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Templates</div>
          <nav className="py-1">
            {PDF_MODULES.map((m) => (
              <button key={m.key} type="button" onClick={() => { setModule(m.key); setMenuId(null); }}
                className={cn("flex w-full items-center justify-between px-3 py-1.5 text-left text-sm", module === m.key ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted/50")}>
                {m.label}{m.wired ? <span className="rounded bg-emerald-100 px-1.5 py-px text-[9px] font-semibold uppercase text-emerald-700">Live</span> : null}
              </button>
            ))}
          </nav>
        </div>

        {/* Cards */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">All {meta.label} Templates</h3>
            <Button size="sm" onClick={() => setGallery(true)}><Plus className="h-4 w-4" />New</Button>
          </div>

          {isPending ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {templates.map((t) => (
                <div key={t.id} className="group relative overflow-hidden rounded-xl border bg-card shadow-card">
                  <div className="relative h-64 overflow-hidden bg-muted/30 p-2">
                    <div className="origin-top" style={{ transform: "scale(0.42)", width: "238%" }}>
                      <TemplatePreview config={t.config} doc={sampleDocument(t.config.documentTitle)} scale={1} />
                    </div>
                    {t.is_default ? <span className="absolute left-2 top-2 rounded bg-amber-400/90 px-1.5 py-px text-[10px] font-bold uppercase text-amber-950">★ Default</span> : null}
                    {/* Hover actions */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="sm" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                      <div className="relative">
                        <Button size="sm" variant="secondary" onClick={() => setMenuId(menuId === t.id ? null : t.id)}><MoreVertical className="h-3.5 w-3.5" /></Button>
                        {menuId === t.id ? (
                          <div className="absolute bottom-full right-0 z-10 mb-1 w-44 overflow-hidden rounded-lg border bg-popover py-1 text-sm shadow-popover">
                            <a href={`/api/v1/settings/pdf-templates/${t.id}/preview`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted" onClick={() => setMenuId(null)}><Eye className="h-3.5 w-3.5" />Preview</a>
                            {!t.is_default ? <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted" onClick={() => makeDefault(t)}><Star className="h-3.5 w-3.5" />Mark as Default</button> : null}
                            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted" onClick={() => clone(t)}><Copy className="h-3.5 w-3.5" />Clone</button>
                            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-destructive hover:bg-muted" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" />Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="border-t px-3 py-2 text-sm font-medium">{t.name}</div>
                </div>
              ))}

              {/* New template card */}
              <button type="button" onClick={() => setGallery(true)} className="flex h-[19.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card text-center text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Plus className="h-7 w-7" />
                <span className="text-sm font-medium text-foreground">New Template</span>
                <span className="max-w-[14rem] text-xs">Add a template from the gallery and customize columns, headers, and totals.</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {gallery ? <GalleryModal onPick={createFromPreset} onClose={() => setGallery(false)} /> : null}
    </div>
  );
}

function GalleryModal({ onPick, onClose }: { onPick: (p: TemplatePreset) => void; onClose: () => void }) {
  const [cat, setCat] = useState<(typeof PRESET_CATEGORIES)[number] | "All">("All");
  const visible = cat === "All" ? TEMPLATE_PRESETS : TEMPLATE_PRESETS.filter((p) => p.category === cat);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <h2 className="text-[15px] font-semibold">Choose a Template</h2>
        <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
      </div>
      <div className="flex items-center gap-1 border-b bg-card px-5 py-2 text-sm">
        {(["All", ...PRESET_CATEGORIES] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)}
            className={cn("rounded-md px-3 py-1", cat === c ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
            {c} {c === "All" ? `(${TEMPLATE_PRESETS.length})` : `(${TEMPLATE_PRESETS.filter((p) => p.category === c).length})`}
          </button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-5 overflow-auto p-6 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((p) => (
          <button key={p.key} type="button" onClick={() => onPick(p)} className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-card transition-shadow hover:shadow-popover">
            <div className="h-56 overflow-hidden bg-muted/30 p-2">
              <div className="origin-top" style={{ transform: "scale(0.34)", width: "294%" }}>
                <TemplatePreview config={p.config} scale={1} />
              </div>
            </div>
            <div className="border-t px-3 py-2">
              <div className="text-sm font-medium group-hover:text-primary">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.blurb}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
