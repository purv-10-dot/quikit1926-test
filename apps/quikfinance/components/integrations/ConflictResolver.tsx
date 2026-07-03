"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitMerge, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Conflict = { id: string; entity: string; internal_data: Record<string, unknown>; external_data: Record<string, unknown>; field_diffs: Array<{ field: string; internal: unknown; external: unknown }> };

const STRATEGIES = [
  { key: "quikfinance_wins", label: "QuikFinance wins" },
  { key: "external_wins", label: "External wins" },
  { key: "latest_wins", label: "Latest wins" }
] as const;

const show = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function ConflictResolver({ connectionId, onResolved }: { connectionId: string; onResolved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiHints, setAiHints] = useState<Record<string, { strategy: string; reasoning: string }>>({});
  const { data, refetch, isPending } = useQuery({
    queryKey: ["int-conflicts", connectionId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/integrations/conflicts?connectionId=${connectionId}&status=open`);
      return r.ok ? ((await r.json()).data as Conflict[]) : [];
    }
  });

  const resolve = async (conflictId: string, strategy: string) => {
    setBusy(conflictId + strategy);
    try {
      const res = await fetch("/api/v1/integrations/conflicts/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conflictId, strategy }) });
      if (!res.ok) throw new Error("Resolve failed");
      toast.success("Conflict resolved.");
      refetch(); onResolved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Resolve failed"); }
    finally { setBusy(null); }
  };

  const askAi = async (c: Conflict) => {
    setAiBusy(c.id);
    try {
      const res = await fetch("/api/v1/integrations/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "conflict_suggestion", entity: c.entity, fieldDiffs: c.field_diffs }) });
      const body = (await res.json()).data as { configured: boolean; message?: string; suggestion?: { strategy: string; reasoning: string } };
      if (!body.configured) { toast.message(body.message ?? "AI not configured."); return; }
      if (body.suggestion) setAiHints((h) => ({ ...h, [c.id]: body.suggestion! }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "AI failed"); }
    finally { setAiBusy(null); }
  };

  if (isPending) return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading conflicts…</div>;
  if (!data?.length) return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-10 text-center">
      <ShieldCheck className="h-8 w-8 text-emerald-500" />
      <p className="text-sm font-medium">No open conflicts</p>
      <p className="text-xs text-muted-foreground">When both sides change the same record, it appears here for side-by-side review.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {data.map((c) => (
        <div key={c.id} className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="capitalize">{c.entity.replace(/_/g, " ")}</Badge>
            <span className="text-xs text-muted-foreground">{(c.field_diffs ?? []).length} differing fields</span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Field</th><th className="px-3 py-2 text-left">QuikFinance</th><th className="px-3 py-2 text-left">External</th></tr></thead>
              <tbody className="divide-y">
                {(c.field_diffs ?? []).map((d) => (
                  <tr key={d.field}><td className="px-3 py-2 font-medium">{d.field}</td><td className="px-3 py-2">{show(d.internal)}</td><td className="px-3 py-2">{show(d.external)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {aiHints[c.id] && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <span className="font-semibold text-primary">AI suggests: {aiHints[c.id].strategy.replace(/_/g, " ")}</span>
              <span className="ml-1 text-muted-foreground">— {aiHints[c.id].reasoning}</span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {STRATEGIES.map((s) => (
              <Button key={s.key} size="sm" variant="secondary" onClick={() => resolve(c.id, s.key)} disabled={busy === c.id + s.key}>
                {busy === c.id + s.key ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{s.label}
              </Button>
            ))}
            <Button size="sm" onClick={() => resolve(c.id, "merge")} disabled={busy === c.id + "merge"}><GitMerge className="mr-1 h-4 w-4" />Merge</Button>
            <Button size="sm" variant="ghost" onClick={() => askAi(c)} disabled={aiBusy === c.id}>{aiBusy === c.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Ask AI</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
