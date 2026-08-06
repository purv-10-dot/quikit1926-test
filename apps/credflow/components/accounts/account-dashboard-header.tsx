"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { AccountStatusPill } from "@/components/accounts/account-status-pill";
import { AccountTagsEditor } from "@/components/accounts/account-tags-editor";
import type { AccountRow } from "@/lib/services/accounts";

export interface AccountDashboardHeaderProps {
  account: AccountRow;
  parent: { id: string; name: string } | null;
  daysToRenewal?: number | null;
  canEdit?: boolean;
  onTagsUpdated?: (tags: string[]) => void;
}

export function AccountDashboardHeader({
  account,
  parent,
  daysToRenewal = null,
  canEdit = false,
  onTagsUpdated,
}: AccountDashboardHeaderProps) {
  return (
    <div className="mb-4 rounded-lg border border-crm-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-crm-border bg-crm-panel text-crm-blue">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-crm-text">{account.name}</h1>
            <AccountStatusPill status={account.status} />
            {account.deletedAt ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Deleted
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-crm-muted">
            {account.industry || "—"} · {account.segment || "—"} · Owner {account.owner || "—"}
          </p>
          <p className="mt-0.5 text-xs text-crm-muted">
            {[account.city, account.state, account.countryCode].filter(Boolean).join(", ") || "—"}
          </p>
          {account.website ? (
            <a
              href={
                account.website.startsWith("http") ? account.website : `https://${account.website}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-crm-blue hover:underline"
            >
              {account.website}
            </a>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <HealthChip score={account.healthScore} />
            <NpsChip score={account.npsScore} />
            <RenewalChip daysToRenewal={daysToRenewal} />
          </div>
          {parent ? (
            <p className="mt-2 text-xs text-crm-muted">
              Subsidiary of{" "}
              <Link href={`/accounts/${parent.id}`} className="text-crm-blue hover:underline">
                {parent.name}
              </Link>
            </p>
          ) : null}
          {onTagsUpdated ? (
            <AccountTagsEditor
              accountId={account.id}
              tags={account.tags ?? []}
              canEdit={canEdit && !account.deletedAt}
              onUpdated={onTagsUpdated}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HealthChip({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone =
    score >= 70
      ? "bg-emerald-100 text-emerald-800"
      : score >= 40
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  const label = score >= 70 ? "Good" : score >= 40 ? "Watch" : "At risk";
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      Health {score} ({label})
    </span>
  );
}

function NpsChip({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone =
    score >= 40
      ? "bg-emerald-100 text-emerald-800"
      : score >= 1
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      NPS {score >= 0 ? `+${score}` : score}
    </span>
  );
}

function RenewalChip({ daysToRenewal }: { daysToRenewal: number | null }) {
  if (daysToRenewal == null) return null;
  const days = daysToRenewal;
  const tone =
    days > 90
      ? "bg-emerald-100 text-emerald-800"
      : days >= 30
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  const label = days < 0 ? `Renewal ${-days}d overdue` : `Renews in ${days}d`;
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}
