/**
 * Admin landing — index of all admin sections.
 */
import Link from "next/link";

const SECTIONS = [
  {
    href: "/admin/verticals",
    title: "Verticals",
    desc: "Industry sectors used to scope deals and scoring.",
  },
  {
    href: "/admin/scoring-criteria",
    title: "Scoring criteria",
    desc: "Per-vertical AI scoring weights (must sum to 100%).",
  },
  {
    href: "/admin/ic-rules",
    title: "IC rules",
    desc: "IC voting mode, quorum, threshold + fund-level settings.",
  },
  {
    href: "/admin/term-sheet-template",
    title: "Term sheet template",
    desc: "Tenant-wide HTML template used to render every deal's term sheet.",
  },
  {
    href: "/admin/audit-log",
    title: "Audit log",
    desc: "Append-only record of privileged actions and access denials.",
  },
];

export default function AdminLandingPage() {
  return (
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Underwriting Setup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure verticals, scoring, IC rules, and the term-sheet template for your fund.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-slate-400 hover:shadow-sm transition"
          >
            <p className="text-base font-semibold text-gray-900">{s.title}</p>
            <p className="text-sm text-gray-500 mt-1">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
