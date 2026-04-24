import Link from "next/link";
import { Inbox, ListChecks } from "lucide-react";

const MODS = [
  { href: "/approvals/inbox", label: "My Inbox", description: "Approval requests waiting for your decision.", icon: Inbox },
  { href: "/approvals/rules", label: "Rules", description: "Who approves what, above what threshold.", icon: ListChecks },
];

export default function ApprovalsIndex() {
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Approvals</h1>
      <p className="text-sm text-gray-500 mb-6">Generic approval workflow for documents that need sign-off.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {MODS.map(m => (
          <Link key={m.href} href={m.href} className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-white hover:border-accent-300 hover:shadow-sm transition">
            <div className="p-2 rounded-lg bg-accent-50 text-accent-700"><m.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{m.label}</div>
              <div className="text-xs text-gray-600 mt-0.5">{m.description}</div>
            </div>
            <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">LIVE</span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-6">MVP: approval requests are advisory — upstream modules (PR/PO/RAB/Bill) currently don't hard-gate on pending approvals. Integration hooks can be wired in a later phase.</p>
    </div>
  );
}
