"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, FileBarChart, CheckCircle2, ArrowRight } from "lucide-react";
import { Kpi, SectionHeader, WidgetCard, EmptyState, QuickActions, Timeline } from "@/components/portal/widgets";

type Session = { companies: { orgId: string; name: string; role: string }[] };

export default function CaDashboardPage() {
  const { data } = useQuery({
    queryKey: ["ca-session"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/session?portal=ca");
      return r.ok ? ((await r.json()).data as Session) : null;
    }
  });
  const companies = data?.companies ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <SectionHeader title="Practice dashboard" description="Compliance across all your clients" actions={
        <QuickActions actions={[
          { label: "Compliance calendar", href: "/ca/compliance/calendar", icon: CalendarClock },
          { label: "GST returns", href: "/ca/gst/returns", icon: FileBarChart }
        ]} />
      } />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Assigned companies" value={companies.length} icon={Building2} tone="indigo" />
        <Kpi label="GST deadlines (30d)" value={0} icon={CalendarClock} tone="amber" />
        <Kpi label="TDS deadlines (30d)" value={0} icon={CalendarClock} tone="amber" />
        <Kpi label="Pending approvals" value={0} icon={CheckCircle2} tone="emerald" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="Assigned companies" action={<span className="text-xs text-muted-foreground">Use the switcher to change company</span>}>
          {companies.length === 0 ? <EmptyState icon={Building2} title="No companies assigned" /> : (
            <div className="divide-y">
              {companies.map((c) => (
                <div key={c.orgId} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 font-semibold text-violet-700">{c.name.slice(0, 1)}</span><div><p className="text-sm font-medium">{c.name}</p><p className="text-xs capitalize text-muted-foreground">{c.role.replace(/_/g, " ")}</p></div></div>
                  <Link href="/ca/accounting/trial-balance" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open<ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
        <WidgetCard title="Upcoming compliance" href="/ca/compliance/calendar">
          <Timeline items={[
            { title: "GSTR-3B filing window opens", meta: "GST", time: "This month", tone: "amber" },
            { title: "TDS payment due", meta: "Income Tax", time: "Next week", tone: "rose" }
          ]} />
        </WidgetCard>
      </div>
    </div>
  );
}
