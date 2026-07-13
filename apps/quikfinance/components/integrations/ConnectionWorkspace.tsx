"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Pause, Play, Unplug, Beaker, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HealthRing } from "@/components/design/bento";
import { cn } from "@/lib/utils/cn";
import { MigrationWizard } from "./MigrationWizard";
import { FieldMappingEditor } from "./FieldMappingEditor";
import { ConflictResolver } from "./ConflictResolver";
import { LogsViewer } from "./LogsViewer";

const TABS = ["Overview", "Migration", "Mapping", "Conflicts", "Logs"] as const;
type Tab = (typeof TABS)[number];

type StatusResp = { connection: Record<string, unknown>; jobs: Array<Record<string, unknown>>; openConflicts: number };
type HealthResp = { report: { score: number; band: string; recommendations: string[]; factors: Array<{ key: string; impact: number; note: string }> }; metrics: { total: number; succeeded: number; failed: number; queued: number } };

async function getJson<T>(path: string): Promise<T | null> {
  const r = await fetch(path);
  return r.ok ? ((await r.json()).data as T) : null;
}
async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? "Request failed");
  return j.data;
}

export function ConnectionWorkspace({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: status, refetch } = useQuery({ queryKey: ["int-status", connectionId], queryFn: () => getJson<StatusResp>(`/api/v1/integrations/status?connectionId=${connectionId}`), refetchInterval: 15000 });
  const { data: health } = useQuery({ queryKey: ["int-health", connectionId], queryFn: () => getJson<HealthResp>(`/api/v1/integrations/health?connectionId=${connectionId}`) });

  const conn = status?.connection;
  const provider = String(conn?.provider_key ?? "");

  const run = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try { await fn(); toast.success(success); refetch(); qc.invalidateQueries({ queryKey: ["int-health", connectionId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  if (!conn) return <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Loading connection…</div>;

  return (
    <div className="space-y-5 animate-fade-up">
      <Link href="/settings/integrations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All integrations</Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center gap-4">
          <HealthRing score={Number(conn.health_score ?? 0)} size={64} />
          <div>
            <h1 className="text-xl font-bold">{String(conn.name)}</h1>
            <p className="text-sm text-muted-foreground">{String(conn.company_name ?? provider)} · {String(conn.region ?? "")}</p>
            <Badge variant="secondary" className={cn("mt-1 capitalize", conn.status === "connected" && "bg-emerald-100 text-emerald-700", conn.status === "error" && "bg-red-100 text-red-700")}>{String(conn.status)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => run("test", () => post("/api/v1/integrations/test", { connectionId }), "Connection tested")} disabled={busy === "test"}>
            {busy === "test" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Beaker className="mr-1 h-4 w-4" />}Test
          </Button>
          <Button size="sm" onClick={() => run("sync", () => post("/api/v1/integrations/sync", { connectionId, inline: true }), "Sync completed")} disabled={busy === "sync"}>
            {busy === "sync" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Sync now
          </Button>
          {conn.is_enabled ? (
            <Button variant="secondary" size="sm" onClick={() => run("pause", () => post("/api/v1/integrations/pause", { connectionId }), "Paused")} disabled={busy === "pause"}><Pause className="mr-1 h-4 w-4" />Pause</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => run("resume", () => post("/api/v1/integrations/resume", { connectionId }), "Resumed")} disabled={busy === "resume"}><Play className="mr-1 h-4 w-4" />Resume</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => run("disconnect", () => post("/api/v1/integrations/disconnect", { connectionId, remove: true }).then(() => router.push("/settings/integrations")), "Removed")} disabled={busy === "disconnect"}>
            <Unplug className="mr-1 h-4 w-4" />Remove
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}{t === "Conflicts" && status && status.openConflicts > 0 ? <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[11px] text-rose-700">{status.openConflicts}</span> : null}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 shadow-card">
              <h3 className="text-sm font-semibold">Recent jobs</h3>
              <div className="mt-3 divide-y text-sm">
                {(status?.jobs ?? []).length === 0 ? <p className="py-6 text-center text-muted-foreground">No jobs yet — run a sync.</p> :
                  (status?.jobs ?? []).slice(0, 8).map((j) => (
                    <div key={String(j.id)} className="flex items-center justify-between py-2">
                      <span className="font-medium capitalize">{String(j.type)}{j.entity ? ` · ${String(j.entity)}` : ""}</span>
                      <Badge variant="secondary" className={cn("capitalize", j.status === "succeeded" && "bg-emerald-100 text-emerald-700", (j.status === "failed" || j.status === "dead") && "bg-red-100 text-red-700")}>{String(j.status)}</Badge>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 shadow-card">
              <h3 className="text-sm font-semibold">Health</h3>
              {health ? (
                <>
                  <div className="mt-3 flex items-center gap-3"><HealthRing score={health.report.score} size={56} /><div><p className="text-2xl font-bold">{health.report.score}</p><p className="text-xs capitalize text-muted-foreground">{health.report.band}</p></div></div>
                  <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    {health.report.recommendations.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-primary">›</span>{r}</li>)}
                  </ul>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-muted/50 p-2"><p className="font-bold">{health.metrics.succeeded}</p><p className="text-muted-foreground">ok</p></div>
                    <div className="rounded-lg bg-muted/50 p-2"><p className="font-bold">{health.metrics.failed}</p><p className="text-muted-foreground">failed</p></div>
                    <div className="rounded-lg bg-muted/50 p-2"><p className="font-bold">{health.metrics.queued}</p><p className="text-muted-foreground">queued</p></div>
                  </div>
                </>
              ) : <p className="mt-3 text-xs text-muted-foreground">Computing…</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "Migration" && <MigrationWizard connectionId={connectionId} provider={provider} />}
      {tab === "Mapping" && <FieldMappingEditor connectionId={connectionId} provider={provider} />}
      {tab === "Conflicts" && <ConflictResolver connectionId={connectionId} onResolved={() => refetch()} />}
      {tab === "Logs" && <LogsViewer connectionId={connectionId} />}
    </div>
  );
}
