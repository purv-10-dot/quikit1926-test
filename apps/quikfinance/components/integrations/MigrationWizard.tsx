"use client";

import { useState } from "react";
import { Loader2, Check, RotateCcw, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { ENTITY_TYPES, type EntityType } from "@/lib/integrations/types";

const STEPS = ["Select", "Analyze", "Preview", "Import", "Report"] as const;
type Step = number;

type AnalysisEntity = { entity: string; recordsFound: number; duplicates: number; invalid: number; conflicts: number; estimatedSeconds: number };
type Analysis = { entities: AnalysisEntity[]; totals: { recordsFound: number; duplicates: number; invalid: number; estimatedSeconds: number }; duplicateSamples: Array<{ entity: string; existingId: string; score: number; reasons: string[]; recommend: string }> };

const label = (e: string) => e.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? "Request failed");
  return j.data;
}

export function MigrationWizard({ connectionId, provider }: { connectionId: string; provider: string }) {
  const [step, setStep] = useState<Step>(0);
  const [selected, setSelected] = useState<Set<EntityType>>(new Set(["customers", "vendors", "products"]));
  const [mode, setMode] = useState<"dry_run" | "live">("dry_run");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const toggle = (e: EntityType) => setSelected((prev) => { const n = new Set(prev); n.has(e) ? n.delete(e) : n.add(e); return n; });

  const startAnalyze = async () => {
    if (!selected.size) { toast.error("Select at least one entity."); return; }
    setBusy(true);
    try {
      const data = await post("/api/v1/integrations/migration/start", { connectionId, entities: Array.from(selected), mode, analyze: true });
      setSessionId(data.session.id);
      setAnalysis(data.analysis);
      setStep(1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Analyze failed"); }
    finally { setBusy(false); }
  };

  const aiAssess = async () => {
    if (!analysis) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/v1/integrations/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analysis_summary", analysis }) });
      const body = (await res.json()).data as { configured: boolean; summary?: string };
      setAiSummary(body.summary ?? "AI assessment unavailable.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "AI assessment failed"); }
    finally { setAiBusy(false); }
  };

  const runImport = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const data = await post("/api/v1/integrations/migration/import", { sessionId, inline: true });
      setReport(data.report);
      setStep(4);
      toast.success("Migration finished.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  };

  const rollback = async () => {
    if (!sessionId) return;
    setBusy(true);
    try { const data = await post("/api/v1/integrations/migration/rollback", { sessionId }); toast.success(`Rolled back ${data.removedRows} records.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Rollback failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-semibold" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      {/* Step 1 — Select */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose what to migrate from {label(provider)}. The engine analyzes before importing.</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ENTITY_TYPES.map((e) => (
              <label key={e} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition", selected.has(e) ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.has(e)} onChange={() => toggle(e)} />
                {label(e)}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" className="h-4 w-4 accent-primary" checked={mode === "dry_run"} onChange={() => setMode("dry_run")} />Dry run (no writes)</label>
              <label className="flex items-center gap-2"><input type="radio" className="h-4 w-4 accent-primary" checked={mode === "live"} onChange={() => setMode("live")} />Live import</label>
            </div>
            <Button onClick={startAnalyze} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Analyze {selected.size} entities</Button>
          </div>
        </div>
      )}

      {/* Step 2 — Analyze */}
      {step === 1 && analysis && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Records found" value={analysis.totals.recordsFound} />
            <Stat label="Duplicates" value={analysis.totals.duplicates} tone={analysis.totals.duplicates ? "amber" : undefined} />
            <Stat label="Invalid" value={analysis.totals.invalid} tone={analysis.totals.invalid ? "red" : undefined} />
            <Stat label="Est. time" value={`${analysis.totals.estimatedSeconds}s`} />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Entity</th><th className="px-3 py-2 text-right">Found</th><th className="px-3 py-2 text-right">Dupes</th><th className="px-3 py-2 text-right">Invalid</th><th className="px-3 py-2 text-right">Conflicts</th></tr></thead>
              <tbody className="divide-y">
                {analysis.entities.map((e) => (
                  <tr key={e.entity}><td className="px-3 py-2 font-medium">{label(e.entity)}</td><td className="px-3 py-2 text-right tabular-nums">{e.recordsFound}</td><td className="px-3 py-2 text-right tabular-nums">{e.duplicates}</td><td className="px-3 py-2 text-right tabular-nums">{e.invalid}</td><td className="px-3 py-2 text-right tabular-nums">{e.conflicts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {aiSummary && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-primary"><Sparkles className="h-4 w-4" />AI assessment</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{aiSummary}</p>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              <Button variant="secondary" onClick={aiAssess} disabled={aiBusy}>{aiBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}AI assessment</Button>
            </div>
            <Button onClick={() => setStep(2)}>Preview duplicates</Button>
          </div>
        </div>
      )}

      {/* Step 3 — Preview */}
      {step === 2 && analysis && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Duplicate & merge suggestions</h3>
          {analysis.duplicateSamples.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No likely duplicates detected — clean import.</p>
          ) : (
            <div className="space-y-2">
              {analysis.duplicateSamples.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                  <div><span className="font-medium">{label(d.entity)}</span><span className="ml-2 text-xs text-muted-foreground">matches existing via {d.reasons.join(", ")}</span></div>
                  <div className="flex items-center gap-2"><Badge variant="secondary">{d.score}% match</Badge><Badge variant="secondary" className={cn(d.recommend === "merge" ? "bg-amber-100 text-amber-700" : "")}>{d.recommend}</Badge></div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(1)}>Back</Button><Button onClick={() => setStep(3)}>Continue to import</Button></div>
        </div>
      )}

      {/* Step 4 — Import */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <p>Ready to <strong>{mode === "live" ? "import" : "dry-run"}</strong> {Array.from(selected).map(label).join(", ")}.</p>
            <p className="mt-1 text-muted-foreground">{mode === "live" ? "Records will be written into QuikFinance. You can roll back in one click afterwards." : "No data will be written — this validates the full pipeline."}</p>
          </div>
          <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(2)}>Back</Button><Button onClick={runImport} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Run {mode === "live" ? "import" : "dry run"}</Button></div>
        </div>
      )}

      {/* Step 5 — Report */}
      {step === 4 && report && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="h-5 w-5" />Migration {String((report as { mode?: string }).mode) === "live" ? "completed" : "dry run completed"}.</div>
          <div className="grid gap-3 sm:grid-cols-4">
            {Object.entries((report.totals as Record<string, number>) ?? {}).map(([k, v]) => <Stat key={k} label={label(k)} value={v} />)}
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => { setStep(0); setReport(null); setAnalysis(null); setSessionId(null); }}>New migration</Button>
            <Button variant="ghost" onClick={rollback} disabled={busy}><RotateCcw className="mr-1 h-4 w-4" />Roll back</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label: l, value, tone }: { label: string; value: number | string; tone?: "amber" | "red" }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={cn("text-xl font-bold tabular-nums", tone === "amber" && "text-amber-600", tone === "red" && "text-rose-600")}>{value}</p>
    </div>
  );
}
