/**
 * Investor Repayments — schedules + payment history for the current investor.
 */
import { db } from "@/lib/db";
import { getCurrentInvestor } from "@/lib/investor-session";
import { cn } from "@/lib/utils";

export default async function InvestorRepaymentsPage() {
  const ctx = await getCurrentInvestor();
  if (!ctx) {
    return <div className="px-6 py-12 text-center text-sm text-gray-500">No investor profile found.</div>;
  }
  const { orgId, investorId } = ctx;

  const schedules = await db.vCRepaymentSchedule.findMany({
    where: { orgId, investorId },
    include: {
      payments: { orderBy: { paidAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve startup name per schedule via dealId (no FK relation in schema)
  const dealIds = Array.from(new Set(schedules.map((s) => s.dealId)));
  const deals = dealIds.length
    ? await db.vCDeal.findMany({
        where: { orgId, id: { in: dealIds } },
        select: { id: true, application: { select: { startupName: true } } },
      })
    : [];
  const dealNameById = new Map(deals.map((d) => [d.id, d.application.startupName]));

  const fmt = (n: bigint) => `₹${Number(n / BigInt(10_000_000)).toLocaleString("en-IN")}L`;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Repayments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Repayment schedules and payment history across your portfolio.
        </p>
      </header>

      {schedules.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No repayment schedules yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((s) => {
            const expectedL = Number(s.totalExpected / BigInt(10_000_000));
            const paidL = Number(s.totalPaid / BigInt(10_000_000));
            const pct = expectedL > 0 ? Math.min(100, Math.round((paidL / expectedL) * 100)) : 0;
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {dealNameById.get(s.dealId) ?? "—"}
                    </p>
                    <div className="flex gap-2 mt-1 items-center">
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {s.type}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded",
                          s.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : s.status === "defaulted"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700",
                        )}
                      >
                        {s.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Received / Expected</p>
                    <p className="text-base font-semibold tabular-nums text-gray-900">
                      {fmt(s.totalPaid)} / {fmt(s.totalExpected)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all", pct >= 100 ? "bg-green-500" : "bg-blue-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {s.payments.length > 0 && (
                  <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                    {s.payments.map((p) => (
                      <li key={p.id} className="py-2 flex items-center justify-between text-xs">
                        <span className="text-gray-700">
                          {new Date(p.paidAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}
                          <span className="text-gray-500">{p.category}</span>
                          {p.reference && <span className="text-gray-400 ml-1">· {p.reference}</span>}
                        </span>
                        <span className="tabular-nums text-gray-900 font-medium">{fmt(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
