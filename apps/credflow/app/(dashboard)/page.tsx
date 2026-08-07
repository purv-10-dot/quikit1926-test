import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * QuikCRM home dashboard — KPI cards + module quick links.
 *
 * MVP: counts only the entities whose modules have been ported so far. Add a
 * card per module as it lands (accounts, contacts, activities, etc.).
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.orgId;
  const userName = session?.user?.name ?? session?.user?.email ?? "";

  const [leadCount] = orgId
    ? await Promise.all([db.qcfLead.count({ where: { orgId } })])
    : [0];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-sm text-gray-500 mt-1">
          Signed in as <span className="font-medium">{userName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Leads" value={leadCount} href="/leads" />
        <KpiCard label="Accounts" value="—" href="#" disabled />
        <KpiCard label="Contacts" value="—" href="#" disabled />
        <KpiCard label="Activities" value="—" href="#" disabled />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <p className="font-medium mb-1">Migration in progress</p>
        <p className="text-amber-800">
          QuikCRM is being ported from the standalone repo into the QuikIT
          monorepo module by module. Only the Leads module is wired so far.
          Accounts, Contacts, Activities, Automations, Imports, and Telephony
          will land in follow-up PRs.
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  href,
  disabled = false,
}: {
  label: string;
  value: number | string;
  href: string;
  disabled?: boolean;
}) {
  const card = (
    <div
      className={`bg-white border border-gray-200 rounded-lg p-5 ${
        disabled ? "opacity-50" : "hover:border-accent-300 hover:shadow-sm transition-all"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {disabled && <p className="mt-1 text-[10px] text-gray-400">Coming soon</p>}
    </div>
  );
  return disabled ? card : <Link href={href}>{card}</Link>;
}
