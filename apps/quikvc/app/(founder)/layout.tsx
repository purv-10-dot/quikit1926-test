/**
 * Founder portal layout — mobile-first, low cognitive load.
 *
 * Founders only see their own application + deal status. No internal jargon,
 * no risk/scoring visibility. Sprint 1 minimal shell; Sprint 2 wires real auth.
 */
import Link from "next/link";

const NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Application", href: "/application" },
  { label: "Documents", href: "/documents" },
  { label: "Questions", href: "/questions" },
];

export default function FounderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400">QuikVC</p>
          <p className="text-sm font-semibold text-gray-900">Startup Portal</p>
        </div>
        <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600">
          Sign out
        </button>
      </header>

      {/* Bottom-tab nav for mobile-first founders */}
      <nav className="bg-white border-b border-gray-200 flex overflow-x-auto px-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-4 py-3 text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap border-b-2 border-transparent hover:border-blue-500"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  );
}
