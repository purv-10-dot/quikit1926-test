"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type Item = { id: string; title: string; category: string; dueDate: string; status: "overdue" | "due_soon" | "upcoming" };
type Data = { today: string; items: Item[]; dueSoon: number };

const CAT_TONE: Record<string, string> = { GST: "bg-indigo-100 text-indigo-700", TDS: "bg-amber-100 text-amber-700", "Income Tax": "bg-violet-100 text-violet-700", ROC: "bg-emerald-100 text-emerald-700" };
const STATUS_TONE: Record<string, string> = { overdue: "bg-rose-100 text-rose-700", due_soon: "bg-amber-100 text-amber-700", upcoming: "bg-muted text-muted-foreground" };
const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const daysFrom = (today: string, d: string) => Math.round((new Date(d).getTime() - new Date(today).getTime()) / 86_400_000);

export function CaComplianceCalendar() {
  const { data, isPending } = useQuery({
    queryKey: ["ca-compliance"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/ca/compliance");
      return r.ok ? ((await r.json()).data as Data) : null;
    }
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="Compliance Calendar" description="Statutory deadlines for the selected company" />
      <WidgetCard title="Upcoming deadlines" action={data ? <span className="text-xs text-muted-foreground">{data.dueSoon} due within 15 days</span> : null}>
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No deadlines" />
        ) : (
          <ul className="divide-y">
            {data.items.map((it) => {
              const d = daysFrom(data.today, it.dueDate);
              return (
                <li key={it.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("rounded-lg px-2 py-1 text-[11px] font-semibold", CAT_TONE[it.category] ?? "bg-muted")}>{it.category}</span>
                    <div>
                      <p className="text-sm font-medium">{it.title}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(it.dueDate)} · {d < 0 ? `${-d} days ago` : d === 0 ? "today" : `in ${d} days`}</p>
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium capitalize", STATUS_TONE[it.status])}>{it.status.replace("_", " ")}</span>
                </li>
              );
            })}
          </ul>
        )}
      </WidgetCard>
    </div>
  );
}
