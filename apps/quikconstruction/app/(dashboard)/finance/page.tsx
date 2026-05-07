"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard, Receipt, Wallet, ShieldCheck, Banknote,
} from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function FinancePage() {
  const router = useRouter();

  const { data: vpResult } = useQuery({
    queryKey: ["finance-vendor-payments"],
    queryFn: () => fetch("/api/finance/vendor-payments").then(r => r.json()),
  });

  const { data: cbResult } = useQuery({
    queryKey: ["finance-client-billing"],
    queryFn: () => fetch("/api/finance/client-billing").then(r => r.json()),
  });

  const { data: pcResult } = useQuery({
    queryKey: ["finance-petty-cash"],
    queryFn: () => fetch("/api/finance/petty-cash").then(r => r.json()),
  });

  const { data: retResult } = useQuery({
    queryKey: ["finance-retention"],
    queryFn: () => fetch("/api/finance/retention").then(r => r.json()),
  });

  const vpData = vpResult?.data ?? [];
  const pcData = pcResult?.data ?? [];
  const retData = retResult?.data ?? [];

  const totalPOValue = vpData.reduce((s: number, r: any) => s + (r.invoiceAmount || 0), 0);
  const paymentsMade = vpData.filter((r: any) => r.status === "Paid").reduce((s: number, r: any) => s + (r.netPayable || 0), 0);
  const pendingPayments = vpData.filter((r: any) => r.status === "Pending" || r.status === "Approved").reduce((s: number, r: any) => s + (r.netPayable || 0), 0);
  const retentionHeld = retData.filter((r: any) => r.status === "Held").reduce((s: number, r: any) => s + (r.retentionAmount || 0), 0);
  const pettyCashBalance = 50000 - pcData.filter((p: any) => p.status === "Approved").reduce((s: number, r: any) => s + (r.amount || 0), 0);

  const fmt = (v: number) => `₹ ${v.toLocaleString("en-IN")}`;

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Vendor payments, client billing, petty cash, and retention tracking"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard title="Total Invoice Value" value={fmt(totalPOValue)}
            icon={<Receipt className="w-5 h-5" />} color="blue" />
          <KPICard title="Payments Made" value={fmt(paymentsMade)}
            icon={<CreditCard className="w-5 h-5" />} color="green" />
          <KPICard title="Pending Payments" value={fmt(pendingPayments)}
            icon={<Banknote className="w-5 h-5" />} color="amber" />
          <KPICard title="Retention Held" value={fmt(retentionHeld)}
            icon={<ShieldCheck className="w-5 h-5" />} color="orange" />
          <KPICard title="Petty Cash Balance" value={fmt(pettyCashBalance)}
            icon={<Wallet className="w-5 h-5" />} color="purple" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { label: "Vendor Payments", href: "/finance/vendor-payments", icon: CreditCard, color: "bg-blue-50 text-blue-600", desc: "Track vendor invoices, TDS, and payments" },
            { label: "Client Billing", href: "/finance/client-billing", icon: Receipt, color: "bg-green-50 text-green-600", desc: "Running account bills to clients" },
            { label: "Petty Cash", href: "/finance/petty-cash", icon: Wallet, color: "bg-purple-50 text-purple-600", desc: "Petty cash vouchers and imprest management" },
            { label: "Retention & SD", href: "/finance/retention", icon: ShieldCheck, color: "bg-orange-50 text-orange-600", desc: "Retention money and security deposit tracker" },
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
