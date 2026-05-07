"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, MessageSquare, ListChecks } from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function SafetyPage() {
  const router = useRouter();

  const { data: incResult } = useQuery({
    queryKey: ["safety-incidents"],
    queryFn: () => fetch("/api/safety/incidents").then(r => r.json()),
  });

  const { data: tbtResult } = useQuery({
    queryKey: ["safety-toolbox-talks"],
    queryFn: () => fetch("/api/safety/toolbox-talks").then(r => r.json()),
  });

  const incidents = incResult?.data ?? [];
  const toolboxTalks = tbtResult?.data ?? [];
  const openActions = incidents.filter((i: any) => i.status !== "Closed").length;
  const totalIncidentsMonth = incidents.length;
  const daysWithoutIncident = 2; // last incident was Apr 9

  return (
    <>
      <PageHeader
        title="Safety / HSE"
        subtitle="Incident reporting, toolbox talks, and HSE compliance"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Days Without Incident" value={daysWithoutIncident}
            icon={<ShieldCheck className="w-5 h-5" />} color="green" />
          <KPICard title="Total Incidents (Month)" value={totalIncidentsMonth}
            icon={<AlertTriangle className="w-5 h-5" />} color="red" />
          <KPICard title="Toolbox Talks (Month)" value={toolboxTalks.length}
            icon={<MessageSquare className="w-5 h-5" />} color="blue" />
          <KPICard title="Open Actions" value={openActions}
            icon={<ListChecks className="w-5 h-5" />} color="amber" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {[
            { label: "Incidents", href: "/safety/incidents", icon: AlertTriangle, color: "bg-red-50 text-red-600", desc: "Report and track safety incidents and near misses" },
            { label: "Toolbox Talks", href: "/safety/toolbox-talks", icon: MessageSquare, color: "bg-blue-50 text-blue-600", desc: "Daily toolbox talk records and attendance" },
          ].map((m) => (
            <button key={m.href} onClick={() => router.push(m.href)}
              className="flex flex-col p-5 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left">
              <div className={`w-10 h-10 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                <m.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{m.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
