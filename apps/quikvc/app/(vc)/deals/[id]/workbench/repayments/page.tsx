/**
 * Repayments tab — per-deal repayment schedules + payments.
 *
 * Shows schedules per investor allocation. Allows creating EMI/RBF/Equity-Exit
 * schedules and recording inbound payments.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import RepaymentsClient from "./repayments-client";
import { getVCRole, CAPITAL_OPS_ROLES } from "@/lib/rbac";

export default async function RepaymentsPage({ params }: { params: { id: string } }) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) notFound();

  const viewerRole = await getVCRole(userId, tenantId);
  const canManage = viewerRole !== null && CAPITAL_OPS_ROLES.includes(viewerRole);

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true,
      application: { select: { startupName: true, loanType: true, tenureMonths: true } },
      allocations: {
        include: { investor: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!deal) notFound();

  const schedules = await db.vCRepaymentSchedule.findMany({
    where: { tenantId, dealId: deal.id },
    include: {
      investor: { select: { id: true, name: true } },
      payments: { orderBy: { paidAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Allocations without an active schedule (pickable for new schedule)
  const scheduledInvestorIds = new Set(
    schedules.filter((s) => s.status === "active").map((s) => s.investorId),
  );
  const allocationsWithoutSchedule = deal.allocations
    .filter((a) => !scheduledInvestorIds.has(a.investorId))
    .map((a) => ({
      investorId: a.investorId,
      investorName: a.investor.name,
      amountLakhs: Number(a.amount / BigInt(10_000_000)),
    }));

  const schedulesSerialized = schedules.map((s) => ({
    id: s.id,
    type: s.type,
    status: s.status,
    investorId: s.investorId,
    investorName: s.investor.name,
    totalExpectedLakhs: Number(s.totalExpected / BigInt(10_000_000)),
    totalPaidLakhs: Number(s.totalPaid / BigInt(10_000_000)),
    payments: s.payments.map((p) => ({
      id: p.id,
      amountLakhs: Number(p.amount / BigInt(10_000_000)),
      paidAt: p.paidAt.toISOString(),
      category: p.category,
      reference: p.reference,
    })),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-gray-900">Repayments</h2>
        <p className="text-sm text-gray-500 mt-1">
          Schedule and record repayments from {deal.application.startupName} back to investors.
        </p>
      </header>

      <RepaymentsClient
        dealId={deal.id}
        defaultLoanType={deal.application.loanType ?? "term-loan"}
        defaultTenureMonths={deal.application.tenureMonths ?? 24}
        schedules={schedulesSerialized}
        allocationsWithoutSchedule={allocationsWithoutSchedule}
        canManage={canManage}
      />
      {!canManage && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600">
          Read-only view. Schedule creation and payment recording are restricted to
          Partners and Fund Admins (your role: {viewerRole ?? "none"}).
        </div>
      )}
    </div>
  );
}
