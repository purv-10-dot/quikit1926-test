"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { Save, Briefcase, Building2, Calendar, CheckCircle2, XCircle, AlertCircle, Target, ChevronDown, MessageSquare } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";

interface SnapshotKpi {
  id: string;
  title: string;
  description: string | null;
  measurementMethod: string | null;
  target: string | null;
  unit: string | null;
  weight: number;
}
interface SnapshotKra {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  kpis: SnapshotKpi[];
}
interface ProgressEntry {
  currentValue?: string | null;
  score?: number | null;
  notes?: string | null;
  updatedAt?: string;
}

interface AssignmentDetail {
  id: string;
  employeeId: string;
  scorecardId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "Active" | "Completed" | "Cancelled";
  compositeScore: number | string | null;
  snapshot: {
    scorecardName: string;
    effectiveFromAtAssignment: string;
    kras: SnapshotKra[];
  };
  progress: Record<string, ProgressEntry>;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    workEmail: string;
    profilePhoto: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
  } | null;
  scorecard: { id: string; name: string; description: string | null } | null;
}

interface ScoreOption {
  value: number;
  short: string;
  full: string;
  bg: string;        // unselected background
  active: string;    // selected — strong color
  text: string;      // selected text
}

const SCORE_SCALE: ScoreOption[] = [
  { value: 1, short: "Poor",       full: "1 — Unsatisfactory",      bg: "bg-rose-50 text-rose-700 hover:bg-rose-100",       active: "bg-rose-600 text-white ring-2 ring-rose-600",       text: "text-rose-700" },
  { value: 2, short: "Below",      full: "2 — Needs improvement",    bg: "bg-orange-50 text-orange-700 hover:bg-orange-100",  active: "bg-orange-500 text-white ring-2 ring-orange-500",  text: "text-orange-700" },
  { value: 3, short: "Meets",      full: "3 — Meets expectations",   bg: "bg-amber-50 text-amber-700 hover:bg-amber-100",     active: "bg-amber-500 text-white ring-2 ring-amber-500",    text: "text-amber-700" },
  { value: 4, short: "Exceeds",    full: "4 — Exceeds expectations", bg: "bg-lime-50 text-lime-700 hover:bg-lime-100",        active: "bg-lime-600 text-white ring-2 ring-lime-600",      text: "text-lime-700" },
  { value: 5, short: "Outstanding",full: "5 — Outstanding",          bg: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100", active: "bg-emerald-600 text-white ring-2 ring-emerald-600", text: "text-emerald-700" },
];

export default function KraAssignmentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();

  const { data, isLoading } = useQuery({
    queryKey: ["performance", "kra-assignments", id],
    queryFn: () => api.get<AssignmentDetail>(`/api/v1/hrms/performance/kra-assignments/${id}`),
  });

  // Local edits buffer — flush on Save.
  const [edits, setEdits] = useState<Record<string, ProgressEntry>>({});

  const setKpi = (kpiId: string, patch: Partial<ProgressEntry>) => {
    setEdits((e) => ({ ...e, [kpiId]: { ...e[kpiId], ...patch } }));
  };

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/performance/kra-assignments/${id}`, { progress: edits }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance", "kra-assignments", id] });
      qc.invalidateQueries({ queryKey: ["performance", "kra-assignments"] });
      setEdits({});
      toast.success("Saved");
      router.push("/performance/kra-assignments");
    },
  });

  const statusMut = useMutation({
    mutationFn: (status: "Active" | "Completed" | "Cancelled") =>
      api.patch(`/api/v1/hrms/performance/kra-assignments/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance", "kra-assignments", id] });
      qc.invalidateQueries({ queryKey: ["performance", "kra-assignments"] });
      toast.success("Status updated");
      router.push("/performance/kra-assignments");
    },
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-5xl mx-auto space-y-3">
        <SkeletonLine w="30%" h={20} />
        <SkeletonLine w="60%" h={14} />
        <SkeletonLine w="90%" h={120} />
      </div>
    );
  }

  const a = data.data;
  const snapshot = a.snapshot;
  // Merge persisted progress + local edits for live display.
  const liveProgress: Record<string, ProgressEntry> = { ...a.progress, ...edits };
  const getEntry = (kpiId: string): ProgressEntry => liveProgress[kpiId] ?? {};

  // Live composite score
  const totalKpis = snapshot.kras.reduce((s, k) => s + k.kpis.length, 0);
  const scoredKpis = snapshot.kras.reduce((s, k) =>
    s + k.kpis.filter((p) => liveProgress[p.id]?.score != null).length, 0);
  const progressPct = totalKpis ? Math.round((scoredKpis / totalKpis) * 100) : 0;

  const liveComposite = (() => {
    let kraSum = 0;
    let any = false;
    for (const kra of snapshot.kras) {
      let kpiSum = 0;
      let scoredKpiWeight = 0;
      for (const kpi of kra.kpis) {
        const score = liveProgress[kpi.id]?.score;
        if (score == null) continue;
        kpiSum += kpi.weight * score;
        scoredKpiWeight += kpi.weight;
        any = true;
      }
      if (scoredKpiWeight > 0) {
        kraSum += (kra.weight * kpiSum) / scoredKpiWeight / 100;
      }
    }
    return any ? Math.round(kraSum * 100) / 100 : null;
  })();

  const hasUnsavedChanges = Object.keys(edits).length > 0;

  const initials = a.employee
    ? `${a.employee.firstName[0] ?? ""}${a.employee.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <div className="w-full max-w-5xl mx-auto pb-28">
      {/* Simple header — Who · What · Score */}
      <div className="rounded-2xl bg-white ring-1 ring-gray-200 px-4 py-4 flex items-center gap-4 mb-5">
        {a.employee?.profilePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.employee.profilePhoto} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white flex items-center justify-center text-base font-bold shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 truncate">
            {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : "—"}
            <span className="ml-2 text-xs font-mono text-gray-400">{a.employee?.employeeCode}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {a.employee?.designation?.title}
            {a.employee?.designation?.title && a.employee?.department?.name && " · "}
            {a.employee?.department?.name}
          </p>
          <p className="text-xs text-gray-600 mt-1 inline-flex items-center gap-1">
            <Target size={11} className="text-green-500" />
            <span className="font-semibold">{snapshot.scorecardName}</span>
            <span className="text-gray-400">·</span>
            <Calendar size={10} />
            {new Date(a.effectiveFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
            {a.effectiveTo && <> → {new Date(a.effectiveTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</>}
          </p>
        </div>

        {/* Big score number */}
        <div className="text-right shrink-0 pl-4 border-l border-gray-200">
          <p className="font-serif-display text-3xl font-bold text-gray-900 leading-none tabular-nums">
            {liveComposite != null ? liveComposite.toFixed(1) : "—"}
            <span className="text-base text-gray-400 font-normal"> / 5</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {scoredKpis} of {totalKpis} rated
          </p>
        </div>
      </div>

      {/* Instructional row — only when nothing scored yet */}
      {scoredKpis === 0 && a.status === "Active" && (
        <div className="mb-4 rounded-lg ring-1 ring-green-100 bg-green-50/60 px-4 py-2.5 text-xs text-green-900">
          <strong>How to use this page:</strong> rate each item below using the 1–5 buttons.
          1 = Poor · 5 = Outstanding. The overall score updates automatically.
        </div>
      )}

      {/* KRAs — flat list of KPIs grouped by KRA */}
      <div className="space-y-4">
        {snapshot.kras.map((kra, kraIdx) => {
          const kraScoredCount = kra.kpis.filter((p) => liveProgress[p.id]?.score != null).length;
          return (
            <section key={kra.id}>
              {/* KRA heading */}
              <div className="flex items-baseline justify-between gap-3 mb-2 px-1">
                <h3 className="text-[13px] font-semibold text-gray-900">
                  <span className="text-gray-400 font-normal mr-1.5">KRA {kraIdx + 1}</span>
                  {kra.title}
                </h3>
                <span className="text-[11px] text-gray-500 shrink-0">
                  {kraScoredCount} / {kra.kpis.length} rated · weight {kra.weight}%
                </span>
              </div>

              {/* KPI cards */}
              <div className="space-y-2">
                {kra.kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    entry={getEntry(kpi.id)}
                    disabled={a.status === "Cancelled"}
                    onScore={(score) => setKpi(kpi.id, { score })}
                    onNotes={(notes) => setKpi(kpi.id, { notes })}
                    onCurrentValue={(currentValue) => setKpi(kpi.id, { currentValue })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
            a.status === "Active" ? "bg-green-100 text-green-700"
              : a.status === "Completed" ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600")}>
            {a.status}
          </span>
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <AlertCircle size={11} /> Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {a.status === "Active" && (
            <button
              type="button"
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: "Mark assignment as completed?",
                  description: "Locks the scorecard for further edits. You can revert by switching status back to Active.",
                  variant: "warning",
                  confirmLabel: "Mark completed",
                });
                if (ok) statusMut.mutate("Completed");
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md"
            >
              <CheckCircle2 size={13} /> Mark completed
            </button>
          )}
          {a.status === "Completed" && (
            <button
              type="button"
              onClick={() => statusMut.mutate("Active")}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 rounded-md"
            >
              Reopen
            </button>
          )}
          {a.status !== "Cancelled" && (
            <button
              type="button"
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: "Cancel this assignment?",
                  description: "The assignment will be archived but the data is preserved for audit.",
                  variant: "danger",
                  confirmLabel: "Cancel assignment",
                });
                if (ok) statusMut.mutate("Cancelled");
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
            >
              <XCircle size={13} /> Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!hasUnsavedChanges || saveMut.isPending || a.status === "Cancelled"}
            onClick={() => saveMut.mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium"
          >
            {saveMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            <Save size={13} /> {saveMut.isPending ? "Saving…" : "Save progress"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── KPI card ───────────────────────────────────────────────────── */

function KpiCard({
  kpi, entry, disabled, onScore, onNotes, onCurrentValue,
}: {
  kpi: SnapshotKpi;
  entry: ProgressEntry;
  disabled: boolean;
  onScore: (score: number | null) => void;
  onNotes: (notes: string) => void;
  onCurrentValue: (v: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const selectedScore = entry.score ?? null;
  const selectedMeta = selectedScore ? SCORE_SCALE.find((s) => s.value === selectedScore) : null;

  return (
    <div
      className={clsx(
        "rounded-xl bg-white ring-1 transition",
        selectedScore ? "ring-gray-200" : "ring-gray-200",
        disabled && "opacity-60",
      )}
    >
      <div className="px-4 py-3">
        {/* Question */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-gray-900">{kpi.title}</p>
            {(kpi.target || kpi.measurementMethod) && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {kpi.target && <>Target: <span className="text-gray-700 font-medium">{kpi.target}{kpi.unit ? ` ${kpi.unit}` : ""}</span></>}
                {kpi.target && kpi.measurementMethod && " · "}
                {kpi.measurementMethod && <>How: <span className="text-gray-700">{kpi.measurementMethod}</span></>}
              </p>
            )}
          </div>
          <span className="text-[10px] text-gray-400 shrink-0">weight {kpi.weight}%</span>
        </div>

        {/* The big primary action: pick a rating */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {SCORE_SCALE.map((s) => {
            const active = selectedScore === s.value;
            return (
              <button
                key={s.value}
                type="button"
                disabled={disabled}
                onClick={() => onScore(active ? null : s.value)}
                className={clsx(
                  "inline-flex flex-col items-center justify-center min-w-[64px] px-3 py-1.5 rounded-lg text-xs font-semibold transition",
                  active ? s.active : s.bg,
                  disabled && "cursor-not-allowed",
                )}
                title={s.full}
              >
                <span className="text-sm font-bold leading-none">{s.value}</span>
                <span className="text-[10px] mt-0.5 leading-none">{s.short}</span>
              </button>
            );
          })}
          {selectedScore && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onScore(null)}
              className="ml-1 text-[11px] text-gray-500 hover:text-gray-800 font-medium px-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Collapse: add details */}
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#166534]"
        >
          <MessageSquare size={11} />
          {showDetails ? "Hide details" : "Add notes / value"}
          {(entry.notes || entry.currentValue) && !showDetails && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-700 text-[10px]">✓</span>
          )}
          <ChevronDown
            size={11}
            className={clsx("transition-transform", showDetails && "rotate-180")}
          />
        </button>

        {showDetails && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2.5">
            <div>
              <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1">
                Achieved value <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </label>
              <input
                value={entry.currentValue ?? ""}
                onChange={(e) => onCurrentValue(e.target.value)}
                placeholder={kpi.unit ? `e.g. 4.5 ${kpi.unit}` : "e.g. 4.5"}
                disabled={disabled}
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1">
                Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={entry.notes ?? ""}
                onChange={(e) => onNotes(e.target.value)}
                placeholder="What went well / what didn't"
                disabled={disabled}
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] disabled:bg-gray-50 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom strip — only when scored, shows what the rating means */}
      {selectedMeta && (
        <div className={clsx("px-4 py-1.5 rounded-b-xl text-[11px] font-semibold border-t border-gray-100", selectedMeta.text)}>
          {selectedMeta.full}
        </div>
      )}
    </div>
  );
}
