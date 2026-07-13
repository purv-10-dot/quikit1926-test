"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Star, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { PageHeader } from "@/components/shared/PageHeader";

type Loc = { id: string; name: string; code: string; type: string; default_series_id: string | null; is_default: boolean; is_active: boolean; address: Record<string, unknown> | null };
type Series = { id: string; name: string };

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path); if (!r.ok) return [];
  return (((await r.json()) as { data?: unknown }).data as Array<Record<string, unknown>>) ?? [];
}
function addrText(a: Record<string, unknown> | null): string {
  if (!a) return "—";
  return [a.city, a.state, a.country].filter(Boolean).join(" ") || "—";
}

export function LocationsSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Loc | "new" | null>(null);

  const { data: locations = [], isPending } = useQuery({ queryKey: ["locations"], queryFn: async () => (await fetchList("/api/v1/warehouses")) as unknown as Loc[] });
  const { data: series = [] } = useQuery({ queryKey: ["loc-series"], queryFn: async () => (await fetchList("/api/v1/transaction-series")).map((s) => ({ id: String(s.id), name: String(s.name) }) as Series) });
  const seriesById = new Map(series.map((s) => [s.id, s.name]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["locations"] });

  const remove = async (id: string) => {
    if (!window.confirm("Delete this location?")) return;
    const res = await fetch(`/api/v1/warehouses/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete."); return; }
    toast.success("Location deleted."); refresh();
  };

  if (editing) return <LocationForm location={editing === "new" ? null : editing} series={series} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between">
        <PageHeader title="Locations" description="Business and warehouse locations. Each location's default transaction series numbers the documents created there." />
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Add Location</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Default Transaction Series</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Address</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
          <tbody className="divide-y">
            {isPending ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={5}>Loading…</td></tr> : locations.length === 0 ? (
              <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>No locations yet.</td></tr>
            ) : locations.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium text-primary">{l.name}{l.is_default ? <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}</td>
                <td className="px-4 py-2.5">{l.default_series_id ? seriesById.get(l.default_series_id) ?? "—" : "—"}</td>
                <td className="px-4 py-2.5 capitalize">{l.type}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{addrText(l.address)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(l)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(l.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationForm({ location, series, onClose, onSaved }: { location: Loc | null; series: Series[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(location);
  const a = (location?.address ?? {}) as Record<string, string>;
  const [type, setType] = useState(location?.type ?? "business");
  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState(location?.code ?? "");
  const [seriesId, setSeriesId] = useState(location?.default_series_id ?? "");
  const [street1, setStreet1] = useState(a.street1 ?? "");
  const [city, setCity] = useState(a.city ?? "");
  const [state, setStateV] = useState(a.state ?? "");
  const [country, setCountry] = useState(a.country ?? "India");
  const [pincode, setPincode] = useState(a.postal_code ?? "");
  const [isDefault, setIsDefault] = useState(location?.is_default ?? false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Enter a location name."); return; }
    if (!isEdit && !code.trim()) { toast.error("Enter a location code."); return; }
    const payload = {
      name: name.trim(), code: code.trim() || name.trim().slice(0, 20), type, default_series_id: seriesId || null,
      address: { street1, city, state, country, postal_code: pincode }, is_default: isDefault
    };
    setBusy(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/warehouses/${location!.id}` : "/api/v1/warehouses", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the location."); return; }
      toast.success(isEdit ? "Location updated." : "Location created."); onSaved();
    } finally { setBusy(false); }
  };

  const row = "grid gap-2 md:grid-cols-[160px_1fr] md:items-center";
  return (
    <div className="max-w-2xl space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{isEdit ? "Edit Location" : "Add Location"}</h1>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className={row}><Label>Location Type</Label>
        <select className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="business">Business Location</option><option value="warehouse">Warehouse Only Location</option>
        </select>
      </div>
      <div className={row}><Label className="text-destructive">Name*</Label><Input className="max-w-md" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className={row}><Label>Code</Label><Input className="max-w-md" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BLR" /></div>
      <div className={row}><Label>Street</Label><Input className="max-w-md" value={street1} onChange={(e) => setStreet1(e.target.value)} /></div>
      <div className={row}><Label>City</Label><Input className="max-w-md" value={city} onChange={(e) => setCity(e.target.value)} /></div>
      <div className={row}><Label>State</Label><Input className="max-w-md" value={state} onChange={(e) => setStateV(e.target.value)} /></div>
      <div className={row}><Label>Country</Label><Input className="max-w-md" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
      <div className={row}><Label>Pin Code</Label><Input className="max-w-md" value={pincode} onChange={(e) => setPincode(e.target.value)} /></div>
      <div className={row}><Label className="text-destructive">Default Transaction Series*</Label>
        <div className="max-w-md"><Combobox value={seriesId} onChange={setSeriesId} placeholder="Select a series" searchPlaceholder="Search series…" options={series.map((s) => ({ value: s.id, label: s.name }))} /></div>
      </div>
      <div className={row}><Label>Primary location</Label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />Make this the default location.</label></div>
      <div className="flex gap-2"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
    </div>
  );
}
