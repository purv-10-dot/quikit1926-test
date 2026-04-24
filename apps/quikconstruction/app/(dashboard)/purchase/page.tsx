import Link from "next/link";
import { FileText, ShoppingCart, Clipboard, FileQuestion } from "lucide-react";

const LINKS = [
  { href: "/purchase/requisitions", label: "Purchase Requisitions", description: "Internal requests for materials with project + line items.", icon: FileText },
  { href: "/purchase/indents",      label: "Purchase Indents",      description: "Consolidated requests approvers review before PO.",           icon: Clipboard },
  { href: "/purchase/rfqs",         label: "RFQs",                  description: "Solicit quotes from multiple vendors for comparison.",        icon: FileQuestion },
  { href: "/purchase/orders",       label: "Purchase Orders",       description: "Formal orders issued to vendors. Can be created from a PR.", icon: ShoppingCart },
];

export default function PurchaseIndex() {
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Purchase</h1>
      <p className="text-sm text-gray-500 mb-6">
        Procurement pipeline — Requisitions → Indents → RFQs → Orders → GRN.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {LINKS.map((p) => (
          <Link key={p.href} href={p.href}
            className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition">
            <div className="p-2 rounded-lg bg-accent-50 text-accent-700"><p.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{p.label}</div>
              <div className="text-xs text-gray-600 mt-0.5">{p.description}</div>
            </div>
            <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">LIVE</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
