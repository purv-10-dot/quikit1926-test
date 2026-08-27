"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/select";
import { Modal } from "@/components/hrms/modal";
import { Pagination } from "@/components/hrms/pagination";
import { clsx } from "clsx";
import {
  Briefcase, Users, Calendar, Clock, AlertCircle, AlertTriangle, PenLine, AlarmClock, CheckCircle2, Download,
} from "lucide-react";
import { prettyStage, type RecruiterRow } from "./team-performance-tab";

type Position = RecruiterRow["positions"][number];

/**
 * The full "Assigned Positions" browser — summary tiles, filter/sort/export
 * toolbar, the position table, and its two action dialogs (Revise SLA,
 * pipeline-candidates popover). Lives on its own page (see
 * app/(dashboard)/recruit/positions/page.tsx) rather than a Modal — this
 * view has its own toolbar, its own table, and its own actions, so it needs
 * real page width/height, not a dialog's constrained box.
 */
export function AssignedPositionsView({ positions, canSeeAll, exportFileNamePrefix, showRecruiterColumn = false }: {
  positions: Position[];
  canSeeAll: boolean;
  exportFileNamePrefix: string;
  // Only worth a column when positions from MULTIPLE recruiters are mixed
  // together (the "All Recruiters" aggregate view) — on a single recruiter's
  // own page it would just repeat the same name down every row.
  showRecruiterColumn?: boolean;
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [positionFilter, setPositionFilter] = useState<"" | "IN_TAT" | "AT_RISK" | "MISSED">("");
  const [positionSort, setPositionSort] = useState<"days" | "target" | "requisition">("days");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [pipelinePopover, setPipelinePopover] = useState<Position | null>(null);
  const [reasonModal, setReasonModal] = useState<{ positionCode: string; reason: string } | null>(null);
  const [reviseTarget, setReviseTarget] = useState<Position | null>(null);
  const [reviseReason, setReviseReason] = useState("");
  const [reviseDeadline, setReviseDeadline] = useState("");

  const reviseSlaMut = useMutation({
    mutationFn: ({ requisitionId, positionId, reason, customDeadline }: { requisitionId: string; positionId: string; reason: string; customDeadline: string }) =>
      api.post(`/api/v1/hrms/recruit/requisitions/${requisitionId}/positions/${positionId}/revise-sla`, {
        reason: reason.trim() || undefined,
        customDeadline: customDeadline || undefined,
      }),
    onSuccess: (res) => {
      const r = res.data as { baseTargetDays: number; slaRevisionCount: number; customDeadline: boolean };
      toast.success("SLA revised", r.customDeadline
        ? `Deadline set to the date you picked (revision #${r.slaRevisionCount}).`
        : `Deadline pushed out by ${r.baseTargetDays} more days (revision #${r.slaRevisionCount}).`);
      qc.invalidateQueries({ queryKey: ["recruiter-performance"] });
      setReviseTarget(null);
      setReviseReason("");
      setReviseDeadline("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't revise this position's SLA."),
  });

  if (positions.length === 0) {
    return <p className="text-xs text-gray-400">Nothing here.</p>;
  }

  const statusCounts = { Open: 0, PendingOnboarding: 0, Filled: 0, Cancelled: 0 } as Record<string, number>;
  const slaCounts = { IN_TAT: 0, AT_RISK: 0, MISSED: 0 } as Record<string, number>;
  let revisedCount = 0;
  for (const p of positions) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
    if (p.slaStatus) slaCounts[p.slaStatus] = (slaCounts[p.slaStatus] ?? 0) + 1;
    if (p.slaRevisionCount > 0) revisedCount++;
  }
  const filteredSorted = positions
    .filter((p) => !positionFilter || p.slaStatus === positionFilter)
    .sort((a, b) => {
      if (positionSort === "days") return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
      if (positionSort === "target") return a.targetDays - b.targetDays;
      return a.requisitionTitle.localeCompare(b.requisitionTitle);
    });
  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filteredSorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const header = ["Position", "Requisition", "Recruiter", "Status", "Assigned Date", "Candidates", "Candidate Details (Stage)", "SLA", "Days", "Target", "Revised", "Days Extended", "New Deadline", "Revision Reason"];
    const rows = filteredSorted.map((p) => [
      p.positionCode, p.requisitionTitle, p.recruiterName, p.status,
      p.assignedAt ? new Date(p.assignedAt).toLocaleDateString("en-IN") : "",
      p.filledCandidateName ?? (p.pipelineCandidates.length ? `${p.pipelineCandidates.length} in pipeline` : ""),
      p.filledCandidateName
        ? `${p.filledCandidateName} — Hired`
        : p.pipelineCandidates.map((c) => `${c.name} — ${prettyStage(c.currentStage ?? "Unknown")}`).join(" | "),
      p.slaStatus ?? "", p.daysLeft != null ? String(p.daysLeft) : "", String(p.targetDays), String(p.slaRevisionCount),
      String(p.daysExtended),
      p.revisedDeadline ? new Date(p.revisedDeadline).toLocaleDateString("en-IN") : "",
      p.slaRevisionReason ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${exportFileNamePrefix}-assigned-positions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SUMMARY_TILES: { key: "Open" | "PendingOnboarding" | "Filled"; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "Open", label: "Open", icon: <Briefcase size={14} />, count: statusCounts.Open },
    { key: "PendingOnboarding", label: "Pending Onboarding", icon: <AlarmClock size={14} />, count: statusCounts.PendingOnboarding },
    { key: "Filled", label: "Filled", icon: <CheckCircle2 size={14} />, count: statusCounts.Filled },
  ];
  const SLA_TILES: { key: "IN_TAT" | "AT_RISK" | "MISSED"; label: string; icon: React.ReactNode; count: number; tone: string }[] = [
    { key: "IN_TAT", label: "In TAT", icon: <Clock size={14} />, count: slaCounts.IN_TAT, tone: "text-green-600 bg-green-50" },
    { key: "AT_RISK", label: "At Risk", icon: <AlertTriangle size={14} />, count: slaCounts.AT_RISK, tone: "text-amber-600 bg-amber-50" },
    { key: "MISSED", label: "Missed", icon: <AlertCircle size={14} />, count: slaCounts.MISSED, tone: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">By Status</div>
          <div className="flex items-center gap-4">
            {SUMMARY_TILES.map((t) => (
              <div key={t.key} className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-md bg-white ring-1 ring-gray-200 flex items-center justify-center text-gray-500">{t.icon}</span>
                <div>
                  <div className="text-sm font-bold text-gray-900 leading-none">{t.count}</div>
                  <div className="text-[10px] text-gray-400 leading-tight">{t.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[220px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">SLA (Position → Offer)</div>
          <div className="flex items-center gap-4">
            {SLA_TILES.map((t) => (
              <div key={t.key} className="flex items-center gap-1.5">
                <span className={clsx("w-6 h-6 rounded-md flex items-center justify-center", t.tone)}>{t.icon}</span>
                <div>
                  <div className="text-sm font-bold text-gray-900 leading-none">{t.count}</div>
                  <div className="text-[10px] text-gray-400 leading-tight">{t.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {revisedCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
            <PenLine size={14} className="text-amber-600" />
            <div>
              <div className="text-sm font-bold text-amber-700 leading-none">{revisedCount}</div>
              <div className="text-[10px] text-amber-600 leading-tight whitespace-nowrap">position{revisedCount === 1 ? "" : "s"} SLA-revised</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-40">
          <Select value={positionFilter} onChange={(v) => { setPositionFilter(v as typeof positionFilter); setPage(1); }}
            size="sm" placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              { value: "IN_TAT", label: "In TAT" },
              { value: "AT_RISK", label: "At Risk" },
              { value: "MISSED", label: "Missed" },
            ]} />
        </div>
        <div className="w-44">
          <Select value={positionSort} onChange={(v) => { setPositionSort(v as typeof positionSort); setPage(1); }}
            size="sm"
            options={[
              { value: "days", label: "Sort by: Days" },
              { value: "target", label: "Sort by: Target" },
              { value: "requisition", label: "Sort by: Requisition" },
            ]} />
        </div>
        <button type="button" onClick={exportCsv}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
          <Download size={13} /> Export
        </button>
      </div>

      <div className="rounded-lg border border-gray-100 overflow-x-auto no-scrollbar">
        <table className="w-full text-xs table-fixed">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="text-left px-2 py-1 w-[12%]">Position</th>
              <th className="text-left px-2 py-1 w-[12%]">Requisition</th>
              {showRecruiterColumn && <th className="text-left px-2 py-1 w-[8%]">Recruiter</th>}
              <th className="text-left px-2 py-1 w-[7%]">Status</th>
              <th className="text-left px-2 py-1 w-[6%]">Assigned</th>
              <th className="text-left px-2 py-1 w-[9%]">Candidate(s)</th>
              <th className="text-left px-2 py-1 w-[6%]">SLA</th>
              <th className="text-right px-2 py-1 w-[6%]">Days</th>
              <th className="text-right px-2 py-1 w-[5%]">Target</th>
              <th className="text-right px-2 py-1 w-[5%]">Revised</th>
              <th className="text-right px-2 py-1 w-[6%]">Days Extended</th>
              <th className="text-left px-2 py-1 w-[7%]">New Deadline</th>
              {canSeeAll && <th className="text-right px-2 py-1 w-[6%]">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((p) => {
              const dotColor = p.slaStatus === "MISSED" ? "bg-red-500" : p.slaStatus === "AT_RISK" ? "bg-amber-500" : p.slaStatus === "IN_TAT" ? "bg-green-500" : "bg-gray-300";
              return (
              <tr key={p.id} className="hover:bg-gray-50/60">
                <td className="px-2 py-1 overflow-hidden" title={p.positionCode}>
                  <span className="inline-flex items-center gap-1.5 max-w-full font-mono text-[11px] text-gray-700 truncate">
                    <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
                    <span className="truncate">{p.positionCode}</span>
                  </span>
                </td>
                <td className="px-2 py-1">
                  <Link href={`/recruit/requisitions?view=${p.requisitionId}`} title={p.requisitionTitle} className="text-gray-600 hover:text-accent-700 hover:underline whitespace-normal break-words line-clamp-2">
                    {p.requisitionTitle}
                  </Link>
                </td>
                {showRecruiterColumn && <td className="px-2 py-1 truncate text-gray-600" title={p.recruiterName}>{p.recruiterName}</td>}
                <td className="px-2 py-1 whitespace-nowrap overflow-hidden">
                  <span className={clsx("inline-flex items-center max-w-full h-5 px-2 rounded-full text-[10.5px] font-medium truncate",
                    p.status === "Filled" ? "bg-green-50 text-green-700"
                      : p.status === "Cancelled" ? "bg-red-50 text-red-600"
                      : p.status === "PendingOnboarding" ? "bg-amber-50 text-amber-700"
                      : "bg-blue-50 text-blue-700")}
                    title={p.status === "PendingOnboarding" ? "Pending Onboarding" : p.status}>
                    {p.status === "PendingOnboarding" ? "Pending Onboarding" : p.status}
                  </span>
                </td>
                <td className="px-2 py-1 whitespace-nowrap text-gray-500">
                  {p.assignedAt ? new Date(p.assignedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-1 overflow-hidden">
                  {p.filledCandidateName ? (
                    <Link href={`/recruit/candidates/${p.filledCandidateId}`} title={p.filledCandidateName} className="inline-flex items-center gap-1 max-w-full text-accent-700 hover:underline font-medium">
                      <Users size={11} className="shrink-0" /> <span className="truncate">{p.filledCandidateName}</span>
                    </Link>
                  ) : p.pipelineCandidates.length > 0 ? (
                    <button type="button" onClick={() => setPipelinePopover(p)}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-accent-700 hover:underline font-medium">
                      <Users size={11} className="shrink-0" /> {p.pipelineCandidates.length} in pipeline
                    </button>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {p.slaStatus && (
                    <span className={clsx("inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium",
                      p.slaStatus === "IN_TAT" ? "bg-green-50 text-green-700"
                        : p.slaStatus === "AT_RISK" ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-600")}>
                      {p.slaStatus === "IN_TAT" ? "In TAT" : p.slaStatus === "AT_RISK" ? "At Risk" : "Missed"}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {p.daysLeft != null ? (
                    <span className={p.daysLeft < 0 ? "text-red-600 font-medium" : "text-gray-600"}>
                      {p.daysLeft >= 0 ? `${p.daysLeft}d left` : `${Math.abs(p.daysLeft)}d over`}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-2 py-1 text-right text-gray-400 whitespace-nowrap">{p.targetDays}d</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {p.slaRevisionCount > 0 ? (
                    p.slaRevisionReason ? (
                      <button type="button" onClick={() => setReasonModal({ positionCode: p.positionCode, reason: p.slaRevisionReason! })}
                        className="text-amber-600 font-medium hover:underline" title="Click to read the full reason">
                        {p.slaRevisionCount}×
                      </button>
                    ) : (
                      <span className="text-amber-600 font-medium" title="No reason given">{p.slaRevisionCount}×</span>
                    )
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {p.daysExtended > 0 ? <span className="text-amber-600 font-medium">+{p.daysExtended}d</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-1 text-gray-600">
                  {p.revisedDeadline ? (
                    <>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Calendar size={11} className="text-gray-400" /> {new Date(p.revisedDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                      {p.slaRevisionReason && (
                        <button type="button"
                          onClick={() => setReasonModal({ positionCode: p.positionCode, reason: p.slaRevisionReason! })}
                          className="block text-[10.5px] text-gray-400 max-w-[160px] truncate hover:text-accent-600 hover:underline text-left"
                          title="Click to read the full reason">
                          {p.slaRevisionReason}
                        </button>
                      )}
                    </>
                  ) : "—"}
                </td>
                {/* HR/Admin only — a recruiter must never be able to revise their own SLA breach (see the API route's gate). */}
                {canSeeAll && (
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {p.rawSlaStatus === "MISSED" && p.status !== "Cancelled" && (
                      <button type="button"
                        onClick={() => { setReviseTarget(p); setReviseReason(""); setReviseDeadline(""); }}
                        className="px-2 py-1 text-[10.5px] font-semibold text-accent-700 border border-accent-200 rounded-md hover:bg-accent-50">
                        Revise SLA
                      </button>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-gray-100 text-[10.5px] text-gray-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> In TAT</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> At Risk</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Missed</span>
          <span>SLA counts from assignment → offer sent (see Revise SLA for extensions).</span>
        </div>
        <span>{filteredSorted.length} of {positions.length} position{positions.length === 1 ? "" : "s"}</span>
      </div>

      <Pagination page={safePage} totalPages={totalPages} total={filteredSorted.length} limit={PAGE_SIZE} onPageChange={setPage} className="px-0 border-t-0" />

      {reviseTarget && (() => {
        // Day after the CURRENT deadline — the earliest date HR is allowed to
        // pick, so a "revision" always actually pushes the deadline forward.
        const minDeadline = reviseTarget.assignedAt ? (() => {
          const d = new Date(reviseTarget.assignedAt as string);
          d.setDate(d.getDate() + reviseTarget.targetDays + 1);
          return d.toISOString().slice(0, 10);
        })() : undefined;
        return (
        <Modal open onClose={() => setReviseTarget(null)} size="sm" title="Revise SLA">
          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
              <div className="font-mono text-gray-700">{reviseTarget.positionCode}</div>
              <div className="text-gray-500 mt-0.5">{reviseTarget.requisitionTitle}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">New Deadline</label>
              <input type="date" value={reviseDeadline} min={minDeadline}
                onChange={(e) => setReviseDeadline(e.target.value)}
                className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
              <p className="text-[10.5px] text-gray-400 mt-1">
                Leave blank to auto-extend by the level&apos;s standard SLA window. Pick a date to set the deadline exactly (e.g. to match a known notice period or manager-feedback date).
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
              <textarea value={reviseReason} onChange={(e) => setReviseReason(e.target.value)}
                rows={3} maxLength={500} placeholder="e.g. Candidate serving notice period, hiring manager delayed feedback..."
                className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setReviseTarget(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="button"
                disabled={reviseSlaMut.isPending}
                onClick={() => reviseSlaMut.mutate({ requisitionId: reviseTarget.requisitionId, positionId: reviseTarget.id, reason: reviseReason, customDeadline: reviseDeadline })}
                className="px-3 py-1.5 text-xs font-semibold bg-accent-600 hover:bg-accent-700 text-white rounded-lg disabled:opacity-60">
                {reviseSlaMut.isPending ? "Revising..." : "Confirm Revise"}
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}

      {pipelinePopover && (
        <Modal open onClose={() => setPipelinePopover(null)} size="sm"
          title={`${pipelinePopover.positionCode} — Candidates in Pipeline`}
          subtitle={pipelinePopover.requisitionTitle}>
          <div className="space-y-2">
            <p className="text-[11px] text-gray-400">
              Every candidate this recruiter has active on this requisition — not tied to this exact seat, since that link is only made at hire.
            </p>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {pipelinePopover.pipelineCandidates.map((c) => (
                <Link key={c.id} href={`/recruit/candidates/${c.candidateId}`}
                  className="block px-2.5 py-2 text-xs hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{c.name}</span>
                    {c.currentStage && (
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium bg-purple-50 text-purple-700">
                        {prettyStage(c.currentStage)}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 mt-0.5">Applied {new Date(c.appliedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
                </Link>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {reasonModal && (
        <Modal open onClose={() => setReasonModal(null)} size="sm" title="SLA Revision Reason" subtitle={reasonModal.positionCode}>
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{reasonModal.reason}</p>
        </Modal>
      )}
    </div>
  );
}
