/**
 * VC / Fund portal layout.
 *
 * Used by Analyst, Partner, Fund Admin, IC Member roles. Three-pane shell:
 * left rail (nav), top context bar (tenant + fund + search), main content.
 *
 * Sprint 1 ships a minimal shell; Sprint 2 wires real navigation from the
 * module registry, tenant/fund switcher, and the global command palette.
 */
import Link from "next/link";

const NAV_ITEMS = [
  { label: "Home", href: "/home" },
  { label: "Sourcing", href: "/sourcing" },
  { label: "Deals", href: "/deals" },
  { label: "Investors", href: "/investors" },
  { label: "Admin", href: "/admin" },
];

export default function VCLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left rail — slim nav */}
      <aside className="w-56 bg-slate-900 text-slate-100 flex-shrink-0 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs uppercase tracking-wider text-slate-400">QuikVC OS</p>
          <p className="text-sm font-semibold mt-0.5">VC / Fund</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-5 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-400">
          Sprint 1 shell — auth wiring in Sprint 2
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top context bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-gray-900">ValleyNXT Ventures</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">Fund I</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Search…
            </button>
            <button className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800">
              + New Deal
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
