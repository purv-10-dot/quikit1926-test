/**
 * Investor portal layout — desktop dashboards + mobile-friendly summary view.
 *
 * Investors (LP / HNI / Angel) see only their own commitments, allocations,
 * and repayments — never other investors' positions.
 */
import Link from "next/link";
import NotificationBell from "@/components/notification-bell";
import { requireSession } from "@/lib/require-session";

const NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Repayments", href: "/repayments" },
];

export default async function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hardened: redirects to /login when no session. The portal reveals
  // private commitment + payment data, so no anonymous access.
  await requireSession();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">QuikVC</p>
            <p className="text-sm font-semibold text-gray-900">Investor Portal</p>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
