"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList, FileText, GitCompareArrows,
  FileSpreadsheet, BadgeCheck, ArrowRight,
} from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function PurchaseIndexPage() {
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
        title="Purchase & Procurement"
        subtitle="PR → Indent → RFQ → PO → GRN pipeline"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard title="Open PRs" value={kpis.openPRs ?? 0}
            icon={<ClipboardList className="w-5 h-5" />} color="blue"
            onClick={() => router.push("/purchase/requisitions")} />
          <KPICard title="Pending Indents" value={kpis.pendingIndents ?? 0}
            icon={<FileText className="w-5 h-5" />} color="amber"
            onClick={() => router.push("/purchase/indents")} />
          <KPICard title="Active RFQs" value={kpis.activeRFQs ?? 0}
            icon={<GitCompareArrows className="w-5 h-5" />} color="purple"
            onClick={() => router.push("/purchase/rfqs")} />
          <KPICard title="Open POs" value={kpis.openPOs ?? 0}
            icon={<FileSpreadsheet className="w-5 h-5" />} color="orange"
            onClick={() => router.push("/purchase/orders")} />
          <KPICard title="GRNs This Month" value={kpis.grnThisMonth ?? 0}
            icon={<BadgeCheck className="w-5 h-5" />} color="green"
            onClick={() => router.push("/store/grn")} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Procurement Pipeline</h3>
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {[
              { label: "Purchase Requisition", sublabel: "Request materials", href: "/purchase/requisitions" },
              { label: "Stock Check", sublabel: "System auto-check", href: "#" },
              { label: "Purchase Indent", sublabel: "Indent for ordering", href: "/purchase/indents" },
              { label: "RFQ", sublabel: "Vendor comparison", href: "/purchase/rfqs" },
              { label: "Purchase Order", sublabel: "Order from vendor", href: "/purchase/orders" },
              { label: "GRN", sublabel: "Receive & inspect", href: "/store/grn" },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => step.href !== "#" && router.push(step.href)}
                  className="flex flex-col items-center p-4 rounded-xl bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 transition-all min-w-[140px]"
                >
                  <span className="text-xs font-semibold text-gray-900">{step.label}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">{step.sublabel}</span>
                </button>
                {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    </>
  );
}
