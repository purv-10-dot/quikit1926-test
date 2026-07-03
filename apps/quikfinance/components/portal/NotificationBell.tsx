"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PortalKey } from "@/lib/portal/hosts";

type Notif = { id: string; title: string; body: string; entity_type: string | null; read_at: string | null; created_at: string };

export function NotificationBell({ portal }: { portal: PortalKey }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["portal-notifications", portal],
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await fetch(`/api/v1/portal/notifications?portal=${portal}`);
      return r.ok ? ((await r.json()).data as { notifications: Notif[]; unread: number }) : { notifications: [], unread: 0 };
    }
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const mark = async (payload: { id?: string; all?: boolean }) => {
    await fetch(`/api/v1/portal/notifications?portal=${portal}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    qc.invalidateQueries({ queryKey: ["portal-notifications", portal] });
  };

  const unread = data?.unread ?? 0;
  const items = data?.notifications ?? [];

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 hover:bg-muted" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-xl border bg-popover shadow-popover">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <button onClick={() => mark({ all: true })} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : items.map((nt) => (
              <button key={nt.id} onClick={() => !nt.read_at && mark({ id: nt.id })} className={cn("flex w-full flex-col items-start gap-0.5 border-b px-4 py-2.5 text-left last:border-0 hover:bg-muted/60", !nt.read_at && "bg-primary/5")}>
                <span className="flex w-full items-center gap-2 text-sm font-medium">{!nt.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}{nt.title}</span>
                <span className="text-xs text-muted-foreground">{nt.body}</span>
                <span className="text-[11px] text-muted-foreground/70">{new Date(nt.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
