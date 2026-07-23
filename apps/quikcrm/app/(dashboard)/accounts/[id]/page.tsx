/**
 * Account 360 — server shell for /accounts/[id].
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { AccountDashboardShell } from "@/components/accounts/account-dashboard-shell";
import { mapAccountOpportunitiesForOverview } from "@/lib/services/accounts/overview-map";
import { getFullAccountRecord } from "@/lib/services/accounts/full-record";

const ADMIN_ROLE = "Administrator";

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return typeof d === "string" ? d : d.toISOString();
}


export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const record = await getFullAccountRecord({ user, accountId: id });
  if (!record) notFound();

  const isAdmin = user.role === ADMIN_ROLE;
  let accountsEdit = isAdmin;
  let leadsCreate = isAdmin;
  let leadsEdit = isAdmin;
  let activitiesCreate = isAdmin;
  let contactsCreate = isAdmin;
  let opportunitiesCreate = isAdmin;

  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId);
    if (matrix.length === 0) {
      accountsEdit =
        leadsCreate =
        leadsEdit =
        activitiesCreate =
        contactsCreate =
        opportunitiesCreate =
          true;
    } else {
      accountsEdit = !!matrix.find((r) => r.module === "accounts")?.actions.includes("edit");
      leadsCreate = !!matrix.find((r) => r.module === "leads")?.actions.includes("create");
      leadsEdit = !!matrix.find((r) => r.module === "leads")?.actions.includes("edit");
      activitiesCreate = !!matrix
        .find((r) => r.module === "activities")
        ?.actions.includes("create");
      contactsCreate = !!matrix.find((r) => r.module === "contacts")?.actions.includes("create");
      opportunitiesCreate = !!matrix
        .find((r) => r.module === "opportunities")
        ?.actions.includes("create");
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
    contacts: record.contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      title: c.title,
    })),
    leads: record.leads,
    opportunities: mapAccountOpportunitiesForOverview(record.opportunities),
    notes: record.notes,
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
    <AccountDashboardShell
      account={record.account}
      parent={record.parent}
      subsidiaries={record.subsidiaries}
      snapshot={record.snapshot}
      timelineSeed={timelineSeed}
      overview={overview}
      initialLeads={record.leads}
      initialNotes={record.notes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: iso(n.createdAt)!,
      }))}
      scoreHistory={record.scoreHistory}
      permissions={{
        accountsEdit,
        leadsCreate,
        leadsEdit,
        activitiesCreate,
        contactsCreate,
        opportunitiesCreate,
      }}
    />
  );
}
