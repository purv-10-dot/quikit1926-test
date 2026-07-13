"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";

type Log = { id: string; level: string; message: string; created_at: string; context: Record<string, unknown> | null };

const LEVEL = { error: "text-rose-600", warn: "text-amber-600", info: "text-foreground", debug: "text-muted-foreground" } as const;

export function LogsViewer({ connectionId }: { connectionId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["int-logs", connectionId],
    refetchInterval: 10000,
    queryFn: async () => {
      const r = await fetch(`/api/v1/integrations/logs?connectionId=${connectionId}&limit=200`);
      return r.ok ? ((await r.json()).data as Log[]) : [];
    }
  });

  if (isPending) return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading logs…</div>;
  if (!data?.length) return <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">No logs yet — run a sync or migration.</div>;

  return (
    <div className="overflow-hidden rounded-xl border bg-[#0b1020]">
      <div className="max-h-[480px] overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {data.map((l) => (
          <div key={l.id} className="flex gap-3 border-b border-white/5 py-1.5">
            <span className="shrink-0 text-white/40">{new Date(l.created_at).toLocaleTimeString()}</span>
            <span className={cn("shrink-0 font-bold uppercase", LEVEL[l.level as keyof typeof LEVEL] ?? "text-white/70")}>{l.level}</span>
            <span className="text-white/85">{l.message}{l.context ? <span className="text-white/40"> {JSON.stringify(l.context)}</span> : null}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
