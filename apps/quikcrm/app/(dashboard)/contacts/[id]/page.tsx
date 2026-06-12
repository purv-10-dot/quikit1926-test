/**
 * Contact 360 — server shell for /contacts/[id].
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { ContactDashboardShell } from "@/components/contacts/contact-dashboard-shell";
import { getFullContactRecord } from "@/lib/services/contacts/full-record";
import { STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";
import type { CrmOpportunityStage } from "@quikit/database";

const ADMIN_ROLE = "Administrator";

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return typeof d === "string" ? d : d.toISOString();
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const record = await getFullContactRecord({ user, contactId: id });
  if (!record) notFound();

  const isAdmin = user.role === ADMIN_ROLE;
  let contactsEdit = isAdmin;
  let contactsDelete = isAdmin;
  let activitiesCreate = isAdmin;
  let opportunitiesCreate = isAdmin;
  let canViewLeads = isAdmin;

  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId);
    if (matrix.length === 0) {
      contactsEdit = contactsDelete = activitiesCreate = opportunitiesCreate = canViewLeads = true;
    } else {
      contactsEdit = !!matrix.find((r) => r.module === "contacts")?.actions.includes("edit");
      contactsDelete = !!matrix.find((r) => r.module === "contacts")?.actions.includes("delete");
      activitiesCreate = !!matrix
        .find((r) => r.module === "activities")
        ?.actions.includes("create");
      opportunitiesCreate = !!matrix
        .find((r) => r.module === "opportunities")
        ?.actions.includes("create");
      canViewLeads = !!matrix.find((r) => r.module === "leads")?.actions.includes("view");
    }
  }

  const contactNotes = record.notes
    .filter(
      (n) =>
        n.relatedKind.toLowerCase() === "contact" && n.relatedObjectId === record.contact.id,
    )
    .map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
    }));

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
    notes: contactNotes,
    opportunities: record.opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: STAGE_LABEL[o.stage as CrmOpportunityStage] ?? o.stage,
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
      stage: o.stage,
      createdAt: o.createdAt,
    })),
    documents: record.attachments.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      createdAt: iso(d.createdAt)!,
    })),
  };

  return (
    <ContactDashboardShell
      contact={record.contact}
      account={record.account}
      lead={record.lead}
      snapshot={record.snapshot}
      timelineSeed={timelineSeed}
      overview={overview}
      initialNotes={contactNotes}
      permissions={{
        contactsEdit,
        contactsDelete,
        activitiesCreate,
        opportunitiesCreate,
        canViewLeads,
      }}
    />
  );
}
