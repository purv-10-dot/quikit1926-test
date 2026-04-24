import Link from "next/link";
import { TrendingUp, Boxes, Clock, Clock3, Star } from "lucide-react";

const MODS = [
  { href: "/reports/project-pnl", label: "Project P&L", description: "Revenue − costs per project (from invoices + vendor bills).", icon: TrendingUp },
  { href: "/reports/stock-valuation", label: "Stock Valuation", description: "Current quantity × moving-avg rate, per project/location/item.", icon: Boxes },
  { href: "/reports/ar-aging", label: "AR Aging", description: "Client dues by 0/30/60/90/90+ bucket.", icon: Clock },
  { href: "/reports/ap-aging", label: "AP Aging", description: "Vendor dues by 0/30/60/90/90+ bucket.", icon: Clock3 },
  { href: "/reports/vendor-performance", label: "Vendor Performance", description: "On-time delivery %, quality acceptance %, amounts.", icon: Star },
];

export default function ReportsIndex() {
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Reports</h1>
      <p className="text-sm text-gray-500 mb-6">Read-only analytics over all modules.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {MODS.map(m => (
          <Link key={m.href} href={m.href} className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition">
            <div className="p-2 rounded-lg bg-accent-50 text-accent-700"><m.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{m.label}</div>
              <div className="text-xs text-gray-600 mt-0.5">{m.description}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
