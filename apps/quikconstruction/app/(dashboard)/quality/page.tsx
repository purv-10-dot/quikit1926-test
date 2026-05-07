"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Search, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function QualityPage() {
  const router = useRouter();

  const { data: chkResult } = useQuery({
    queryKey: ["quality-checklists"],
    queryFn: () => fetch("/api/quality/checklists").then(r => r.json()),
  });

  const { data: inspResult } = useQuery({
    queryKey: ["quality-inspections"],
    queryFn: () => fetch("/api/quality/inspections").then(r => r.json()),
  });

  const checklists = chkResult?.data ?? [];
  const inspections = inspResult?.data ?? [];
  const pendingInspections = inspections.filter((i: any) => i.result === "Conditional").length;
  const passed = inspections.filter((i: any) => i.result === "Pass").length;
  const failed = inspections.filter((i: any) => i.result === "Fail").length;

  return (
    <>
      <PageHeader
        title="Quality Management"
        subtitle="Checklists, inspections, and QA/QC tracking"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Checklists" value={checklists.length}
            icon={<ClipboardCheck className="w-5 h-5" />} color="blue" />
          <KPICard title="Pending Inspections" value={pendingInspections}
            icon={<Search className="w-5 h-5" />} color="amber" />
          <KPICard title="Passed" value={passed}
            icon={<CheckCircle2 className="w-5 h-5" />} color="green" />
          <KPICard title="Failed" value={failed}
            icon={<XCircle className="w-5 h-5" />} color="red" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {[
            { label: "Checklists", href: "/quality/checklists", icon: ClipboardCheck, color: "bg-blue-50 text-blue-600", desc: "Quality checklist templates for various activities" },
            { label: "Inspections", href: "/quality/inspections", icon: Search, color: "bg-green-50 text-green-600", desc: "Inspection records linked to BOQ and work orders" },
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
