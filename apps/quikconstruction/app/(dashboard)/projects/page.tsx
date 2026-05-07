"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet, Calculator, Hammer, CalendarCheck,
  Receipt, GanttChart, TrendingUp,
} from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function ProjectsIndexPage() {
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const kpis = data?.kpis ?? {};

  return (
    <>
      <PageHeader
        title="Project Management"
        subtitle="BOQ, estimation, work orders, DPR, and billing"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="BOQ Value" value={kpis.boqValue ? `₹ ${Number(kpis.boqValue).toLocaleString("en-IN")}` : "₹ 0"}
            subtitle="Total contract value" icon={<FileSpreadsheet className="w-5 h-5" />} color="blue" />
          <KPICard title="Work Done" value={kpis.overallProgress ? `${kpis.overallProgress}%` : "0%"}
            subtitle="Overall progress" icon={<TrendingUp className="w-5 h-5" />} color="green" />
          <KPICard title="Active Work Orders" value={kpis.activeWOs ?? 0}
            icon={<Hammer className="w-5 h-5" />} color="orange" onClick={() => router.push("/projects/work-orders")} />
          <KPICard title="Pending DPR Approval" value={kpis.pendingDPRApproval ?? 0}
            icon={<CalendarCheck className="w-5 h-5" />} color="amber" onClick={() => router.push("/projects/dpr")} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {[
            { label: "BOQ", href: "/projects/boq", icon: FileSpreadsheet, color: "bg-blue-50 text-blue-600", desc: "Bill of Quantities — hierarchical scope" },
            { label: "Material Estimation", href: "/projects/estimation", icon: Calculator, color: "bg-teal-50 text-teal-600", desc: "Map BOQ items to material requirements" },
            { label: "Work Orders", href: "/projects/work-orders", icon: Hammer, color: "bg-orange-50 text-orange-600", desc: "Assign scope to contractors" },
            { label: "Daily Progress (DPR)", href: "/projects/dpr", icon: CalendarCheck, color: "bg-green-50 text-green-600", desc: "Record daily work, labour, machinery" },
            { label: "Running A/c Bill (RAB)", href: "/projects/rab", icon: Receipt, color: "bg-purple-50 text-purple-600", desc: "Contractor billing from DPR" },
            { label: "Gantt View", href: "/projects/gantt", icon: GanttChart, color: "bg-indigo-50 text-indigo-600", desc: "Planned vs actual timeline" },
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
