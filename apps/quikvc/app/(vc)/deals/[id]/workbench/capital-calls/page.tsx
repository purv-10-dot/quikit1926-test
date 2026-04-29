/**
 * Capital Calls tab — issue calls against allocations + record payments.
 *
 * Capital calls are the funding-side of an allocation: once an allocation
 * is confirmed, the fund admin issues a call to the investor for actual
 * cash transfer. Calls track due date, status (issued/partial/paid/overdue),
 * and accumulated payments.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { getVCRole, CAPITAL_OPS_ROLES } from "@/lib/rbac";
import CapitalCallsClient from "./capital-calls-client";

export default async function CapitalCallsPage({ params }: { params: { id: string } }) {
  const { userId, tenantId } = await requireSession();
  if (!tenantId) notFound();

  const role = await getVCRole(userId, tenantId);
  const canManage = role !== null && CAPITAL_OPS_ROLES.includes(role);

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true,
      application: { select: { startupName: true } },
      allocations: {
        include: { investor: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!deal) notFound();

  // Capital calls joined via allocationId
  const allocationIds = deal.allocations.map((a) => a.id);
  const calls = allocationIds.length
    ? await db.vCCapitalCall.findMany({
        where: { tenantId, allocationId: { in: allocationIds } },
        include: {
          investor: { select: { id: true, name: true } },
          payments: { orderBy: { paidAt: "desc" } },
        },
        orderBy: { dueDate: "desc" },
      })
    : [];

  const allocationsSerialized = deal.allocations.map((a) => ({
    id: a.id,
    investorId: a.investorId,
    investorName: a.investor.name,
    amountLakhs: Number(a.amount / BigInt(10_000_000)),
  }));

  const callsSerialized = calls.map((c) => ({
    id: c.id,
    investorId: c.investorId,
    investorName: c.investor.name,
    allocationId: c.allocationId,
    amountLakhs: Number(c.amount / BigInt(10_000_000)),
    paidLakhs: Number(c.paidAmount / BigInt(10_000_000)),
    dueDate: c.dueDate.toISOString(),
    status: c.status,
    paidAt: c.paidAt?.toISOString() ?? null,
    notes: c.notes,
    payments: c.payments.map((p) => ({
      id: p.id,
      amountLakhs: Number(p.amount / BigInt(10_000_000)),
      paidAt: p.paidAt.toISOString(),
      reference: p.reference,
    })),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-gray-900">Capital Calls</h2>
        <p className="text-sm text-gray-500 mt-1">
          Issue calls against confirmed allocations and record received payments.
          Calls flow: <strong>issued → partial → paid</strong>.
        </p>
      </header>

      {deal.allocations.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          No allocations yet. Allocate capital from the Funding tab first.
        </div>
      ) : (
        <CapitalCallsClient
          dealId={deal.id}
          startupName={deal.application.startupName}
          allocations={allocationsSerialized}
          calls={callsSerialized}
          canManage={canManage}
          viewerRole={role ?? "—"}
        />
      )}
    </div>
  );
}
