/**
 * Investor Portfolio — full list of allocations with current state.
 */
import { db } from "@/lib/db";
import { getCurrentInvestor } from "@/lib/investor-session";

export default async function InvestorPortfolioPage() {
  const ctx = await getCurrentInvestor();
  if (!ctx) {
    return <div className="px-6 py-12 text-center text-sm text-gray-500">No investor profile found.</div>;
  }
  const { tenantId, investorId } = ctx;

  const allocations = await db.vCDealAllocation.findMany({
    where: { tenantId, investorId },
    include: {
      deal: {
        select: {
          id: true,
          currentStage: true,
          application: { select: { startupName: true, loanType: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const fmt = (n: bigint) => `₹${Number(n / BigInt(10_000_000)).toLocaleString("en-IN")}L`;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">All deals you have capital deployed into.</p>
      </header>

      {allocations.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No allocations yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2.5 text-left">Startup</th>
                <th className="px-5 py-2.5 text-left">Instrument</th>
                <th className="px-5 py-2.5 text-left">Stage</th>
                <th className="px-5 py-2.5 text-right">Allocated</th>
                <th className="px-5 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-5 py-3 font-medium text-gray-900">{a.deal.application.startupName}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">{a.deal.application.loanType ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">{a.deal.currentStage}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-900">{fmt(a.amount)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {a.status}
                    </span>
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
