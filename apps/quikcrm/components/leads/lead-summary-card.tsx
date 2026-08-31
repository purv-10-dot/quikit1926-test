"use client";

import Link from "next/link";
import { CallButton } from "@/components/telephony/call-button";
import { formatDate } from "@/lib/utils/date-helpers";

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  industry: string | null;
  stage: string;
  status?: string;
  score: number;
  ownerName?: string | null;
  source?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  updatedAt: string | Date;
  account?: { id: string; name: string } | null;
  /**
   * Ideal Customer Profile — reference (`icpId`) plus the joined name for display.
   * Read-only here: the ICP is inherited from the prospect at conversion and is
   * not editable from the lead detail page.
   */
  icpId?: string | null;
  icp?: { id: string; name: string } | null;
}

export function LeadSummaryCard({ lead }: { lead: Lead }) {
  const isMaskedEmail = lead.email === null;
  const isMaskedPhone = lead.phone === null;

  return (
    <aside className="crm-card sticky top-4 self-start p-5">
      <h2 className="text-lg font-semibold text-crm-text">{lead.name}</h2>
      <div className="mt-1 text-xs text-crm-muted">Last updated {formatDate(lead.updatedAt)}</div>

      <div className="mt-3">
        <Link href={`/leads/${lead.id}#stage`} className="crm-link text-sm font-medium">
          {lead.stage}
        </Link>
      </div>

      <Field label="Score">
        <span className="font-medium">{lead.score}</span>
      </Field>

      <Field label="Company">
        <span>{lead.company || "—"}</span>
      </Field>

      {lead.account && (
        <Field label="Account">
          <Link href={`/accounts/${lead.account.id}`} className="text-crm-blue hover:underline">
            {lead.account.name}
          </Link>
        </Field>
      )}

      <Field label="Industry">
        <span>{lead.industry || "—"}</span>
      </Field>

      {/* ICP — READ-ONLY. Always rendered (not conditional on a value) so the
          field is discoverable on leads that have none; shows "Not Assigned"
          rather than being absent. Not a link/input: assignment happens on the
          prospect before conversion, or via the API. */}
      <Field label="ICP">
        {lead.icp ? (
          <span className="font-medium">{lead.icp.name}</span>
        ) : (
          <span className="text-crm-muted">Not Assigned</span>
        )}
      </Field>

      {lead.status ? (
        <Field label="Status">
          <span>{lead.status}</span>
        </Field>
      ) : null}

      {lead.ownerName != null ? (
        <Field label="Owner">
          <span>{lead.ownerName || "Unassigned"}</span>
        </Field>
      ) : null}

      {lead.source ? (
        <Field label="Source">
          <span>{lead.source}</span>
        </Field>
      ) : null}

      {lead.jobTitle ? (
        <Field label="Job title">
          <span>{lead.jobTitle}</span>
        </Field>
      ) : null}

      {lead.website ? (
        <Field label="Website">
          <a
            href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-crm-blue hover:underline break-all"
          >
            {lead.website}
          </a>
        </Field>
      ) : null}

      <Field label="Email">
        <span className={isMaskedEmail ? "italic text-crm-muted" : ""}>{lead.email ?? "hidden"}</span>
      </Field>

      <Field label="Phone">
        <div className="flex items-center gap-2">
          <span className={isMaskedPhone ? "italic text-crm-muted" : ""}>{lead.phone ?? "hidden"}</span>
          {lead.phone && (
            <CallButton to={lead.phone} leadId={lead.id} leadName={lead.name} variant="pill" />
          )}
        </div>
      </Field>

      <Field label="Mobile">
        <div className="flex items-center gap-2">
          <span>{lead.mobile || "—"}</span>
          {lead.mobile && (
            <CallButton to={lead.mobile} leadId={lead.id} leadName={lead.name} variant="pill" />
          )}
        </div>
      </Field>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-crm-border pt-3">
      <div className="text-xs uppercase tracking-wider text-crm-muted">{label}</div>
      <div className="mt-0.5 text-sm text-crm-text">{children}</div>
    </div>
  );
}
