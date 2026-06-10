import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StagePill } from "@/components/opportunities/stage-pill";
import { formatGeneric, toNumber } from "@/lib/services/opportunities/currency";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { NewQuoteFromOpportunityButton } from "@/components/quotes/new-quote-from-opportunity-button";
import { EntityDocumentsCard } from "@/components/documents/entity-documents-card";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const o = await prisma.crmOpportunity.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      account: true,
      clientMeetings: { orderBy: { meetingAt: "desc" } },
      products: { orderBy: { sortOrder: "asc" } },
      transitions: { orderBy: { occurredAt: "desc" }, take: 30 },
    },
  });
  if (!o) notFound();

  const lead = o.leadId
    ? await prisma.crmLead.findFirst({
        where: { id: o.leadId, orgId: user.orgId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          mobile: true,
          company: true,
          stage: true,
          status: true,
          source: true,
          ownerName: true,
          contacts: {
            select: { id: true, firstName: true, lastName: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      })
    : null;

  const linkedContact = lead?.contacts[0] ?? null;

  // Pull quotes linked to this opportunity. Separate query (not an include)
  // because CrmQuote → CrmOpportunity isn't a typed Prisma relation —
  // `opportunityId` is a bare String, same convention as the rest of the
  // CRM (see schema.prisma CrmOpportunity.accountId comment for the
  // cross-schema-FK rationale). Soft-delete is auto-filtered by the
  // middleware. Limited to 50 — enough for any sane Opportunity.
  const quotes = await prisma.crmQuote.findMany({
    where: { orgId: user.orgId, opportunityId: o.id },
    select: {
      id: true,
      quoteNumber: true,
      versionNumber: true,
      status: true,
      grandTotal: true,
      currency: true,
      effectiveFrom: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  const amountNumber = o.amount == null ? null : toNumber(o.amount);
  const amountDisplay = formatGeneric(amountNumber, (o.currency ?? "INR").toUpperCase());

  return (
    <div>
      <Link
        href="/opportunities"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-crm-muted hover:text-crm-text"
      >
        <ArrowLeft size={14} /> Back to opportunities
      </Link>
      <PageHeader
        title={o.name}
        subtitle={o.account?.name ? `${o.account.name}` : undefined}
      />
      <div className="mb-4 flex items-center gap-3">
        <StagePill stage={o.stage} />
        <span className="text-sm text-crm-muted">
          {amountDisplay} · {o.probability}%
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-3 text-sm">
              <Row label="Amount" value={amountDisplay} />
              <Row label="Probability" value={`${o.probability}%`} />
              <Row
                label="Close date"
                value={o.closeDate ? new Date(o.closeDate).toLocaleDateString() : "—"}
              />
              <Row label="Owner" value={o.ownerName ?? "—"} />
              <Row
                label="Account"
                value={
                  o.accountId && o.account ? (
                    <Link href={`/accounts/${o.accountId}`} className="text-crm-blue hover:underline">
                      {o.account.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Row
                label="Lead"
                value={
                  lead ? (
                    <Link href={`/leads/${lead.id}`} className="text-crm-blue hover:underline">
                      {lead.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              {o.competitorName && <Row label="Competitor" value={o.competitorName} />}
              {o.closeReasonCategory && (
                <Row label="Close reason" value={`${o.closeReasonCategory}${o.closeReason ? ` · ${o.closeReason}` : ""}`} />
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked lead</CardTitle>
          </CardHeader>
          <CardBody>
            {!lead ? (
              <p className="text-sm text-crm-muted">
                No lead linked. Link a lead when converting or editing this opportunity.
              </p>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Row
                  label="Name"
                  value={
                    <Link href={`/leads/${lead.id}`} className="font-medium text-crm-blue hover:underline">
                      {lead.name}
                    </Link>
                  }
                />
                <Row label="Stage" value={lead.stage || "—"} />
                <Row label="Status" value={lead.status || "—"} />
                <Row label="Company" value={lead.company || "—"} />
                <Row label="Email" value={lead.email || "—"} />
                <Row label="Phone" value={lead.phone || lead.mobile || "—"} />
                {lead.mobile && lead.phone ? (
                  <Row label="Mobile" value={lead.mobile} />
                ) : null}
                <Row label="Source" value={lead.source || "—"} />
                <Row label="Owner" value={lead.ownerName || "—"} />
                {linkedContact ? (
                  <Row
                    label="Contact"
                    value={
                      <Link
                        href={`/contacts/${linkedContact.id}`}
                        className="text-crm-blue hover:underline"
                      >
                        {[linkedContact.firstName, linkedContact.lastName].filter(Boolean).join(" ") ||
                          "View contact"}
                      </Link>
                    }
                  />
                ) : null}
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products ({o.products.length})</CardTitle>
          </CardHeader>
          <CardBody>
            {o.products.length === 0 ? (
              <p className="text-sm text-crm-muted">No products attached.</p>
            ) : (
              <ul className="divide-y divide-crm-border text-sm">
                {o.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span>
                      {p.productName}
                      <span className="ml-2 text-xs text-crm-muted">× {p.quantity}</span>
                    </span>
                    <span className="tabular-nums">
                      {formatGeneric(toNumber(p.lineTotal), (o.currency ?? "INR").toUpperCase())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Quotes ({quotes.length})</CardTitle>
              <NewQuoteFromOpportunityButton
                accountId={o.accountId}
                contactId={null}
                opportunityId={o.id}
              />
            </div>
          </CardHeader>
          <CardBody>
            {quotes.length === 0 ? (
              <p className="text-sm text-crm-muted">
                No quotes yet. Click <span className="font-medium">New quote</span> to draft one
                pre-linked to this opportunity.
              </p>
            ) : (
              <ul className="divide-y divide-crm-border text-sm">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-medium text-crm-text hover:underline"
                      >
                        {q.quoteNumber}
                      </Link>
                      {q.versionNumber > 1 && (
                        <span className="ml-2 text-xs text-crm-muted">v{q.versionNumber}</span>
                      )}
                      <span
                        className={
                          "ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                          QUOTE_STATUS_STYLE[q.status]
                        }
                      >
                        {q.status}
                      </span>
                      <div className="text-xs text-crm-muted">
                        {q.sentAt ? `Sent ${new Date(q.sentAt).toLocaleDateString()}` : "Not sent"}
                        {" · "}
                        Created {new Date(q.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="shrink-0 tabular-nums text-crm-text">
                      {formatGeneric(toNumber(q.grandTotal), (q.currency ?? "INR").toUpperCase())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client meetings ({o.clientMeetings.length})</CardTitle>
          </CardHeader>
          <CardBody>
            {o.clientMeetings.length === 0 ? (
              <p className="text-sm text-crm-muted">No meetings scheduled.</p>
            ) : (
              <ul className="divide-y divide-crm-border text-sm">
                {o.clientMeetings.map((m) => (
                  <li key={m.id} className="py-2">
                    <div className="font-medium">{m.subject}</div>
                    <div className="text-xs text-crm-muted">
                      {new Date(m.meetingAt).toLocaleString()}
                      {m.competitorName ? ` · ${m.competitorName}` : ""}
                      {m.outcome ? ` · ${m.outcome}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stage history</CardTitle>
          </CardHeader>
          <CardBody>
            {o.transitions.length === 0 ? (
              <p className="text-sm text-crm-muted">No stage changes yet.</p>
            ) : (
              <ul className="divide-y divide-crm-border text-sm">
                {o.transitions.map((t) => (
                  <li key={t.id} className="py-2">
                    <div>
                      <span className="font-medium">{t.fromStage}</span>
                      {" → "}
                      <span className="font-medium">{t.toStage}</span>
                    </div>
                    <div className="text-xs text-crm-muted">
                      {new Date(t.occurredAt).toLocaleString()}
                      {t.changedByName ? ` · ${t.changedByName}` : ""}
                      {t.closeReasonCategory ? ` · ${t.closeReasonCategory}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        <EntityDocumentsCard refType="opportunity" entityId={o.id} />
        <Card>
          <CardBody>
            <ActivityTimeline relatedKind="Opportunity" relatedObjectId={o.id} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-crm-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Local copy of the Quote-status badge palette. Kept inline (rather than
// imported from the Quotes list client) because that file is "use client"
// and this server component shouldn't pull its bundle.
const QUOTE_STATUS_STYLE: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Active: "bg-blue-100 text-blue-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Revised: "bg-amber-100 text-amber-700",
};
