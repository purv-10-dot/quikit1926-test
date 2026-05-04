/**
 * Admin — Audit log viewer.
 *
 * Read-only feed of recent audit events. Top filter by outcome to surface
 * 403 denials quickly. Events are append-only and tenant-scoped.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

const OUTCOME_BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
  error: "bg-amber-100 text-amber-700",
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { outcome?: string; action?: string };
}) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const where: Record<string, unknown> = { orgId };
  if (searchParams.outcome) where.outcome = searchParams.outcome;
  if (searchParams.action) where.action = searchParams.action;

  const [events, counts] = await Promise.all([
    db.vCAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.vCAuditLog.groupBy({
      by: ["outcome"],
      where: { orgId },
      _count: { _all: true },
    }),
  ]);

  // Resolve actor names
  const userIds = Array.from(new Set(events.map((e) => e.userId).filter(Boolean) as string[]));
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  const countByOutcome = Object.fromEntries(counts.map((c) => [c.outcome, c._count._all]));

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">
      <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
        ← Admin
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Audit log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Append-only record of privileged actions and access denials.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <FilterTab href="/admin/audit-log" label="All" active={!searchParams.outcome} count={events.length} />
        {(["ok", "denied", "error"] as const).map((o) => (
          <FilterTab
            key={o}
            href={`/admin/audit-log?outcome=${o}`}
            label={o}
            active={searchParams.outcome === o}
            count={countByOutcome[o] ?? 0}
          />
        ))}
      </nav>

      {events.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No audit events yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">When</th>
                <th className="px-4 py-2.5 text-left">Actor</th>
                <th className="px-4 py-2.5 text-left">Action</th>
                <th className="px-4 py-2.5 text-left">Resource</th>
                <th className="px-4 py-2.5 text-center">Outcome</th>
                <th className="px-4 py-2.5 text-left">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const u = e.userId ? userById[e.userId] : null;
                return (
                  <tr key={e.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-2.5 text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {u ? `${u.firstName} ${u.lastName}` : <span className="text-gray-400">system</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-700">{e.action}</td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-500 font-mono truncate max-w-[160px]">
                      {e.resource ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                          OUTCOME_BADGE[e.outcome] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {e.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-500 font-mono">
                      {e.metadata ? (
                        <code className="block max-w-md truncate">{JSON.stringify(e.metadata)}</code>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
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
