/**
 * Investor Dashboard — committed / deployed / available + active deals.
 *
 * Wired in Sprint 4: pulls real VCInvestor data via getCurrentInvestor().
 */
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentInvestor } from "@/lib/investor-session";

export default async function InvestorDashboardPage() {
  const ctx = await getCurrentInvestor();
  if (!ctx) {
    return (
      <div className="px-6 py-12 max-w-2xl mx-auto text-center">
        <p className="text-sm text-gray-500">
          No investor profile found for your account. Contact your fund admin.
        </p>
      </div>
    );
  }

  const { tenantId, investorId, investorName } = ctx;

  const [commitments, allocations, repaymentSchedules] = await Promise.all([
    db.vCCommitment.findMany({
      where: { tenantId, investorId },
      select: { totalAmount: true, status: true },
    }),
    db.vCDealAllocation.findMany({
      where: { tenantId, investorId },
      include: {
        deal: {
          select: {
            id: true,
            currentStage: true,
            application: { select: { startupName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.vCRepaymentSchedule.findMany({
      where: { tenantId, investorId },
      select: { totalExpected: true, totalPaid: true, status: true },
    }),
  ]);

  const committed = commitments.reduce((s, c) => s + c.totalAmount, BigInt(0));
  const deployed = allocations.reduce((s, a) => s + a.amount, BigInt(0));
  const available = committed - deployed;
  const repaid = repaymentSchedules.reduce((s, r) => s + r.totalPaid, BigInt(0));

  const toLakhs = (n: bigint) => Number(n / BigInt(10_000_000));
  const fmt = (n: bigint) => `₹${toLakhs(n).toLocaleString("en-IN")}L`;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">{investorName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Capital commitments, deployed allocations, and active deals.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Committed" value={fmt(committed)} />
        <Stat label="Deployed" value={fmt(deployed)} />
        <Stat label="Available" value={fmt(available)} tone={available > 0n ? "success" : "neutral"} />
        <Stat label="Returned" value={fmt(repaid)} tone="success" />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Active deals</p>
          <Link href="/portfolio" className="text-xs text-gray-500 hover:text-gray-900">
            View all →
          </Link>
        </div>
        {allocations.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-500 text-center">
            No allocations yet. The VC team will notify you when a deal is ready for capital allocation.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2.5 text-left">Startup</th>
                <th className="px-5 py-2.5 text-left">Stage</th>
                <th className="px-5 py-2.5 text-right">Allocated</th>
                <th className="px-5 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {allocations.slice(0, 8).map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-5 py-3 font-medium text-gray-900">{a.deal.application.startupName}</td>
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
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${tone === "success" ? "text-green-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
