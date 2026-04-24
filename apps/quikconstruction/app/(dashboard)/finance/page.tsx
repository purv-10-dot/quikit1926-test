"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Receipt, Wallet, CreditCard, AlertTriangle, Coins, FileMinus, FilePlus } from "lucide-react";

interface Summary {
  ar: { total: number; overdue: number; invoiceCount: number; receiptCount: number };
  ap: { total: number; overdue: number; billCount: number; paymentCount: number };
}

const MODULES = [
  { href: "/finance/invoices", label: "Client Invoices", description: "Bills to clients — from approved RABs or standalone.", icon: FileText, color: "text-emerald-700 bg-emerald-50" },
  { href: "/finance/receipts", label: "Receipts",         description: "Money received from clients, allocated to invoices.", icon: Wallet,   color: "text-emerald-700 bg-emerald-50" },
  { href: "/finance/bills",    label: "Vendor Bills",     description: "Supplier bills — from posted GRNs or standalone.",    icon: Receipt,   color: "text-rose-700 bg-rose-50" },
  { href: "/finance/payments", label: "Payments",         description: "Money paid to vendors, allocated to bills.",          icon: CreditCard, color: "text-rose-700 bg-rose-50" },
  { href: "/finance/expenses", label: "Expenses",         description: "Petty cash and non-GRN costs, tagged to project.",     icon: Coins,      color: "text-rose-700 bg-rose-50" },
  { href: "/finance/credit-notes", label: "Credit Notes", description: "Reduce a customer's outstanding (returns, goodwill).",  icon: FileMinus,  color: "text-emerald-700 bg-emerald-50" },
  { href: "/finance/debit-notes",  label: "Debit Notes",  description: "Reduce a vendor bill's outstanding (rejects, disputes).", icon: FilePlus, color: "text-rose-700 bg-rose-50" },
];

export default function FinanceLanding() {
  const [sum, setSum] = useState<Summary | null>(null);
  useEffect(() => { fetch("/api/finance/summary").then(r => r.json()).then(j => j.success && setSum(j.data)); }, []);

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Finance</h1>
      <p className="text-sm text-gray-500 mb-6">Receivables from clients, payables to vendors. Money in, money out.</p>

      <section className="grid gap-3 md:grid-cols-2 mb-8">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3"><div className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Accounts Receivable</span></div>
          <div className="text-2xl font-semibold text-gray-900">₹{sum ? sum.ar.total.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</div>
          <div className="text-xs text-gray-500 mt-1">{sum?.ar.invoiceCount ?? 0} invoices · {sum?.ar.receiptCount ?? 0} receipts</div>
          {sum && sum.ar.overdue > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />Overdue: ₹{sum.ar.overdue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3"><div className="h-2 w-2 rounded-full bg-rose-500" /><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Accounts Payable</span></div>
          <div className="text-2xl font-semibold text-gray-900">₹{sum ? sum.ap.total.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</div>
          <div className="text-xs text-gray-500 mt-1">{sum?.ap.billCount ?? 0} bills · {sum?.ap.paymentCount ?? 0} payments</div>
          {sum && sum.ap.overdue > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />Overdue: ₹{sum.ap.overdue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Modules</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {MODULES.map(m => (
            <Link key={m.href} href={m.href} className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition">
              <div className={`p-2 rounded-lg ${m.color}`}><m.icon className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">{m.label}</div>
                <div className="text-xs text-gray-600 mt-0.5">{m.description}</div>
              </div>
              <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">LIVE</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
