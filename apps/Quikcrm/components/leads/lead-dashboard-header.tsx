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
              {lead.substatus ? ` · ${lead.substatus}` : ""}
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
