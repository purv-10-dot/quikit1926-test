import Link from "next/link";
import {
  PackageCheck, PackageMinus, Warehouse,
  PackageX, Undo2, ArrowLeftRight, Scale, Fuel, DoorOpen,
} from "lucide-react";

const CORE = [
  { href: "/store/grn",            label: "GRN (Goods Receipt)", description: "Receive materials against a PO. Writes stock ledger on post.", icon: PackageCheck },
  { href: "/store/material-issue", label: "Material Issue",     description: "Issue stock to project/site. Writes negative ledger on post.",  icon: PackageMinus },
  { href: "/store/stock-register", label: "Stock Register",     description: "Current balance per item × location.",                         icon: Warehouse    },
];

const EXTENDED = [
  { href: "/store/good-return",           label: "Good Return (Vendor)",   description: "Return defective stock to vendor. Reverses GRN ledger.",   icon: PackageX },
  { href: "/store/internal-return",       label: "Internal Return",        description: "Unused stock returns from issue. Writes stock back in.",   icon: Undo2 },
  { href: "/store/stock-transfer",        label: "Stock Transfer",         description: "Move stock between locations. Paired ledger rows.",        icon: ArrowLeftRight },
  { href: "/store/stock-reconciliation",  label: "Stock Reconciliation",   description: "Physical count adjustments. Writes +/- adjustment rows.",  icon: Scale },
  { href: "/store/gate-pass",             label: "Gate Pass",              description: "In/out gate register. Links to GRN/Issue/Return.",         icon: DoorOpen },
  { href: "/store/diesel-log",            label: "Diesel Log",             description: "Fuel consumption per machine/vehicle.",                    icon: Fuel },
];

export default function StoreIndex() {
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Store</h1>
      <p className="text-sm text-gray-500 mb-6">
        Inventory — every stock write goes through <code className="bg-gray-100 px-1 rounded text-xs">CnStockLedger</code> inside a DB transaction.
      </p>

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Core P2P</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {CORE.map((p) => (
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
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Extended (Phase 3b)</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {EXTENDED.map((p) => (
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
      </section>
    </div>
  );
}
