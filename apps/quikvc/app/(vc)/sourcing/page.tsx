/**
 * Sourcing dashboard — inbound deal flow before formal application.
 *
 * Lists VCSourcedOpportunity rows. Filters by status. Manual add + CSV upload
 * via SourcingActions. Click a row → detail page with thesis-fit + convert.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import SourcingActions from "./sourcing-actions";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  reviewing: "bg-amber-100 text-amber-700",
  qualified: "bg-green-100 text-green-700",
  converted: "bg-purple-100 text-purple-700",
  rejected: "bg-gray-100 text-gray-600",
};

export default async function SourcingPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const statusFilter = searchParams.status;
  const where: Record<string, string> = { tenantId };
  if (statusFilter) where.status = statusFilter;

  const items = await db.vCSourcedOpportunity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { vertical: { select: { id: true, name: true } } },
    take: 200,
  });

  const counts = await db.vCSourcedOpportunity.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { _all: true },
  });
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sourcing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Inbound deal-flow before a startup submits a formal application.
          </p>
        </div>
        <SourcingActions />
      </header>

      <nav className="flex flex-wrap gap-2">
        <FilterTab href="/sourcing" label="All" active={!statusFilter} count={items.length} />
        {(["new", "reviewing", "qualified", "converted", "rejected"] as const).map((s) => (
          <FilterTab
            key={s}
            href={`/sourcing?status=${s}`}
            label={s}
            active={statusFilter === s}
            count={countByStatus[s] ?? 0}
          />
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No opportunities yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add manually or import a CSV to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2.5 text-left">Startup</th>
                <th className="px-5 py-2.5 text-left">Vertical</th>
                <th className="px-5 py-2.5 text-left">Source</th>
                <th className="px-5 py-2.5 text-right">Fit</th>
                <th className="px-5 py-2.5 text-center">Status</th>
                <th className="px-5 py-2.5 text-right">Added</th>
              </tr>
            </thead>
            <tbody>
              {items.map((opp) => (
                <tr key={opp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/sourcing/${opp.id}`} className="font-medium text-gray-900 hover:underline">
                      {opp.startupName}
                    </Link>
                    {opp.contactName && (
                      <p className="text-[11px] text-gray-500 mt-0.5">{opp.contactName}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-700">{opp.vertical?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500">{opp.source}</td>
                  <td className="px-5 py-3 text-right">
                    {opp.thesisFitScore != null ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium tabular-nums",
                          opp.thesisFitScore >= 80
                            ? "bg-green-100 text-green-700"
                            : opp.thesisFitScore >= 60
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700",
                        )}
                      >
                        {opp.thesisFitScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                        STATUS_BADGE[opp.status] ?? "bg-gray-100 text-gray-600",
                      )}
                    >
                      {opp.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] text-gray-500 tabular-nums">
                    {new Date(opp.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit", month: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterTab({ href, label, active, count }: { href: string; label: string; active: boolean; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-medium border",
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
      )}
    >
      {label}
      <span className={cn("ml-1.5 tabular-nums", active ? "text-slate-300" : "text-gray-400")}>
        {count}
      </span>
    </Link>
  );
}
