"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plug, ArrowRight, ShieldCheck, ShieldAlert, Activity, AlertTriangle, RefreshCw, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BentoCard, Metric } from "@/components/design/bento";
import { cn } from "@/lib/utils/cn";
import { ConnectWizard } from "./ConnectWizard";

type Provider = { key: string; name: string; authType: string; description: string; entityCount: number; capabilities: { oauth: boolean; multiCompany: boolean; webhooks: boolean } };
type Connection = { id: string; provider_key: string; name: string; status: string; company_name: string | null; health_score: number; last_sync_at: string | null };
type ProvidersResp = { providers: Provider[]; connections: Connection[]; encryptionEnabled: boolean };
type DashResp = { summary: { connectedProviders: number; running: number; queued: number; failed: number; openConflicts: number; last30: { created: number; updated: number; errors: number } } };

async function getJson<T>(path: string): Promise<T | null> {
  const r = await fetch(path);
  return r.ok ? ((await r.json()).data as T) : null;
}

const PROVIDER_GLYPH: Record<string, string> = { zoho_books: "Z", tally_prime: "T" };

export function IntegrationsHome() {
  const [wizard, setWizard] = useState<Provider | null>(null);
  const { data, isPending, refetch } = useQuery({ queryKey: ["int-providers"], queryFn: () => getJson<ProvidersResp>("/api/v1/integrations/providers") });
  const { data: dash } = useQuery({ queryKey: ["int-dashboard"], queryFn: () => getJson<DashResp>("/api/v1/integrations/dashboard") });

  const providers = data?.providers ?? [];
  const connections = data?.connections ?? [];
  const s = dash?.summary;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Plug className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">Accounting Connectivity</h1>
            <p className="text-sm text-muted-foreground">Connect, migrate, and continuously sync with any accounting system.</p>
          </div>
        </div>
        {data && (
          <Badge variant={data.encryptionEnabled ? "default" : "secondary"} className="gap-1">
            {data.encryptionEnabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {data.encryptionEnabled ? "Credentials encrypted" : "Set encryption key"}
          </Badge>
        )}
      </div>

      {/* Org-wide sync dashboard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BentoCard interactive={false}><Metric label="Connected providers" value={String(s?.connectedProviders ?? 0)} icon={Plug} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Running / queued" value={`${s?.running ?? 0} / ${s?.queued ?? 0}`} icon={Activity} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Failed jobs" value={String(s?.failed ?? 0)} icon={AlertTriangle} accent={(s?.failed ?? 0) > 0 ? "text-rose-500" : undefined} /></BentoCard>
        <BentoCard interactive={false}><Metric label="Records synced (30d)" value={String((s?.last30?.created ?? 0) + (s?.last30?.updated ?? 0))} sub={`${s?.openConflicts ?? 0} open conflicts`} icon={RefreshCw} /></BentoCard>
      </div>

      {/* Existing connections */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your connections</h2>
        {isPending ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : connections.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No connections yet. Pick a provider below to connect and run the migration wizard.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {connections.map((c) => (
              <Link key={c.id} href={`/settings/integrations/${c.id}`} className="group flex items-center justify-between rounded-2xl border bg-card p-4 shadow-card transition hover:border-primary/40 hover:shadow-popover">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">{PROVIDER_GLYPH[c.provider_key] ?? "•"}</span>
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.company_name ?? c.provider_key} · last sync {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : "never"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <Badge className={cn("capitalize", c.status === "connected" && "bg-emerald-100 text-emerald-700", c.status === "error" && "bg-red-100 text-red-700", c.status === "pending" && "bg-amber-100 text-amber-700")} variant="secondary">{c.status}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">Health {c.health_score}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Provider catalog */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Available providers</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <div key={p.key} className="flex flex-col rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">{PROVIDER_GLYPH[p.key] ?? "•"}</span>
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{p.authType === "oauth2" ? "OAuth 2.0" : "Local / LAN"}</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="gap-1"><Boxes className="h-3 w-3" />{p.entityCount} entities</Badge>
                {p.capabilities.multiCompany && <Badge variant="secondary">Multi-company</Badge>}
                {p.capabilities.webhooks && <Badge variant="secondary">Webhooks</Badge>}
              </div>
              <Button className="mt-4" onClick={() => setWizard(p)}>Connect {p.name}</Button>
            </div>
          ))}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-5 text-center">
            <p className="text-sm font-medium">QuickBooks · Xero · Sage · NetSuite · Dynamics</p>
            <p className="mt-1 text-xs text-muted-foreground">New providers plug in via the Provider SDK — same wizard, mapping, and sync engine.</p>
          </div>
        </div>
      </section>

      {wizard && (
        <ConnectWizard
          provider={wizard}
          onClose={() => setWizard(null)}
          onCreated={() => { setWizard(null); refetch(); }}
        />
      )}
    </div>
  );
}
