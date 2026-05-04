/**
 * Investor list — VC portal.
 *
 * Shows all investors per tenant with rolled-up commitment + allocation
 * totals + KYC status. Sprint 4: list + add. Sprint 4b adds detail page
 * with capital call lifecycle.
 */
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import InvestorAddButton from "./investor-add-button";
import { cn } from "@/lib/utils";

const TYPE_BADGE: Record<string, string> = {
  lp: "bg-purple-100 text-purple-700 border-purple-200",
  hni: "bg-blue-100 text-blue-700 border-blue-200",
  angel: "bg-amber-100 text-amber-700 border-amber-200",
};

const KYC_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  verified: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default async function InvestorsPage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) return null;

  const investors = await db.vCInvestor.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      commitments: { select: { totalAmount: true, status: true } },
      allocations: { select: { amount: true } },
      _count: { select: { capitalCalls: true } },
    },
  });

  // Roll up totals per investor (in lakhs for display)
  const rows = investors.map((inv) => {
    const committed = inv.commitments.reduce((sum, c) => sum + c.totalAmount, BigInt(0));
    const allocated = inv.allocations.reduce((sum, a) => sum + a.amount, BigInt(0));
    return {
      id: inv.id,
      name: inv.name,
      type: inv.type,
      kycStatus: inv.kycStatus,
      email: inv.email,
      committedLakhs: Number(committed / BigInt(10_000_000)),
      allocatedLakhs: Number(allocated / BigInt(10_000_000)),
      capitalCallCount: inv._count.capitalCalls,
    };
  });

  return (
    <div className="px-6 py-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Investors</h1>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} {rows.length === 1 ? "investor" : "investors"} ·{" "}
            ₹{rows.reduce((s, r) => s + r.committedLakhs, 0).toLocaleString("en-IN")}L committed ·
            ₹{rows.reduce((s, r) => s + r.allocatedLakhs, 0).toLocaleString("en-IN")}L deployed
          </p>
        </div>
        <InvestorAddButton />
      </header>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No investors yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Click &ldquo;Add investor&rdquo; above to create the first record.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left w-20">Type</th>
                <th className="px-4 py-2.5 text-right">Committed</th>
                <th className="px-4 py-2.5 text-right">Deployed</th>
                <th className="px-4 py-2.5 text-right">Available</th>
                <th className="px-4 py-2.5 text-center w-24">KYC</th>
                <th className="px-4 py-2.5 text-center w-20">Calls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/investors/${r.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {r.name}
                    </Link>
                    {r.email && (
                      <p className="text-xs text-gray-500 mt-0.5">{r.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border", TYPE_BADGE[r.type])}>
                      {r.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    ₹{r.committedLakhs.toLocaleString("en-IN")}L
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    ₹{r.allocatedLakhs.toLocaleString("en-IN")}L
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900 font-medium">
                    ₹{(r.committedLakhs - r.allocatedLakhs).toLocaleString("en-IN")}L
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border", KYC_BADGE[r.kycStatus])}>
                      {r.kycStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{r.capitalCallCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
