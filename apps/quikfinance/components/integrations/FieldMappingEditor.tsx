"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Save, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { ENTITY_TYPES, type EntityType } from "@/lib/integrations/types";

type Mapping = { sourceField: string; targetField: string; direction: string; transform: { type: string }; enabled: boolean };

const TRANSFORMS = ["none", "trim", "uppercase", "lowercase", "number", "default", "date_format"].map((t) => ({ value: t, label: t.replace("_", " ") }));
const DIRECTIONS = [{ value: "pull", label: "External → QuikFinance" }, { value: "push", label: "QuikFinance → External" }, { value: "bidirectional", label: "Bidirectional" }];
const label = (e: string) => e.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export function FieldMappingEditor({ connectionId, provider }: { connectionId: string; provider: string }) {
  const [entity, setEntity] = useState<EntityType>("customers");
  const [rows, setRows] = useState<Mapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["int-mappings", connectionId, entity],
    queryFn: async () => {
      const r = await fetch(`/api/v1/integrations/mappings?connectionId=${connectionId}&entity=${entity}`);
      return r.ok ? ((await r.json()).data as Array<Record<string, unknown>>) : [];
    }
  });

  useEffect(() => {
    if (!data) return;
    setRows(data.map((m) => ({
      sourceField: String(m.source_field ?? ""),
      targetField: String(m.target_field ?? ""),
      direction: String(m.direction ?? "bidirectional"),
      transform: (m.transform as { type: string }) ?? { type: "none" },
      enabled: m.enabled !== false
    })));
  }, [data]);

  const update = (i: number, patch: Partial<Mapping>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { sourceField: "", targetField: "", direction: "pull", transform: { type: "none" }, enabled: true }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const suggestWithAi = async () => {
    setAiBusy(true);
    try {
      const sourceFields = rows.map((r) => r.sourceField).filter(Boolean);
      const res = await fetch("/api/v1/integrations/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest_mappings", entity, sourceFields }) });
      const body = (await res.json()).data as { configured: boolean; message?: string; suggestions?: Array<{ sourceField: string; targetField: string; transform: string }> };
      if (!body.configured) { toast.message(body.message ?? "AI not configured."); return; }
      const suggestions = body.suggestions ?? [];
      if (!suggestions.length) { toast.message("No confident suggestions."); return; }
      setRows((prev) => {
        const next = [...prev];
        for (const sug of suggestions) {
          const idx = next.findIndex((r) => r.sourceField.toLowerCase() === sug.sourceField.toLowerCase());
          const mapping: Mapping = { sourceField: sug.sourceField, targetField: sug.targetField, direction: "pull", transform: { type: sug.transform || "none" }, enabled: true };
          if (idx >= 0) next[idx] = { ...next[idx], targetField: sug.targetField, transform: { type: sug.transform || "none" } };
          else next.push(mapping);
        }
        return next;
      });
      toast.success(`AI suggested ${suggestions.length} mappings — review and save.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "AI suggest failed"); }
    finally { setAiBusy(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = rows.filter((r) => r.sourceField && r.targetField);
      const res = await fetch("/api/v1/integrations/mappings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId, entity, mappings: payload }) });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Mapping saved.");
      refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-64">
          <label className="text-xs font-medium text-muted-foreground">Entity</label>
          <div className="mt-1"><Combobox value={entity} onChange={(v) => setEntity(v as EntityType)} options={ENTITY_TYPES.map((e) => ({ value: e, label: label(e) }))} /></div>
        </div>
        <p className="text-xs text-muted-foreground">{label(provider)} field → QuikFinance field, with per-field transforms.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Source field</th><th className="w-8" /><th className="px-3 py-2 text-left">Target field</th><th className="px-3 py-2 text-left">Direction</th><th className="px-3 py-2 text-left">Transform</th><th className="w-10" /></tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && !isFetching ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No mappings yet — they are auto-inferred on first sync, or add them here.</td></tr>
            ) : rows.map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2"><Input value={row.sourceField} onChange={(e) => update(i, { sourceField: e.target.value })} placeholder="e.g. PartyGSTIN" /></td>
                <td className="text-center text-muted-foreground"><ArrowRight className="mx-auto h-4 w-4" /></td>
                <td className="px-3 py-2"><Input value={row.targetField} onChange={(e) => update(i, { targetField: e.target.value })} placeholder="e.g. tax_id" /></td>
                <td className="px-3 py-2"><Combobox value={row.direction} onChange={(v) => update(i, { direction: v })} options={DIRECTIONS} /></td>
                <td className="px-3 py-2"><Combobox value={row.transform.type} onChange={(v) => update(i, { transform: { type: v } })} options={TRANSFORMS} /></td>
                <td className="px-3 py-2 text-center"><button onClick={() => removeRow(i)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={addRow}><Plus className="mr-1 h-4 w-4" />Add field</Button>
          <Button variant="secondary" onClick={suggestWithAi} disabled={aiBusy}>{aiBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Suggest with AI</Button>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save mapping</Button>
      </div>
    </div>
  );
}
