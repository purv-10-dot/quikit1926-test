/**
 * Funding tab — capital allocation against a deal.
 *
 * Shows: funding ask, allocated total, gap, list of allocations per investor.
 * Action: allocate from investor pool (pickable list with available balance).
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import AllocateForm from "./allocate-form";
import { cn } from "@/lib/utils";
import { getVCRole, CAPITAL_OPS_ROLES } from "@/lib/rbac";

export default async function FundingPage({ params }: { params: { id: string } }) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) notFound();

  const viewerRole = await getVCRole(userId, tenantId);
  const canAllocate = viewerRole !== null && CAPITAL_OPS_ROLES.includes(viewerRole);

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true,
      allocatedAmount: true,
      application: { select: { fundingAsk: true, startupName: true, loanType: true } },
      allocations: {
        include: { investor: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!deal) notFound();

  // Investors with available balance for the picker
  const investors = await db.vCInvestor.findMany({
    where: { tenantId },
    include: {
      commitments: { select: { totalAmount: true } },
      allocations: { select: { amount: true } },
    },
    orderBy: { name: "asc" },
  });

  const investorOptions = investors
    .map((inv) => {
      const committed = inv.commitments.reduce((s, c) => s + c.totalAmount, BigInt(0));
      const allocated = inv.allocations.reduce((s, a) => s + a.amount, BigInt(0));
      const available = committed - allocated;
      return {
        id: inv.id,
        name: inv.name,
        type: inv.type,
        availableLakhs: Number(available / BigInt(10_000_000)),
      };
    })
    .filter((i) => i.availableLakhs > 0);

  const askLakhs = deal.application.fundingAsk
    ? Number(deal.application.fundingAsk / BigInt(10_000_000))
    : 0;
  const allocatedLakhs = Number(deal.allocatedAmount / BigInt(10_000_000));
  const gapLakhs = Math.max(0, askLakhs - allocatedLakhs);
  const fundedPct = askLakhs > 0 ? Math.min(100, Math.round((allocatedLakhs / askLakhs) * 100)) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-gray-900">Funding</h2>
        <p className="text-sm text-gray-500 mt-1">
          Allocate capital from your investor pool to {deal.application.startupName}.
        </p>
      </header>

      {/* Funding progress */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Stat label="Ask" value={`₹${askLakhs.toLocaleString("en-IN")}L`} />
          <Stat
            label="Allocated"
            value={`₹${allocatedLakhs.toLocaleString("en-IN")}L`}
            tone={fundedPct >= 100 ? "success" : "neutral"}
          />
          <Stat
            label="Gap"
            value={`₹${gapLakhs.toLocaleString("en-IN")}L`}
            tone={gapLakhs > 0 ? "warning" : "success"}
          />
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              fundedPct >= 100 ? "bg-green-500" : "bg-blue-500",
            )}
            style={{ width: `${fundedPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {fundedPct}% funded · {deal.application.loanType ?? "—"}
        </p>
      </section>

      {/* Allocate form — capital-ops roles only */}
      {gapLakhs > 0 && canAllocate && investorOptions.length > 0 && (
        <AllocateForm
          dealId={deal.id}
          gapLakhs={gapLakhs}
          investors={investorOptions}
        />
      )}
      {gapLakhs > 0 && canAllocate && investorOptions.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          No investors with available balance. Add an investor + commitment in{" "}
          <a className="underline" href="/investors">
            Investors
          </a>{" "}
          first.
        </div>
      )}
      {gapLakhs > 0 && !canAllocate && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600">
          Read-only view. Capital allocation is restricted to Partners and Fund Admins
          (your role: {viewerRole ?? "none"}).
        </div>
      )}

      {/* Existing allocations */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Allocations</h3>
        {deal.allocations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-500">No allocations yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Investor</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {deal.allocations.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{a.investor.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{a.investor.type}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      ₹{Number(a.amount / BigInt(10_000_000)).toLocaleString("en-IN")}L
                    </td>
                    <td className="px-4 py-3 text-center">
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
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums mt-0.5",
          tone === "success" ? "text-green-600" : tone === "warning" ? "text-amber-600" : "text-gray-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
