"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Plus, X, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { GST_REGISTRATION_TYPES } from "@/lib/gst";
import { cn } from "@/lib/utils/cn";

type Gstin = {
  id: string; gstin: string; registration_type: string; legal_name: string | null; trade_name: string | null;
  registered_on: string | null; reverse_charge: boolean; sez: boolean; digital_services: boolean; locations: string[]; location_ids: string[];
};
type GstData = { available: boolean; country: string | null; registered: boolean; gstins: Gstin[] };
type Loc = { id: string; name: string };

const regLabel = (v: string) => GST_REGISTRATION_TYPES.find((t) => t.value === v)?.label ?? v;

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path); if (!r.ok) return [];
  return (((await r.json()) as { data?: unknown }).data as Array<Record<string, unknown>>) ?? [];
}

export function GstSettings() {
  const qc = useQueryClient();
  const [enableInfo, setEnableInfo] = useState(false);
  const [editing, setEditing] = useState<Gstin | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isPending } = useQuery<GstData | null>({
    queryKey: ["gst-settings"],
    queryFn: async () => { const r = await fetch("/api/v1/settings/gst"); return r.ok ? (((await r.json()) as { data?: GstData }).data ?? null) : null; }
  });
  const { data: locations = [] } = useQuery({ queryKey: ["gst-locations"], queryFn: async () => (await fetchList("/api/v1/warehouses")).map((w) => ({ id: String(w.id), name: String(w.name ?? "") }) as Loc) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["gst-settings"] });

  const setRegistered = async (registered: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/settings/gst", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registered }) });
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (!res.ok) {
        if (body?.error?.code === "GSTIN_REQUIRED") { setEnableInfo(true); return; }
        toast.error(body?.error?.message ?? "Could not update GST settings."); return;
      }
      toast.success(registered ? "GST enabled." : "GST disabled."); refresh();
    } finally { setBusy(false); }
  };

  const onToggle = (next: boolean) => {
    if (next && (data?.gstins.length ?? 0) === 0) { setEnableInfo(true); return; }
    if (!next && !window.confirm("Disable GST for this organization?")) return;
    setRegistered(next);
  };

  if (isPending) return <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-card">Loading…</div>;

  // India guard.
  if (data && !data.available) {
    return (
      <div className="space-y-5 animate-fade-up">
        <PageHeader title="GST Settings" description="Goods & Services Tax configuration." />
        <div className="flex items-start gap-3 rounded-2xl border bg-amber-50 p-5 text-sm shadow-card">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold text-amber-900">GST is available only for organizations based in India.</p>
            <p className="mt-1 text-amber-800">Your organization country is currently <span className="font-medium">{data.country ?? "not set"}</span>. Set it to India in{" "}
              <Link href="/settings/organization" className="font-medium underline">Organization → Profile</Link> to enable GST.</p>
          </div>
        </div>
      </div>
    );
  }

  const registered = data?.registered ?? false;
  const gstins = data?.gstins ?? [];

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="GST Settings" description="Register your business for GST and associate active locations with their GSTINs." />

      <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          <p className="text-sm font-semibold">Is your business registered for GST?</p>
          <p className="text-[13px] text-muted-foreground">Once enabled, transactions capture GST and feed your GST returns.</p>
        </div>
        <button
          type="button" role="switch" aria-checked={registered} disabled={busy}
          onClick={() => onToggle(!registered)}
          className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", registered ? "bg-emerald-500" : "bg-muted-foreground/30")}
        >
          <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", registered ? "translate-x-5" : "translate-x-0.5")} />
        </button>
      </div>

      {(registered || gstins.length > 0) ? (
        <div className="rounded-2xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <p className="text-[15px] font-semibold tracking-tight">GSTINs</p>
            </div>
            <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add GSTIN</Button>
          </div>
          {gstins.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No GSTINs yet. Add one and associate your active locations.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2.5 text-left">GSTIN</th><th className="px-4 py-2.5 text-left">Registration Type</th><th className="px-4 py-2.5 text-left">Associated Locations</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
              <tbody className="divide-y">
                {gstins.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium tabular-nums">{g.gstin}</td>
                    <td className="px-4 py-2.5">{regLabel(g.registration_type)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.locations.length ? g.locations.join(", ") : <span className="text-rose-500">None — associate a location</span>}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(g)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (!window.confirm("Delete this GSTIN?")) return; const r = await fetch(`/api/v1/gstins/${g.id}`, { method: "DELETE" }); if (r.ok) { toast.success("GSTIN deleted."); refresh(); } else toast.error("Could not delete."); }}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {enableInfo ? (
        <EnableInfoModal locationsCount={locations.length} onClose={() => setEnableInfo(false)} onContinue={() => { setEnableInfo(false); setEditing("new"); }} />
      ) : null}

      {editing ? (
        <GstinModal
          gstin={editing === "new" ? null : editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            // First GSTIN added during the enable flow → flip the registered switch on.
            if (!registered) await fetch("/api/v1/settings/gst", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registered: true }) });
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function EnableInfoModal({ locationsCount, onClose, onContinue }: { locationsCount: number; onClose: () => void; onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /><h2 className="text-[15px] font-semibold">Associate active locations with GSTINs to enable GST</h2></div>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="space-y-3 p-5 text-[13px] text-muted-foreground">
          <p>To enable GST it is mandatory to associate a GSTIN with every active location. You currently have <span className="font-medium text-foreground">{locationsCount}</span> active location{locationsCount === 1 ? "" : "s"}, each of which must be associated with a valid GSTIN.</p>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-1 font-medium text-foreground">Steps to enable GST</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Click <span className="font-medium">Add GSTIN</span> and enter a valid GSTIN.</li>
              <li>Select the registration type and the active locations to associate.</li>
              <li>Add a GSTIN for each active location, then your business is GST-enabled.</li>
              <li>You can edit a location&apos;s GSTIN association anytime.</li>
            </ul>
          </div>
        </div>
        <div className="flex gap-2 border-t p-4"><Button onClick={onContinue}>Continue</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}

function GstinModal({ gstin, locations, onClose, onSaved }: { gstin: Gstin | null; locations: Loc[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(gstin);
  const [gstinNo, setGstinNo] = useState(gstin?.gstin ?? "");
  const [regType, setRegType] = useState(gstin?.registration_type ?? "registered_regular");
  const [legal, setLegal] = useState(gstin?.legal_name ?? "");
  const [trade, setTrade] = useState(gstin?.trade_name ?? "");
  const [regOn, setRegOn] = useState(gstin?.registered_on ?? "");
  const [reverse, setReverse] = useState(gstin?.reverse_charge ?? false);
  const [sez, setSez] = useState(gstin?.sez ?? false);
  const [digital, setDigital] = useState(gstin?.digital_services ?? false);
  const [locIds, setLocIds] = useState<string[]>(gstin?.location_ids ?? []);
  const [busy, setBusy] = useState(false);

  const hint = useMemo(() => GST_REGISTRATION_TYPES.find((t) => t.value === regType)?.hint, [regType]);
  const toggleLoc = (id: string) => setLocIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const save = async () => {
    if (gstinNo.trim().length < 1) { toast.error("Enter a GSTIN."); return; }
    if (locIds.length === 0) { toast.error("Associate at least one location."); return; }
    const payload = { gstin: gstinNo.trim(), registration_type: regType, legal_name: legal.trim() || null, trade_name: trade.trim() || null, registered_on: regOn || null, reverse_charge: reverse, sez, digital_services: digital, location_ids: locIds };
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/gstins/${gstin!.id}` : "/api/v1/gstins", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the GSTIN."); return; }
      toast.success(isEdit ? "GSTIN updated." : "GSTIN added."); onSaved();
    } finally { setBusy(false); }
  };

  const row = "grid gap-2 md:grid-cols-[180px_1fr] md:items-start";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4"><h2 className="text-[15px] font-semibold">{isEdit ? "Edit GSTIN" : "New GSTIN"}</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button></div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          <div className={row}><div><Label className="text-destructive">GSTIN*</Label><p className="text-[11px] text-muted-foreground">Maximum 15 digits</p></div><Input className="max-w-sm" maxLength={15} value={gstinNo} onChange={(e) => setGstinNo(e.target.value.toUpperCase())} /></div>
          <div className={row}><Label className="md:pt-2">Registration Type</Label>
            <div className="max-w-sm">
              <select className="h-9 w-full rounded-lg border bg-background px-3 text-sm" value={regType} onChange={(e) => setRegType(e.target.value)}>
                {GST_REGISTRATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
            </div>
          </div>
          <div className={row}><Label className="md:pt-2">Business Legal Name</Label><Input className="max-w-sm" value={legal} onChange={(e) => setLegal(e.target.value)} /></div>
          <div className={row}><Label className="md:pt-2">Business Trade Name</Label><Input className="max-w-sm" value={trade} onChange={(e) => setTrade(e.target.value)} /></div>
          <div className={row}><Label className="md:pt-2">GST Registered On</Label><Input type="date" className="max-w-sm" value={regOn} onChange={(e) => setRegOn(e.target.value)} /></div>
          <div className={row}><Label className="md:pt-2">Options</Label>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />Enable Reverse Charge in Sales transactions</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={sez} onChange={(e) => setSez(e.target.checked)} />My business is involved in SEZ / Overseas Trading</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={digital} onChange={(e) => setDigital(e.target.checked)} />Track sale of digital services to overseas customers</label>
            </div>
          </div>
          <div className={row}><Label className="text-destructive md:pt-2">Associated Locations*</Label>
            <div className="max-w-sm rounded-lg border p-2">
              {locations.length === 0 ? <p className="px-1 py-2 text-[13px] text-muted-foreground">No locations. Add one in Settings → Locations.</p> :
                locations.map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={locIds.includes(l.id)} onChange={() => toggleLoc(l.id)} />{l.name}
                  </label>
                ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t p-4"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : isEdit ? "Update" : "Add"}</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}
