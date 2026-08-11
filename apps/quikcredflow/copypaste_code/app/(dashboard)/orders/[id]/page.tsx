/**
 * Order 360 — server shell for /orders/[id].
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { OrderDashboardShell } from "@/components/orders/order-dashboard-shell";
import { getFullOrderRecord } from "@/lib/services/orders/full-record";

const ADMIN_ROLE = "Administrator";

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return typeof d === "string" ? d : d.toISOString();
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const record = await getFullOrderRecord({ user, orderId: id });
  if (!record) notFound();

  const isAdmin = user.role === ADMIN_ROLE;
  let canEdit = isAdmin;

  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId);
    if (matrix.length === 0) {
      canEdit = true;
    } else {
      canEdit = !!matrix.find((r) => r.module === "quotes")?.actions.includes("edit");
    }
  }

  const overviewActivities = record.activities.slice(0, 20).map((a) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    outcome: a.outcome,
    ownerName: a.ownerName,
    occurredAt: iso(a.occurredAt),
  }));

  const timelineSeed = {
    activities: record.activities.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      outcome: a.outcome,
      ownerName: a.ownerName,
      occurredAt: a.occurredAt,
      createdAt: a.createdAt,
      activityCode: a.activityCode,
      detailNotes: a.detailNotes,
    })),
    callLogs: [],
    notes: [],
    tasks: [],
    opportunities: [],
    documents: record.attachments.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      createdAt: iso(d.createdAt)!,
    })),
  };

  return (
    <OrderDashboardShell
      order={record.order}
      account={record.account}
      contact={record.contact}
      opportunity={record.opportunity}
      snapshot={record.snapshot}
      timelineSeed={timelineSeed}
      overviewActivities={overviewActivities}
      permissions={{ canEdit }}
    />
  );
}
