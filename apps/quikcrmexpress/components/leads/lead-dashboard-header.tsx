"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, Star, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils/date-helpers";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";

export interface LeadDashboardHeaderLead {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  status: string;
  substatus: string | null;
  source: string | null;
  ownerName: string | null;
  isStarred: boolean;
  isDisengaged: boolean;
  leadQuality: string | null;
  convertedAt: string | null;
  createdAt: string;
  linkedContactId: string | null;
  account?: { id: string; name: string } | null;
  // Identity/contact fields surfaced in the header (STEP 2a) — the unique fields
  // the LeadSummaryCard shows today; the card is removed in 2b.
  score: number;
  industry: string | null;
  jobTitle: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  updatedAt: string;
}

interface Props {
  lead: LeadDashboardHeaderLead;
  snapshot: LeadDashboardSnapshot;
  canEdit: boolean;
  isTrashed: boolean;
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "open" || s === "active") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "closed" || s === "converted") return "bg-slate-100 text-slate-700 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

export function LeadDashboardHeader({ lead, snapshot, canEdit, isTrashed }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [starred, setStarred] = useState(lead.isStarred);
  const [starBusy, setStarBusy] = useState(false);

  const displayCompany =
    lead.company || lead.account?.name || null;

  // A null email/phone here means the lead simply has no value on that field —
  // NOT role-based masking (real masking would arrive via a separate signal, the
  // way email compose uses composeEmail.blockReason). So render "—" like the list
  // and the Mobile field do, rather than "hidden" which wrongly implies a secret
  // number the role can't see.

  async function toggleStar() {
    if (!canEdit || isTrashed) return;
    setStarBusy(true);
    const next = !starred;
    try {
      const res = await fetch(`/api/leads/${lead.id}/favorite`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to update favorite");
      setStarred(next);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update favorite");
    } finally {
      setStarBusy(false);
    }
  }

  return (
    <header className="crm-card mb-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-crm-text sm:text-2xl">{lead.name}</h1>
            {canEdit && !isTrashed ? (
              <button
                type="button"
                onClick={() => void toggleStar()}
                disabled={starBusy}
                className="rounded-md p-1 text-crm-muted transition hover:bg-crm-panel hover:text-amber-500 disabled:opacity-50"
                title={starred ? "Remove from favorites" : "Add to favorites"}
                aria-label={starred ? "Unstar lead" : "Star lead"}
              >
                <Star
                  size={20}
                  className={starred ? "fill-amber-400 text-amber-500" : ""}
                />
              </button>
            ) : starred ? (
              <Star size={20} className="fill-amber-400 text-amber-500" aria-hidden />
            ) : null}
          </div>
          {displayCompany ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-crm-muted">
              <Building2 size={14} className="shrink-0" />
              {lead.account ? (
                <Link href={`/accounts/${lead.account.id}`} className="text-crm-blue hover:underline">
                  {displayCompany}
                </Link>
              ) : (
                <span>{displayCompany}</span>
              )}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-accent-100 px-2.5 py-0.5 font-medium text-accent-800 ring-1 ring-accent-200">
              {lead.stage}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${statusTone(lead.status)}`}>
              {lead.status}
            </span>
            {lead.isDisengaged ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 font-medium text-rose-800 ring-1 ring-rose-200">
                Disengaged
              </span>
            ) : null}
            {lead.leadQuality ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 font-medium text-violet-800 ring-1 ring-violet-200">
                {lead.leadQuality}
              </span>
            ) : null}
            {lead.convertedAt ? (
              <span className="text-crm-muted">Converted {formatDate(lead.convertedAt)}</span>
            ) : null}
            <span className="text-crm-muted">Updated {formatDate(lead.updatedAt)}</span>
          </div>
        </div>
        <dl className="grid shrink-0 gap-x-4 gap-y-1 text-right text-xs sm:grid-cols-2">
          <div>
            <dt className="text-crm-muted">Owner</dt>
            <dd className="flex items-center justify-end gap-1 font-medium text-crm-text">
              <User size={12} className="text-crm-muted" />
              {lead.ownerName || "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-crm-muted">Source</dt>
            <dd className="font-medium text-crm-text">{lead.source || "—"}</dd>
          </div>
          <div>
            <dt className="text-crm-muted">Created</dt>
            <dd className="font-medium text-crm-text">{formatDate(lead.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-crm-muted">Age</dt>
            <dd className="font-medium text-crm-text">
              {snapshot.daysSinceCreated === 0
                ? "Today"
                : `${snapshot.daysSinceCreated} day${snapshot.daysSinceCreated === 1 ? "" : "s"}`}
            </dd>
          </div>
        </dl>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-crm-border pt-3 sm:grid-cols-3">
        <HeaderField label="Score">
          <span className="font-medium text-crm-text">{lead.score}</span>
        </HeaderField>
        {lead.jobTitle ? (
          <HeaderField label="Job title">
            <span className="text-crm-text">{lead.jobTitle}</span>
          </HeaderField>
        ) : null}
        {lead.industry ? (
          <HeaderField label="Industry">
            <span className="text-crm-text">{lead.industry}</span>
          </HeaderField>
        ) : null}
        <HeaderField label="Email">
          <span className={lead.email ? "break-all text-crm-text" : "text-crm-muted"}>
            {lead.email || "—"}
          </span>
        </HeaderField>
        <HeaderField label="Phone">
          <span className={lead.phone ? "text-crm-text" : "text-crm-muted"}>
            {lead.phone || "—"}
          </span>
        </HeaderField>
        {lead.mobile ? (
          <HeaderField label="Mobile">
            <span className="text-crm-text">{lead.mobile}</span>
          </HeaderField>
        ) : null}
        {lead.website ? (
          <HeaderField label="Website">
            <a
              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-crm-blue hover:underline"
            >
              {lead.website}
            </a>
          </HeaderField>
        ) : null}
      </dl>

      {snapshot.nextFollowUpAt ? (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span className="font-medium">Next follow-up:</span> {formatDate(snapshot.nextFollowUpAt)}
        </p>
      ) : null}

      {snapshot.slaAlerts.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {snapshot.slaAlerts.map((a, i) => (
            <li
              key={`${a.ruleName}-${i}`}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">{a.ruleName}</span> — {a.status}
                {a.breachAt ? ` (${formatDate(a.breachAt)})` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {lead.linkedContactId ? (
        <p className="mt-3 text-sm">
          <Link href={`/contacts/${lead.linkedContactId}`} className="text-crm-blue hover:underline">
            View converted contact →
          </Link>
        </p>
      ) : null}
    </header>
  );
}

function HeaderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-crm-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
