import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { LeadDashboardShell } from "@/components/leads/lead-dashboard-shell";
import { getFullLeadRecord } from "@/lib/services/leads/full-record";
import { STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";
import type { CrmOpportunityStage } from "@prisma/client";
import { formatGeneric } from "@/lib/services/opportunities/currency";
import { LeadDashboardSkeleton } from "@/components/leads/dashboard/skeleton";

const ADMIN_ROLE = "Administrator";

interface Props {
  params: Promise<{ id: string }>;
}

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return typeof d === "string" ? d : d.toISOString();
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  const [record, dispositions] = await Promise.all([
    getFullLeadRecord({ user, leadId: id }),
    prisma.crmCallDisposition.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, label: true },
    }),
  ]);
  if (!record) notFound();

  const lead = record.lead;
  const isTrashed = Boolean(lead.deletedAt);
  const isAdmin = user.role === ADMIN_ROLE;

  let canEdit = isAdmin;
  let canLogActivity = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId);
    if (matrix.length === 0) {
      canEdit = canLogActivity = true;
    } else {
      const leadsRow = matrix.find((r) => r.module === "leads");
      canEdit = !!leadsRow?.actions.includes("edit");
      const activitiesRow = matrix.find((r) => r.module === "activities");
      canLogActivity = !!activitiesRow?.actions.includes("create");
    }
  }

  const overview = {
    activities: record.activities.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      outcome: a.outcome,
      ownerName: a.ownerName,
      occurredAt: iso(a.occurredAt),
    })),
    tasks: record.tasks.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      dueDate: iso(t.dueDate),
    })),
    notes: record.notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: iso(n.createdAt)!,
    })),
    opportunities: record.opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: STAGE_LABEL[o.stage as CrmOpportunityStage] ?? o.stage,
      amountDisplay:
        o.amount != null ? formatGeneric(Number(o.amount), o.currency ?? "INR") : null,
    })),
  };

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
    callLogs: record.callLogs.map((c) => ({
      id: c.id,
      direction: c.direction,
      status: c.status,
      durationSec: c.durationSec,
      startTime: c.startTime,
      createdAt: c.createdAt,
    })),
    notes: record.notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
    })),
    tasks: record.tasks.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
    })),
    opportunities: record.opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: STAGE_LABEL[o.stage as CrmOpportunityStage] ?? o.stage,
      createdAt: o.createdAt,
    })),
    documents: record.attachments.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      createdAt: iso(d.createdAt)!,
    })),
  };

  return (
    <Suspense fallback={<LeadDashboardSkeleton />}>
      <LeadDashboardShell
        lead={{
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          mobile: lead.mobile,
          company: lead.company,
          jobTitle: lead.jobTitle,
          source: lead.source,
          stage: lead.stage,
          status: lead.status,
          substatus: lead.substatus,
          score: lead.score,
          country: lead.country,
          ownerId: lead.ownerId,
          ownerName: lead.ownerName,
          accountId: lead.accountId,
          account: lead.account,
          followupPriority: lead.followupPriority,
          dynamicFields: (lead.dynamicFields as Record<string, unknown> | null) ?? null,
          isStarred: lead.isStarred,
          isDisengaged: lead.isDisengaged,
          leadQuality: lead.leadQuality,
          convertedAt: iso(lead.convertedAt),
          createdAt: iso(lead.createdAt)!,
          updatedAt: iso(lead.updatedAt)!,
          linkedContactId: lead.linkedContactId,
          industry: lead.industry,
          website: lead.website,
        }}
        snapshot={record.snapshot}
        insights={record.insights}
        analytics={record.analytics}
        pipelineStages={record.pipelineStages}
        pipelineStatuses={record.pipelineStatuses}
        timelineSeed={timelineSeed}
        overview={overview}
        dispositionSections={dispositions}
        deletedAt={iso(lead.deletedAt)}
        isTrashed={isTrashed}
        isAdmin={isAdmin}
        canEdit={canEdit}
        canLogActivity={canLogActivity}
      />
    </Suspense>
  );
}
