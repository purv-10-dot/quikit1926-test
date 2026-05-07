"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Package, ClipboardList, ArrowLeftRight,
  FileBarChart2, Fuel, AlertTriangle,
} from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function StoreIndexPage() {
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
        title="Store & Inventory"
        subtitle="Stock register, material movements, and inventory control"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Stock Value" value={kpis.stockValue ? `₹ ${Number(kpis.stockValue).toLocaleString("en-IN")}` : "₹ 0"}
            icon={<BarChart3 className="w-5 h-5" />} color="blue" onClick={() => router.push("/store/stock-register")} />
          <KPICard title="Low Stock Items" value={kpis.lowStockItems ?? 0} subtitle="Below minimum level"
            icon={<AlertTriangle className="w-5 h-5" />} color="red" onClick={() => router.push("/store/stock-register?filter=low_stock")} />
          <KPICard title="Issues This Month" value={kpis.issuesThisMonth ?? 0}
            icon={<Package className="w-5 h-5" />} color="purple" onClick={() => router.push("/store/issue")} />
          <KPICard title="Pending Transfers" value={kpis.pendingTransfers ?? 0}
            icon={<ArrowLeftRight className="w-5 h-5" />} color="amber" onClick={() => router.push("/store/transfer")} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
          {[
            { label: "Stock Register", href: "/store/stock-register", icon: BarChart3, color: "bg-blue-50 text-blue-600", desc: "Current stock by item, location" },
            { label: "Material Issue", href: "/store/issue", icon: Package, color: "bg-purple-50 text-purple-600", desc: "Issue materials to site" },
            { label: "Gate Pass", href: "/store/gate-pass", icon: ClipboardList, color: "bg-green-50 text-green-600", desc: "Inward / outward gate passes" },
            { label: "Good Return", href: "/store/good-return", icon: ArrowLeftRight, color: "bg-red-50 text-red-600", desc: "Return rejected material to vendor" },
            { label: "Stock Transfer", href: "/store/transfer", icon: ArrowLeftRight, color: "bg-amber-50 text-amber-600", desc: "Transfer between sites" },
            { label: "Reconciliation", href: "/store/reconciliation", icon: FileBarChart2, color: "bg-indigo-50 text-indigo-600", desc: "Physical vs system stock" },
            { label: "Diesel Log", href: "/store/diesel-log", icon: Fuel, color: "bg-orange-50 text-orange-600", desc: "Machine-wise fuel consumption" },
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
