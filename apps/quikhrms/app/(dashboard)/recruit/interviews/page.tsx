"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/number-input";
import { Tooltip } from "@/components/hrms/tooltip";
import { clsx } from "clsx";
import { Video, Phone, Users, Calendar, Link2, MapPin, Star, Check, X, AlertCircle, ExternalLink, Pencil, CalendarPlus, Repeat, Bell, Search, Filter as FilterIcon, MoreHorizontal, ChevronLeft, ChevronRight, CheckCircle2, Clock, Hourglass, ArrowUpDown, Download, Copy, Eye } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { useToast } from "@/components/hrms/toast";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";

const AVATAR_PALETTE: Array<{ bg: string; text: string }> = [
  { bg: "bg-rose-100",    text: "text-rose-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-green-100",    text: "text-green-700" },
  { bg: "bg-amber-100",   text: "text-amber-700" },
  { bg: "bg-violet-100",  text: "text-violet-700" },
  { bg: "bg-sky-100",     text: "text-sky-700" },
  { bg: "bg-pink-100",    text: "text-pink-700" },
  { bg: "bg-teal-100",    text: "text-teal-700" },
];
function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}
function Avatar({ first, last, size = 36 }: { first: string; last: string; size?: number }) {
  const initials = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  const c = AVATAR_PALETTE[hashIndex(`${first}${last}`, AVATAR_PALETTE.length)];
  return (
    <div className={clsx("rounded-full flex items-center justify-center font-semibold shrink-0", c.bg, c.text)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials || "?"}
    </div>
  );
}

const STAGE_PILL: Record<string, string> = {
  Screening:          "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PhoneScreen:        "bg-green-50 text-green-700 ring-green-200",
  TechnicalInterview: "bg-violet-50 text-violet-700 ring-violet-200",
  ManagerInterview:   "bg-orange-50 text-orange-700 ring-orange-200",
  HRInterview:        "bg-sky-50 text-sky-700 ring-sky-200",
  Assessment:         "bg-purple-50 text-purple-700 ring-purple-200",
  FinalRound:         "bg-green-50 text-green-700 ring-green-200",
};
const defaultStagePill = "bg-slate-50 text-slate-700 ring-slate-200";

interface AppOption {
  id: string;
  currentStage: string | null;
  candidate: { firstName: string; lastName: string; email: string };
  requisition: { title: string; requisitionNumber: string; pipelineId: string | null; interviewPanel?: string[] | null };
}

interface EmpOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  jobTitle: string | null;
}

interface InterviewItem {
  id: string;
  round: number;
  type: string;
  scheduledAt: string;
  duration: number;
  status: string;
  location: string | null;
  meetingLink: string | null;
  interviewer: { id: string; firstName: string; lastName: string; workEmail?: string | null };
  applicationId: string;
  application: {
    id: string;
    candidate: { id: string; firstName: string; lastName: string; email: string };
    requisition: { title: string };
  };
  scorecard: {
    overallRating: number;
    recommendation: string;
    strengths?: string | null;
    concerns?: string | null;
    overallComments?: string | null;
    submittedAt?: string | null;
  } | null;
  feedbackRequestSentAt?: string | null;
  reminderCount?: number;
  lastReminderAt?: string | null;
}

const statusColors: Record<string, string> = {
  IntScheduled: "bg-[#dcfce7] text-[#16a34a]",
  IntCompleted: "bg-green-100 text-green-700",
  IntCancelled: "bg-red-100 text-red-700",
  IntNoShow: "bg-gray-100 text-gray-500",
  IntRescheduled: "bg-yellow-100 text-yellow-700",
};

const RECOMMENDATION_LABEL: Record<string, { label: string; color: string }> = {
  StrongHire:   { label: "Strong Approve", color: "text-emerald-700" },
  Hire:         { label: "Approve",        color: "text-green-600" },
  MaybeHire:    { label: "On Hold",        color: "text-amber-600" },
  NoHire:       { label: "Reject",         color: "text-red-600" },
  StrongNoHire: { label: "Strong Reject",  color: "text-red-700" },
};

const typeIcons: Record<string, React.ReactNode> = {
  Video: <Video size={14} />, Phone: <Phone size={14} />, Panel: <Users size={14} />,
};

// Columns for the styled .xlsx export — mirrors the visible table columns.
const INTERVIEW_EXCEL_COLUMNS = [
  { header: "Candidate", key: "candidate", width: 22 },
  { header: "Email", key: "email", width: 28 },
  { header: "Position", key: "position", width: 24 },
  { header: "Interviewer", key: "interviewer", width: 22 },
  { header: "Stage", key: "stage", width: 18 },
  { header: "Round", key: "round", width: 10 },
  { header: "Date", key: "date", width: 16 },
  { header: "Rating", key: "rating", width: 12 },
  { header: "Recommendation", key: "recommendation", width: 18 },
  { header: "Status", key: "status", width: 14 },
];

export default function InterviewsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const emptyForm = { applicationId: "", interviewerId: "", additionalInterviewerIds: [] as string[], round: 1, stage: "", type: "Video" as string, scheduledAt: "", duration: 60, meetingLink: "", location: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [feedbackTarget, setFeedbackTarget] = useState<InterviewItem | null>(null);
  // Combined feedback view — all of one candidate's rounds that have feedback,
  // shown together in a single dialog (not per-round pop-ups).
  const [feedbackGroup, setFeedbackGroup] = useState<{ candidate: string; position: string; rounds: InterviewItem[] } | null>(null);
  const openFeedbackGroup = (its: InterviewItem[]) => {
    const rounds = its.filter((x) => x.scorecard).sort((a, b) => a.round - b.round);
    if (!rounds.length) return;
    const c = rounds[0].application.candidate;
    setFeedbackGroup({
      candidate: `${c.firstName} ${c.lastName}`.trim(),
      position: rounds[0].application.requisition.title,
      rounds,
    });
  };
  const [rescheduleTarget, setRescheduleTarget] = useState<InterviewItem | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ scheduledAt: "", meetingLink: "", location: "" });
  const [feedback, setFeedback] = useState({ overallRating: 7, recommendation: "Hire" as string, strengths: "", concerns: "", overallComments: "" });
  const [confirmAction, setConfirmAction] = useState<{ interview: InterviewItem; kind: "cancel" | "noshow" } | null>(null);
  const [actionReason, setActionReason] = useState("");
  // After scheduling, the API auto-queues invite emails to both candidate and
  // interviewer and (for Video/Panel) auto-generates a Teams meeting link. We
  // hold the created interview so we can surface that link back to the recruiter
  // — mirroring the pipeline page's Schedule flow instead of re-sending mail.
  const [scheduleResult, setScheduleResult] = useState<InterviewItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["interviews"],
    queryFn: () => api.get<InterviewItem[]>("/api/v1/hrms/recruit/interviews?limit=100"),
  });

  const { data: pipelinesData } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<{ id: string; name: string; stages: { name: string; sendMail: boolean; mailTemplate: string | null }[]; isDefault: boolean }[]>("/api/v1/hrms/recruit/pipelines"),
  });

  const { data: appsData } = useQuery({
    queryKey: ["active-applications"],
    queryFn: () => api.get<AppOption[]>("/api/v1/hrms/recruit/applications?status=AppActive&limit=200"),
    enabled: showCreate,
  });

  // ── Pipeline stages for the SELECTED candidate ────────────────────
  // Each application → requisition → pipelineId. We look up THAT pipeline's
  // stages, not the tenant default — so multi-pipeline orgs see the right
  // funnel for each candidate. Falls back to default pipeline before a
  // candidate is picked.
  const allPipelines = pipelinesData?.data ?? [];
  const selectedApp = (appsData?.data ?? []).find((a) => a.id === form.applicationId);
  const selectedPipeline =
    (selectedApp?.requisition.pipelineId
      ? allPipelines.find((p) => p.id === selectedApp.requisition.pipelineId)
      : null)
    ?? allPipelines.find((p) => p.isDefault)
    ?? allPipelines[0];
  const pipelineStages: string[] = (selectedPipeline?.stages ?? []).map((s) => s.name);
  // Skip terminal stages — interviews happen before Offer/Hired.
  const stageForInterview = pipelineStages.filter((s) => !/^(offer|hired|rejected)$/i.test(s));

  // Stages already cleared by this candidate. We treat any stage with a smaller
  // index than the application's currentStage as completed (the candidate has
  // moved past it). If currentStage is a terminal stage (Offer/Hired) all
  // interview rounds are done. currentStage itself is still selectable — that's
  // the upcoming round we're scheduling for.
  const currentStageIdx = selectedApp?.currentStage
    ? stageForInterview.indexOf(selectedApp.currentStage)
    : -1;
  const isStageCompleted = (s: string): boolean => {
    if (!selectedApp?.currentStage) return false;
    if (/^(offer|hired|rejected)$/i.test(selectedApp.currentStage)) return true;
    if (currentStageIdx < 0) return false;
    return stageForInterview.indexOf(s) < currentStageIdx;
  };

  const { data: empData } = useQuery({
    queryKey: ["interviewer-employees"],
    queryFn: () => api.get<EmpOption[]>("/api/v1/hrms/employees?limit=200"),
    enabled: showCreate,
  });

  // #3 — restrict the interviewer dropdown to the panel chosen on the JR.
  // Falls back to all employees if the role has no panel (or none matched).
  const panelIds: string[] = Array.isArray(selectedApp?.requisition?.interviewPanel)
    ? (selectedApp!.requisition.interviewPanel as string[])
    : [];
  const allEmps = empData?.data ?? [];
  const panelEmps = panelIds.length ? allEmps.filter((e) => panelIds.includes(e.id)) : [];
  const interviewerChoices = panelEmps.length ? panelEmps : allEmps;
  const panelRestricted = panelEmps.length > 0;

  const invalidateRecruit = () => {
    qc.invalidateQueries({ queryKey: ["interviews"] });
    qc.invalidateQueries({ queryKey: ["pipeline-apps"] });
    qc.invalidateQueries({ queryKey: ["offers"] });
  };

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post<InterviewItem>("/api/v1/hrms/recruit/interviews", body),
    onSuccess: (res) => {
      invalidateRecruit();
      setShowCreate(false);
      // The create endpoint already queues invite emails to both parties and
      // auto-generates the Teams link — no separate send step. Show the result.
      if (res?.data) {
        setScheduleResult(res.data);
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      api.patch(`/api/v1/hrms/recruit/interviews/${id}`, { status, ...(reason ? { reason } : {}) }),
    onSuccess: () => {
      invalidateRecruit();
      setConfirmAction(null);
      setActionReason("");
    },
  });

  const rescheduleMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { scheduledAt: string; meetingLink?: string; location?: string } }) =>
      api.patch(`/api/v1/hrms/recruit/interviews/${id}`, body),
    onSuccess: () => {
      invalidateRecruit();
      setRescheduleTarget(null);
    },
  });

  const feedbackMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof feedback }) =>
      api.patch(`/api/v1/hrms/recruit/interviews/${id}`, body),
    onSuccess: () => {
      invalidateRecruit();
      setFeedbackTarget(null);
      setFeedback({ overallRating: 7, recommendation: "Hire", strengths: "", concerns: "", overallComments: "" });
    },
  });

  const remindMut = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.post<{ sent: boolean; to: string; reminderLevel: number }>(
        `/api/v1/hrms/recruit/interviews/${id}/send-feedback-reminder`,
        {},
      ),
    onSuccess: () => {
      invalidateRecruit();
    },
  });

  const interviews = data?.data ?? [];

  // "Feedback pending" quick filter — completed interviews still awaiting a scorecard.
  const [feedbackPendingOnly, setFeedbackPendingOnly] = useState(false);
  const feedbackPendingCount = useMemo(
    () => interviews.filter((i) => !i.scorecard && i.status !== "IntCancelled" && i.status !== "IntNoShow" && new Date(i.scheduledAt).getTime() < Date.now()).length,
    [interviews],
  );

  // Highest round per application — used to hide the "Schedule next" icon on
  // older completed rounds once a later round already exists.
  const maxRoundByApp = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of interviews) {
      const prev = m.get(it.applicationId) ?? 0;
      if (it.round > prev) m.set(it.applicationId, it.round);
    }
    return m;
  }, [interviews]);

  // Round numbers per application that already have a Completed interview.
  // Any other (e.g. still-Scheduled) attempt at the SAME round is treated as
  // superseded — its action buttons are hidden so HR doesn't act on a stale row.
  const completedRoundsByApp = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const it of interviews) {
      if (it.status !== "IntCompleted") continue;
      if (!m.has(it.applicationId)) m.set(it.applicationId, new Set());
      m.get(it.applicationId)!.add(it.round);
    }
    return m;
  }, [interviews]);

  // A still-Scheduled interview at a round that already has a Completed one is a
  // stale duplicate ("Superseded"). Excluded from counts + the "N rounds" badge
  // so the totals reflect real interviews, not leftovers from reschedules.
  const isSuperseded = (i: InterviewItem) =>
    i.status === "IntScheduled" && !i.scorecard && (completedRoundsByApp.get(i.applicationId)?.has(i.round) ?? false);

  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortDesc, setSortDesc] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<{ status: string[]; type: string[]; stage: string[]; interviewer: string[]; requisition: string[] }>({ status: [], type: [], stage: [], interviewer: [], requisition: [] });
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  const STATUS_OPTS = ["IntScheduled", "IntCompleted", "IntCancelled", "IntNoShow", "IntRescheduled"];
  const TYPE_OPTS = ["Phone", "Video", "InPerson", "Panel", "TakeHome", "GroupDiscussion"];
  const activeFilterCount = filters.status.length + filters.type.length + filters.stage.length + filters.interviewer.length + filters.requisition.length;

  // Distinct interviewers + positions present in the loaded interviews — options for the new filters.
  const interviewerOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of interviews) m.set(i.interviewer.id, `${i.interviewer.firstName} ${i.interviewer.lastName}`.trim());
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [interviews]);
  const requisitionOpts = useMemo(
    () => Array.from(new Set(interviews.map((i) => i.application.requisition.title))).sort(),
    [interviews],
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) setOpenRowMenu(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of interviews) {
      const d = new Date(i.scheduledAt);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const opts = Array.from(set).sort().reverse().map((ym) => {
      const [y, m] = ym.split("-").map(Number);
      return { value: ym, label: new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" }) };
    });
    return [{ value: "all", label: "All Time" }, ...opts];
  }, [interviews]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return interviews.filter((i) => {
      if (q) {
        const hay = `${i.application.candidate.firstName} ${i.application.candidate.lastName} ${i.application.candidate.email} ${i.application.requisition.title} ${i.interviewer.firstName} ${i.interviewer.lastName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (monthFilter !== "all") {
        const d = new Date(i.scheduledAt);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (ym !== monthFilter) return false;
      }
      if (filters.status.length && !filters.status.includes(i.status)) return false;
      if (filters.type.length && !filters.type.includes(i.type)) return false;
      if (filters.stage.length) {
        const stageName = stageForInterview[i.round - 1] ?? `Round ${i.round}`;
        if (!filters.stage.includes(stageName)) return false;
      }
      if (filters.interviewer.length && !filters.interviewer.includes(i.interviewer.id)) return false;
      if (filters.requisition.length && !filters.requisition.includes(i.application.requisition.title)) return false;
      if (feedbackPendingOnly && !(!i.scorecard && i.status !== "IntCancelled" && i.status !== "IntNoShow" && new Date(i.scheduledAt).getTime() < Date.now())) return false;
      return true;
    }).sort((a, b) => {
      const da = new Date(a.scheduledAt).getTime();
      const db = new Date(b.scheduledAt).getTime();
      return sortDesc ? db - da : da - db;
    });
  }, [interviews, searchQuery, monthFilter, sortDesc, filters, stageForInterview, feedbackPendingOnly]);

  const stats = useMemo(() => {
    // Don't count superseded (stale) rounds so the totals reflect real interviews.
    const counted = filtered.filter((i) => !isSuperseded(i));
    const total = counted.length;
    const completed = counted.filter((i) => i.status === "IntCompleted").length;
    const scheduled = counted.filter((i) => i.status === "IntScheduled" && new Date(i.scheduledAt).getTime() >= Date.now()).length;
    const pending = counted.filter((i) => i.status === "IntScheduled" && new Date(i.scheduledAt).getTime() < Date.now()).length;
    // Everything else (Cancelled, No-show, Rescheduled, …) so the four buckets
    // partition the total exactly and the percentages sum to 100%.
    const cancelled = Math.max(0, total - completed - scheduled - pending);
    const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0.0%";
    return { total, completed, scheduled, pending, cancelled, completedPct: pct(completed), scheduledPct: pct(scheduled), pendingPct: pct(pending), cancelledPct: pct(cancelled) };
  }, [filtered]);

  // Group interviews by candidate (applicationId). The list is paginated by
  // candidate count — each candidate is one summary row with a toggle that
  // reveals the rest of their rounds beneath it.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (appId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId); else next.add(appId);
      return next;
    });
  };

  const grouped = useMemo(() => {
    // A candidate appears if ANY of their rounds matches the active filters…
    const matchedAppIds = new Set(filtered.map((i) => i.applicationId));
    // …but each group holds ALL of that candidate's rounds, so the summary row
    // always reflects their true latest round (a status filter narrows WHO shows,
    // not what a candidate's current status looks like).
    const map = new Map<string, InterviewItem[]>();
    for (const it of interviews) {
      if (!matchedAppIds.has(it.applicationId)) continue;
      if (!map.has(it.applicationId)) map.set(it.applicationId, []);
      map.get(it.applicationId)!.push(it);
    }
    // Within each group: latest round on top.
    for (const list of map.values()) {
      list.sort((a, b) => b.round - a.round || new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    }
    // Across groups: latest interview date wins, honoring the column sort.
    return Array.from(map.entries()).sort((a, b) => {
      const da = Math.max(...a[1].map((x) => new Date(x.scheduledAt).getTime()));
      const db = Math.max(...b[1].map((x) => new Date(x.scheduledAt).getTime()));
      return sortDesc ? db - da : da - db;
    });
  }, [filtered, interviews, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paginatedGroups = grouped.slice(start, start + pageSize);

  const exportToExcel = () => {
    if (filtered.length === 0) return;
    const headers = [
      "Candidate", "Email", "Position", "Interviewer", "Stage", "Round",
      "Type", "Scheduled At", "Duration (min)", "Status",
      "Meeting Link", "Location", "Rating", "Recommendation",
    ];
    const rows = filtered.map((i) => {
      const stageName = stageForInterview[i.round - 1] ?? `Round ${i.round}`;
      const rec = i.scorecard?.recommendation ?? "";
      const recLabel = RECOMMENDATION_LABEL[rec]?.label ?? rec;
      return [
        `${i.application.candidate.firstName} ${i.application.candidate.lastName}`,
        i.application.candidate.email,
        i.application.requisition.title,
        `${i.interviewer.firstName} ${i.interviewer.lastName}`,
        stageName.replace(/([A-Z])/g, " $1").trim(),
        String(i.round),
        i.type,
        new Date(i.scheduledAt).toLocaleString("en-IN"),
        String(i.duration),
        i.status.replace("Int", ""),
        i.meetingLink ?? "",
        i.location ?? "",
        i.scorecard ? `${i.scorecard.overallRating}/10` : "",
        recLabel,
      ];
    });
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = monthFilter === "all" ? "all" : monthFilter;
    a.href = url;
    a.download = `interviews-${scope}-${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Flat, human-readable rows for the styled .xlsx export — same filtered set
  // and same visible columns the CSV export uses.
  const excelRows = useMemo(
    () =>
      filtered.map((i) => {
        const stageName = stageForInterview[i.round - 1] ?? `Round ${i.round}`;
        const rec = i.scorecard?.recommendation ?? "";
        const recLabel = RECOMMENDATION_LABEL[rec]?.label ?? rec;
        const isPastDue = i.status === "IntScheduled" && new Date(i.scheduledAt).getTime() < Date.now();
        const statusLabel = isPastDue ? "Pending" : i.status.replace("Int", "");
        return {
          candidate: `${i.application.candidate.firstName} ${i.application.candidate.lastName}`.trim(),
          email: i.application.candidate.email,
          position: i.application.requisition.title,
          interviewer: `${i.interviewer.firstName} ${i.interviewer.lastName}`.trim(),
          stage: stageName.replace(/([A-Z])/g, " $1").trim(),
          round: i.round,
          date: new Date(i.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          rating: i.scorecard ? `${i.scorecard.overallRating}/10` : "",
          recommendation: recLabel,
          status: statusLabel,
        };
      }),
    [filtered, stageForInterview],
  );

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-page-title text-gray-900 leading-tight">Interviews</h1>
          <p className="text-xs text-gray-500 mt-1">Track and manage all candidate interviews in one place.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><Calendar size={20} /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Total Interviews</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">{stats.total}</p>
            <p className="text-[11px] text-slate-400">{monthFilter === "all" ? "All time" : monthOptions.find((m) => m.value === monthFilter)?.label}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 size={20} /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Completed</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">{stats.completed}</p>
            <p className="text-[11px] text-emerald-600 font-semibold">{stats.completedPct}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center"><Clock size={20} /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Scheduled</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">{stats.scheduled}</p>
            <p className="text-[11px] text-sky-600 font-semibold">{stats.scheduledPct}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Hourglass size={20} /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Pending</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">{stats.pending}</p>
            <p className="text-[11px] text-amber-600 font-semibold">{stats.pendingPct}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><X size={20} /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Cancelled / No-show</p>
            <p className="text-xl font-bold text-slate-900 leading-tight">{stats.cancelled}</p>
            <p className="text-[11px] text-red-600 font-semibold">{stats.cancelledPct}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search by candidate, position..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-green-500/30 focus:border-green-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setFeedbackPendingOnly((v) => !v); setPage(1); }}
              className={clsx("inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-semibold transition",
                feedbackPendingOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
              title="Show only completed interviews awaiting feedback"
            >
              <Bell size={13} /> Feedback pending
              {feedbackPendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">{feedbackPendingCount}</span>
              )}
            </button>
            <div ref={filterRef} className="relative">
              <Tooltip content={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : "Filters"} disabled={showFilters}>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={clsx("relative inline-flex items-center justify-center w-9 h-9 rounded-lg border transition",
                    showFilters ? "border-[#22c55e] bg-green-50 text-[#22c55e]" : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#22c55e]")}
                >
                  <FilterIcon size={12} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
                  )}
                </button>
              </Tooltip>
              {showFilters && (() => {
                const STATUS_META: Record<string, { label: string; selBg: string; selText: string; selRing: string }> = {
                  IntScheduled:   { label: "Scheduled",   selBg: "bg-green-500",    selText: "text-white", selRing: "ring-green-500" },
                  IntCompleted:   { label: "Completed",   selBg: "bg-emerald-500", selText: "text-white", selRing: "ring-emerald-500" },
                  IntCancelled:   { label: "Cancelled",   selBg: "bg-red-500",     selText: "text-white", selRing: "ring-red-500" },
                  IntNoShow:      { label: "No Show",     selBg: "bg-slate-500",   selText: "text-white", selRing: "ring-slate-500" },
                  IntRescheduled: { label: "Rescheduled", selBg: "bg-amber-500",   selText: "text-white", selRing: "ring-amber-500" },
                };
                const TYPE_ICONS: Record<string, React.ReactNode> = {
                  Phone: <Phone size={11} />, Video: <Video size={11} />, InPerson: <MapPin size={11} />,
                  Panel: <Users size={11} />, TakeHome: <Pencil size={11} />, GroupDiscussion: <Users size={11} />,
                };
                const toggleArr = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
                return (
                  <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-slate-200 rounded-xl shadow-2xl z-30 overflow-hidden">
                    <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FilterIcon size={14} className="text-[#22c55e]" />
                        <h4 className="text-[13px] font-semibold text-slate-900">Filter Interviews</h4>
                        {activeFilterCount > 0 && (
                          <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
                        )}
                      </div>
                      <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-700 p-0.5 rounded">
                        <X size={12} />
                      </button>
                    </div>

                    <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Status</p>
                          {filters.status.length > 0 && (
                            <button onClick={() => { setFilters({ ...filters, status: [] }); setPage(1); }} className="text-[10px] text-slate-400 hover:text-[#22c55e]">Reset</button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {STATUS_OPTS.map((s) => {
                            const m = STATUS_META[s];
                            const on = filters.status.includes(s);
                            return (
                              <button
                                key={s}
                                onClick={() => { setFilters({ ...filters, status: toggleArr(filters.status, s) }); setPage(1); }}
                                className={clsx("px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition",
                                  on ? `${m.selBg} ${m.selText} ${m.selRing} shadow-sm` : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}
                              >
                                {on && <Check size={10} className="inline mr-0.5 -mt-0.5" />}
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Type</p>
                          {filters.type.length > 0 && (
                            <button onClick={() => { setFilters({ ...filters, type: [] }); setPage(1); }} className="text-[10px] text-slate-400 hover:text-[#22c55e]">Reset</button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {TYPE_OPTS.map((t) => {
                            const on = filters.type.includes(t);
                            return (
                              <button
                                key={t}
                                onClick={() => { setFilters({ ...filters, type: toggleArr(filters.type, t) }); setPage(1); }}
                                className={clsx("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition",
                                  on ? "bg-green-600 text-white ring-[#22c55e] shadow-sm" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}
                              >
                                {TYPE_ICONS[t]} {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {stageForInterview.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Pipeline Stage</p>
                            {filters.stage.length > 0 && (
                              <button onClick={() => { setFilters({ ...filters, stage: [] }); setPage(1); }} className="text-[10px] text-slate-400 hover:text-[#22c55e]">Reset</button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {stageForInterview.map((s) => {
                              const on = filters.stage.includes(s);
                              const cls = STAGE_PILL[s] ?? defaultStagePill;
                              return (
                                <button
                                  key={s}
                                  onClick={() => { setFilters({ ...filters, stage: toggleArr(filters.stage, s) }); setPage(1); }}
                                  className={clsx("px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition",
                                    on ? `${cls} shadow-sm ring-2` : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}
                                >
                                  {s.replace(/([A-Z])/g, " $1").trim()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {interviewerOpts.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Interviewer (HR)</p>
                            {filters.interviewer.length > 0 && (
                              <button onClick={() => { setFilters({ ...filters, interviewer: [] }); setPage(1); }} className="text-[10px] text-slate-400 hover:text-[#22c55e]">Reset</button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {interviewerOpts.map((o) => {
                              const on = filters.interviewer.includes(o.id);
                              return (
                                <button key={o.id}
                                  onClick={() => { setFilters({ ...filters, interviewer: toggleArr(filters.interviewer, o.id) }); setPage(1); }}
                                  className={clsx("px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition",
                                    on ? "bg-green-600 text-white ring-[#22c55e] shadow-sm" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}>
                                  {on && <Check size={10} className="inline mr-0.5 -mt-0.5" />}{o.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {requisitionOpts.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Position</p>
                            {filters.requisition.length > 0 && (
                              <button onClick={() => { setFilters({ ...filters, requisition: [] }); setPage(1); }} className="text-[10px] text-slate-400 hover:text-[#22c55e]">Reset</button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {requisitionOpts.map((t) => {
                              const on = filters.requisition.includes(t);
                              return (
                                <button key={t}
                                  onClick={() => { setFilters({ ...filters, requisition: toggleArr(filters.requisition, t) }); setPage(1); }}
                                  className={clsx("px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition",
                                    on ? "bg-green-600 text-white ring-[#22c55e] shadow-sm" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50")}>
                                  {on && <Check size={10} className="inline mr-0.5 -mt-0.5" />}{t}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">
                        {filtered.length} of {interviews.length} match
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setFilters({ status: [], type: [], stage: [], interviewer: [], requisition: [] }); setPage(1); }}
                          disabled={activeFilterCount === 0}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Reset all
                        </button>
                        <button
                          onClick={() => setShowFilters(false)}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <Tooltip content={filtered.length === 0 ? "Nothing to export" : `Export ${filtered.length} row${filtered.length === 1 ? "" : "s"} to Excel`}>
              <button
                onClick={exportToExcel}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={13} /> Export
              </button>
            </Tooltip>
            <ExcelExportButton
              filename="interviews"
              sheetName="Interviews"
              columns={INTERVIEW_EXCEL_COLUMNS}
              rows={excelRows}
              label="Excel"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <div className="inline-flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-400" />
              <Select
                value={monthFilter}
                onChange={(v) => { setMonthFilter(v); setPage(1); }}
                options={monthOptions}
                size="sm"
                className="min-w-[150px]"
              />
            </div>
          </div>
        </div>

        {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Calendar size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="text-[13px] font-semibold">No interviews found</p>
            <p className="text-xs text-slate-400 mt-0.5">{searchQuery || monthFilter !== "all" ? "Try clearing filters" : "Schedule your first interview"}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Candidate</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Position</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Interviewer</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">
                  <button onClick={() => setSortDesc((v) => !v)} className="inline-flex items-center gap-1 hover:text-[#22c55e]">
                    Schedule <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Rating</th>
                <th className="text-right px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedGroups.flatMap(([appId, items], gIdx) => {
                const isOpen = expanded.has(appId);
                // Count real rounds only (exclude superseded/stale duplicates).
                const rounds = items.filter((i) => !isSuperseded(i)).length;
                const canExpand = items.length > 1;
                // Latest round (already first per sort) → the summary row.
                // Older rounds → rendered as nested rows when expanded.
                const latest = items[0];
                const others = items.slice(1);
                const visible: Array<{ interview: InterviewItem; isChild: boolean }> = [
                  { interview: latest, isChild: false },
                  ...(isOpen ? others.map((it) => ({ interview: it, isChild: true })) : []),
                ];
                return visible.map(({ interview: i, isChild }, vIdx) => {
                const idx = gIdx + vIdx;
                const dt = new Date(i.scheduledAt);
                const stageName = stageForInterview[i.round - 1] ?? `Round ${i.round}`;
                const stageCls = STAGE_PILL[stageName] ?? defaultStagePill;
                // A scheduled interview whose time has passed is shown as "Pending"
                // (feedback due) — matches how the summary tiles bucket it.
                const isPastDue = i.status === "IntScheduled" && dt.getTime() < Date.now();
                const statusLabel = isPastDue ? "Pending" : i.status.replace("Int", "");
                // How many of this candidate's rounds carry feedback (drives the
                // single combined "view feedback" action on the summary row).
                const groupFeedbackCount = items.filter((it) => it.scorecard).length;
                return (
                <tr
                  key={i.id}
                  className={clsx(
                    "row-stagger border-b border-slate-100 transition",
                    isChild ? "bg-slate-50/40 hover:bg-slate-50" : "hover:bg-slate-50/60",
                  )}
                  style={{ ["--i" as never]: Math.min(idx, 10) }}
                >
                  <td className={clsx("px-4 py-2.5", isChild && "pl-10")}>
                    <div className="flex items-center gap-2.5">
                      {!isChild && canExpand ? (
                        <button
                          onClick={() => toggleExpand(appId)}
                          aria-label={isOpen ? "Collapse rounds" : `Show all ${rounds} rounds`}
                          className="w-5 h-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                          <ChevronRight size={12} className={clsx("transition-transform", isOpen && "rotate-90")} />
                        </button>
                      ) : !isChild ? (
                        <span className="w-5 h-5 inline-block" />
                      ) : (
                        <span className="w-5 h-5 inline-flex items-center justify-center text-slate-300 text-[10px]">↳</span>
                      )}
                      {isChild ? (
                        <Avatar first={i.application.candidate.firstName} last={i.application.candidate.lastName} size={24} />
                      ) : (
                        <Avatar first={i.application.candidate.firstName} last={i.application.candidate.lastName} size={36} />
                      )}
                      <div className="min-w-0">
                        <p className={clsx("font-semibold text-slate-900 truncate", isChild ? "text-[12px]" : "text-[13px]")}>
                          {i.application.candidate.firstName} {i.application.candidate.lastName}
                          {!isChild && canExpand && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">{rounds} rounds</span>
                          )}
                        </p>
                        {!isChild && <p className="text-[11px] text-slate-500 truncate">{i.application.candidate.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">{i.application.requisition.title}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar first={i.interviewer.firstName} last={i.interviewer.lastName} size={28} />
                      <span className="text-xs text-slate-700">{i.interviewer.firstName} {i.interviewer.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-xs text-slate-700 flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      {dt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Clock size={10} /> {i.duration}min</span>
                      {i.meetingLink && i.status === "IntScheduled" && (dt.getTime() + i.duration * 60000) > Date.now() && (
                        <a href={i.meetingLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#22c55e] hover:underline inline-flex items-center gap-0.5">
                          <ExternalLink size={10} /> Join link
                        </a>
                      )}
                    </div>
                    {i.location && <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1"><MapPin size={10} /> {i.location}</p>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1", stageCls)}>
                      <span className="w-4 h-4 rounded-full bg-white/70 text-[9px] font-bold inline-flex items-center justify-center">{i.round}</span>
                      {stageName.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2.5 py-0.5 rounded-full text-[11px] font-medium ring-1",
                      isPastDue ? "bg-amber-50 text-amber-700 ring-amber-200"
                      : i.status === "IntCompleted" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : i.status === "IntScheduled" ? "bg-green-50 text-green-700 ring-green-200"
                      : i.status === "IntCancelled" ? "bg-red-50 text-red-700 ring-red-200"
                      : i.status === "IntNoShow" ? "bg-slate-100 text-slate-600 ring-slate-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200",
                    )}>{statusLabel}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {i.scorecard ? (() => {
                      const r = RECOMMENDATION_LABEL[i.scorecard.recommendation] ?? { label: i.scorecard.recommendation, color: "text-slate-600" };
                      return (
                        <button
                          type="button"
                          onClick={() => openFeedbackGroup(items)}
                          title="View all feedback for this candidate"
                          className="group text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-slate-50 transition"
                        >
                          <p className="font-semibold text-slate-900 group-hover:underline">{i.scorecard.overallRating}/10</p>
                          <p className={clsx("text-[11px] font-medium", r.color)}>{r.label}</p>
                        </button>
                      );
                    })() : <span className="text-[11px] text-slate-400">Pending</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {/* One combined feedback view for the whole candidate, on the
                          summary row — lists every round's feedback together. */}
                      {!isChild && groupFeedbackCount > 0 && (
                        <Tooltip content={`View feedback · ${groupFeedbackCount} round${groupFeedbackCount > 1 ? "s" : ""}`}>
                          <button
                            onClick={() => openFeedbackGroup(items)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-green-50 hover:text-[#22c55e] hover:ring-[#bbf7d0] transition"
                          >
                            <Eye size={12} />
                          </button>
                        </Tooltip>
                      )}
                      {i.status === "IntScheduled" && !i.scorecard && (completedRoundsByApp.get(i.applicationId)?.has(i.round) ? (
                        <span className="text-[11px] text-slate-400 italic px-2">Superseded</span>
                      ) : (
                        <>
                          {new Date(i.scheduledAt).getTime() < Date.now() && (
                            <Tooltip content={i.feedbackRequestSentAt ? `Send feedback reminder (sent ${i.reminderCount ?? 0}x)` : "Send feedback request"}>
                              <button
                                onClick={() => toast.promise(remindMut.mutateAsync({ id: i.id }), { loading: "Sending reminder…", success: "Reminder sent", error: "Couldn't send reminder" })}
                                disabled={remindMut.isPending && remindMut.variables?.id === i.id}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-amber-600 ring-1 ring-amber-200 hover:bg-amber-50 transition disabled:opacity-50"
                              >
                                <Bell size={12} />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip content="Reschedule interview">
                            <button
                              onClick={() => {
                                // datetime-local expects LOCAL wall-clock time.
                                // toISOString() is UTC, so shift by the tz offset
                                // to prefill the correct local (IST) time.
                                const d = new Date(i.scheduledAt);
                                const localVal = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                setRescheduleForm({
                                  scheduledAt: localVal,
                                  meetingLink: i.meetingLink ?? "",
                                  location: i.location ?? "",
                                });
                                setRescheduleTarget(i);
                              }}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-[#22c55e] transition"
                            >
                              <Repeat size={12} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Mark as no-show">
                            <button
                              onClick={() => { setActionReason(""); setConfirmAction({ interview: i, kind: "noshow" }); }}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:ring-amber-200 transition"
                            >
                              <AlertCircle size={12} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Cancel interview">
                            <button
                              onClick={() => { setActionReason(""); setConfirmAction({ interview: i, kind: "cancel" }); }}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-red-500 ring-1 ring-red-200 hover:bg-red-50 transition"
                            >
                              <X size={12} />
                            </button>
                          </Tooltip>
                        </>
                      ))}
                      {i.status === "IntCompleted" && (() => {
                        const nextStageIdx = i.round;
                        const nextStage = stageForInterview[nextStageIdx];
                        const passed = i.scorecard && ["Hire", "StrongHire"].includes(i.scorecard.recommendation);
                        const laterRoundExists = (maxRoundByApp.get(i.applicationId) ?? 0) > i.round;
                        return (
                          <>
                            {!i.scorecard && (
                              <Tooltip content={i.feedbackRequestSentAt ? `Send feedback reminder (sent ${i.reminderCount ?? 0}x)` : "Send feedback request"}>
                                <button
                                  onClick={() => toast.promise(remindMut.mutateAsync({ id: i.id }), { loading: "Sending reminder…", success: "Reminder sent", error: "Couldn't send reminder" })}
                                  disabled={remindMut.isPending && remindMut.variables?.id === i.id}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-amber-600 ring-1 ring-amber-200 hover:bg-amber-50 transition disabled:opacity-50"
                                >
                                  <Bell size={12} />
                                </button>
                              </Tooltip>
                            )}
                            {nextStage && passed && !laterRoundExists && (
                              <Tooltip content={`Schedule ${nextStage.replace(/([A-Z])/g, " $1").trim()}`}>
                                <button
                                  onClick={() => {
                                    setForm({
                                      applicationId: i.application.id,
                                      interviewerId: "",
                                      additionalInterviewerIds: [],
                                      round: nextStageIdx + 1,
                                      stage: nextStage,
                                      type: "Video",
                                      scheduledAt: "",
                                      duration: 60,
                                      meetingLink: "",
                                      location: "",
                                      notes: "",
                                    });
                                    setShowCreate(true);
                                  }}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-[#22c55e] ring-1 ring-[#bbf7d0] hover:bg-green-50 transition"
                                >
                                  <CalendarPlus size={12} />
                                </button>
                              </Tooltip>
                            )}
                            {/* Reschedule is hidden once the interview is completed AND
                                approved (positive recommendation) — that round is settled.
                                Still shown for completed-but-not-yet-approved interviews
                                (no scorecard, or weak/reject), so HR can re-do them. */}
                            {!passed && (
                              <Tooltip content="Redo / reschedule">
                                <button
                                  onClick={() => {
                                    setRescheduleForm({
                                      scheduledAt: new Date(i.scheduledAt).toISOString().slice(0, 16),
                                      meetingLink: i.meetingLink ?? "",
                                      location: i.location ?? "",
                                    });
                                    setRescheduleTarget(i);
                                  }}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-[#22c55e] transition"
                                >
                                  <Repeat size={12} />
                                </button>
                              </Tooltip>
                            )}
                          </>
                        );
                      })()}
                      {i.status === "IntCancelled" && (
                        <Tooltip content="Reschedule interview">
                          <button
                            onClick={() => {
                              setRescheduleForm({
                                scheduledAt: new Date(i.scheduledAt).toISOString().slice(0, 16),
                                meetingLink: i.meetingLink ?? "",
                                location: i.location ?? "",
                              });
                              setRescheduleTarget(i);
                            }}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-[#22c55e] ring-1 ring-[#bbf7d0] hover:bg-green-50 transition"
                          >
                            <Repeat size={12} />
                          </button>
                        </Tooltip>
                      )}
                      {i.status === "IntNoShow" && (
                        <Tooltip content="Reschedule interview">
                          <button
                            onClick={() => {
                              setRescheduleForm({
                                scheduledAt: new Date(i.scheduledAt).toISOString().slice(0, 16),
                                meetingLink: i.meetingLink ?? "",
                                location: i.location ?? "",
                              });
                              setRescheduleTarget(i);
                            }}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-md bg-white text-[#22c55e] ring-1 ring-[#bbf7d0] hover:bg-green-50 transition"
                          >
                            <Repeat size={12} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
                );
                });
              })}
            </tbody>
          </table>
        )}

        {grouped.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{start + 1}</span> to <span className="font-semibold text-slate-700">{Math.min(start + pageSize, grouped.length)}</span> of <span className="font-semibold text-slate-700">{grouped.length}</span> candidates ({filtered.filter((i) => !isSuperseded(i)).length} interviews)
            </p>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={12} />
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(Math.max(0, safePage - 2), Math.max(0, safePage - 2) + 3).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={clsx("w-8 h-8 inline-flex items-center justify-center rounded-md text-xs font-semibold",
                      p === safePage ? "bg-green-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}
                  >{p}</button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
              <Select
                value={String(pageSize)}
                onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                size="sm"
                options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} / page` }))}
              />
            </div>
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Schedule Interview" size="xl">
        <form onSubmit={(e) => { e.preventDefault(); toast.promise(createMut.mutateAsync(form), { loading: "Sending interview invite…", success: "Invite sent", error: "Couldn't send invite" }); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Candidate <span className="text-red-500">*</span></label>
            <Select
              value={form.applicationId}
              onChange={(v) => {
                // Switching candidate may change the pipeline; reset stage if
                // it's not valid (or already cleared) in the new candidate's funnel.
                const next = (appsData?.data ?? []).find((a) => a.id === v);
                const nextPipeline = next?.requisition.pipelineId
                  ? allPipelines.find((p) => p.id === next.requisition.pipelineId)
                  : null;
                const nextStagesAll = (nextPipeline?.stages ?? allPipelines.find((p) => p.isDefault)?.stages ?? []).map((s) => s.name);
                const nextStagesForInterview = nextStagesAll.filter((s) => !/^(offer|hired|rejected)$/i.test(s));
                const nextCurIdx = next?.currentStage ? nextStagesForInterview.indexOf(next.currentStage) : -1;
                const stageIdx = form.stage ? nextStagesForInterview.indexOf(form.stage) : -1;
                const keepStage = stageIdx >= 0 && (nextCurIdx < 0 || stageIdx >= nextCurIdx);
                setForm({ ...form, applicationId: v, stage: keepStage ? form.stage : "" });
              }}
              placeholder="Select candidate..."
              searchable
              options={(appsData?.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.candidate.firstName} ${a.candidate.lastName}`,
                description: `${a.requisition.requisitionNumber} · ${a.requisition.title}${a.currentStage ? ` · ${a.currentStage}` : ""}`,
              }))}
            />
            <p className="mt-1 text-[11px] text-gray-400">Shows active applications (candidates applied to a job).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer <span className="text-red-500">*</span></label>
            <Select
              value={form.interviewerId}
              onChange={(v) => setForm({ ...form, interviewerId: v })}
              placeholder="Select interviewer..."
              searchable
              options={interviewerChoices.map((e) => ({
                value: e.id,
                label: `${e.firstName} ${e.lastName}`,
                description: `${e.employeeCode}${e.jobTitle ? ` · ${e.jobTitle}` : ""}`,
              }))}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              {panelRestricted ? "Showing this role's interview panel." : "Any employee can be picked as interviewer."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional interviewers <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Select
              value=""
              onChange={(v) => {
                if (!v || v === form.interviewerId || form.additionalInterviewerIds.includes(v)) return;
                setForm({ ...form, additionalInterviewerIds: [...form.additionalInterviewerIds, v] });
              }}
              placeholder="Add another interviewer..."
              searchable
              options={interviewerChoices
                .filter((e) => e.id !== form.interviewerId && !form.additionalInterviewerIds.includes(e.id))
                .map((e) => ({
                  value: e.id,
                  label: `${e.firstName} ${e.lastName}`,
                  description: `${e.employeeCode}${e.jobTitle ? ` · ${e.jobTitle}` : ""}`,
                }))}
            />
            {form.additionalInterviewerIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.additionalInterviewerIds.map((id) => {
                  const emp = interviewerChoices.find((e) => e.id === id);
                  const name = emp ? `${emp.firstName} ${emp.lastName}` : id;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-50 text-accent-700 text-xs font-medium pl-2.5 pr-1 py-1 ring-1 ring-accent-200">
                      {name}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, additionalInterviewerIds: form.additionalInterviewerIds.filter((x) => x !== id) })}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-accent-500 hover:bg-accent-100"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-[11px] text-gray-400">
              They receive the same invite email and calendar entry. Feedback is submitted by the primary interviewer.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pipeline Stage <span className="text-red-500">*</span></label>
              <Select
                value={form.stage}
                onChange={(v) => {
                  if (isStageCompleted(v)) return;
                  const idx = stageForInterview.indexOf(v);
                  setForm({ ...form, stage: v, round: idx >= 0 ? idx + 1 : 1 });
                }}
                placeholder={form.applicationId ? "Select stage" : "Pick a candidate first"}
                disabled={!form.applicationId}
                options={stageForInterview.map((s) => {
                  const done = isStageCompleted(s);
                  return {
                    value: s,
                    label: s.replace(/([A-Z])/g, " $1").trim(),
                    description: done ? "Already completed" : undefined,
                    disabled: done,
                  };
                })}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                {selectedPipeline
                  ? <>Stages from <strong>{selectedPipeline.name}</strong> pipeline.{selectedApp?.currentStage && currentStageIdx > 0 ? <> Earlier stages are locked — candidate has cleared them.</> : null}</>
                  : "Pick a candidate to load their pipeline stages."}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={[
                  { value: "Video",           label: "Video Call",       description: "Zoom / Meet / Teams" },
                  { value: "Phone",           label: "Phone Screen",     description: "Voice only" },
                  { value: "InPerson",        label: "In-Person",        description: "On-site" },
                  { value: "Panel",           label: "Panel",            description: "Multiple interviewers" },
                  { value: "TakeHome",        label: "Take-Home Task",   description: "Async assignment" },
                  { value: "GroupDiscussion", label: "Group Discussion", description: "Multi-candidate" },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <NumberInput allowDecimal={false} min={15} value={form.duration} onChange={(v) => setForm({ ...form, duration: v || 60 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; Time <span className="text-red-500">*</span></label>
            <input
              type="datetime-local"
              required
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              value={form.scheduledAt}
              onChange={(e) => {
                let v = e.target.value;
                const minLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                if (v && v < minLocal) v = minLocal;
                setForm({ ...form, scheduledAt: v });
              }}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="mt-1 text-[11px] text-gray-400">Past dates are not allowed.</p>
          </div>

          {(form.type === "Video" || form.type === "Panel") && (() => {
            const invalid = !!form.meetingLink && !/^https?:\/\//.test(form.meetingLink);
            return (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <Link2 size={12} className="text-gray-400" /> Meeting Link
                </label>
                <input type="url" placeholder="Leave blank to auto-generate a Microsoft Teams link"
                  value={form.meetingLink}
                  onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                  className={clsx(
                    "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2",
                    invalid ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-green-500",
                  )} />
                {invalid
                  ? <p className="mt-1 text-[11px] text-red-600">Must start with http:// or https://</p>
                  : <p className="mt-1 text-[11px] text-gray-400">Leave blank and we&apos;ll create a Teams meeting automatically. Paste your own (Meet/Zoom/Teams) to override.</p>}
              </div>
            );
          })()}

          {(form.type === "InPerson" || form.type === "Panel" || form.type === "GroupDiscussion") && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                <MapPin size={12} className="text-gray-400" /> Location {form.type === "InPerson" && <span className="text-red-500">*</span>}
              </label>
              <input type="text" placeholder="e.g. Meeting Room 3, HQ" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea rows={2} placeholder="Topics to cover, focus areas..."
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={
              createMut.isPending
              || !form.applicationId || !form.interviewerId || !form.scheduledAt || !form.stage
              // Meeting link is optional (auto-generated for Video/Panel) — only
              // block on a malformed URL if one was actually typed.
              || ((form.type === "Video" || form.type === "Panel") && !!form.meetingLink && !/^https?:\/\//.test(form.meetingLink))
              || (form.type === "InPerson" && !form.location.trim())
            }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
              {createMut.isPending ? "Scheduling..." : "Schedule Interview"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!feedbackTarget} onClose={() => setFeedbackTarget(null)} title="Submit Interview Feedback" size="lg">
        {feedbackTarget && (
          <form onSubmit={(e) => { e.preventDefault(); feedbackMut.mutate({ id: feedbackTarget.id, body: feedback }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs">
              <div className="font-semibold text-slate-900">{feedbackTarget.application.candidate.firstName} {feedbackTarget.application.candidate.lastName}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {feedbackTarget.application.requisition.title} · R{feedbackTarget.round} · {feedbackTarget.type}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Overall Rating <span className="text-gray-400 font-normal">(out of 10)</span></label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => setFeedback({ ...feedback, overallRating: n })}
                    className={clsx("w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition",
                      n <= feedback.overallRating
                        ? "border-amber-400 bg-amber-50 text-amber-600"
                        : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                    {n}
                  </button>
                ))}
                <span className="ml-2 text-xs font-semibold text-slate-700">{feedback.overallRating}/10</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recommendation</label>
              <Select value={feedback.recommendation} onChange={(v) => setFeedback({ ...feedback, recommendation: v })}
                options={[
                  { value: "StrongHire",   label: "Strong Approve", description: "Exceptional fit — fast track" },
                  { value: "Hire",         label: "Approve",        description: "Good fit, move forward" },
                  { value: "MaybeHire",    label: "On Hold",        description: "Decide later, needs more evaluation" },
                  { value: "NoHire",       label: "Reject",         description: "Not the right fit for this role" },
                  { value: "StrongNoHire", label: "Strong Reject",  description: "Do not proceed" },
                ]} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
                <textarea rows={3} value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })}
                  placeholder="What they did well..."
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concerns</label>
                <textarea rows={3} value={feedback.concerns} onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })}
                  placeholder="Red flags or weak areas..."
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall Comments</label>
              <textarea rows={2} value={feedback.overallComments} onChange={(e) => setFeedback({ ...feedback, overallComments: e.target.value })}
                placeholder="Summary..."
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setFeedbackTarget(null)} disabled={feedbackMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={feedbackMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                <Check size={13} /> {feedbackMut.isPending ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Combined feedback view — every round's feedback for one candidate, in a
          single dialog, ordered by round. Read-only. */}
      <Modal open={!!feedbackGroup} onClose={() => setFeedbackGroup(null)} title="Interview Feedback" size="lg">
        {feedbackGroup && (
          <div className="space-y-4">
            <div>
              <div className="font-semibold text-slate-900">{feedbackGroup.candidate}</div>
              <div className="text-xs text-slate-500">
                {feedbackGroup.position} · {feedbackGroup.rounds.length} round{feedbackGroup.rounds.length > 1 ? "s" : ""} of feedback
              </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {feedbackGroup.rounds.map((it) => {
                const sc = it.scorecard!;
                const r = RECOMMENDATION_LABEL[sc.recommendation] ?? { label: sc.recommendation, color: "text-slate-600" };
                const stageName = stageForInterview[it.round - 1] ?? `Round ${it.round}`;
                return (
                  <div key={it.id} className="rounded-lg border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">R{it.round}</span>
                          <span className="text-sm font-semibold text-slate-900">{stageName}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {it.interviewer.firstName} {it.interviewer.lastName} · {it.type}
                          {sc.submittedAt ? ` · ${new Date(sc.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-slate-900 leading-none">{sc.overallRating}<span className="text-xs font-medium text-slate-400">/10</span></p>
                        <p className={clsx("text-[11px] font-semibold mt-0.5", r.color)}>{r.label}</p>
                      </div>
                    </div>

                    <div className="grid gap-2.5 mt-3 pt-3 border-t border-slate-100">
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Strengths</p>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{sc.strengths?.trim() || <span className="text-slate-400">—</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Concerns</p>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{sc.concerns?.trim() || <span className="text-slate-400">—</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Overall Comments</p>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{sc.overallComments?.trim() || <span className="text-slate-400">—</span>}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setFeedbackGroup(null)}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!rescheduleTarget} onClose={() => setRescheduleTarget(null)} title="Reschedule Interview">
        {rescheduleTarget && (
          <form onSubmit={(e) => {
            e.preventDefault();
            rescheduleMut.mutate({
              id: rescheduleTarget.id,
              body: {
                scheduledAt: new Date(rescheduleForm.scheduledAt).toISOString(),
                // Send the link as-is (incl. empty string) so clearing it is an
                // explicit "clear" → server regenerates a fresh meeting link.
                meetingLink: rescheduleForm.meetingLink,
                location: rescheduleForm.location || undefined,
              },
            });
          }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs">
              <div className="font-semibold text-slate-900">{rescheduleTarget.application.candidate.firstName} {rescheduleTarget.application.candidate.lastName}</div>
              <div className="text-xs text-slate-500 mt-0.5">{rescheduleTarget.application.requisition.title} · R{rescheduleTarget.round} · {rescheduleTarget.type}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Date &amp; Time <span className="text-red-500">*</span></label>
              <input
                type="datetime-local"
                required
                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                value={rescheduleForm.scheduledAt}
                onChange={(e) => {
                  let v = e.target.value;
                  const minLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                  if (v && v < minLocal) v = minLocal;
                  setRescheduleForm({ ...rescheduleForm, scheduledAt: v });
                }}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            {(rescheduleTarget.type === "Video" || rescheduleTarget.type === "Phone") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
                <input type="url" value={rescheduleForm.meetingLink}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, meetingLink: e.target.value })}
                  placeholder="https://meet.google.com/..."
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
            )}
            {rescheduleTarget.type === "InPerson" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" value={rescheduleForm.location}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, location: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setRescheduleTarget(null)} disabled={rescheduleMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={rescheduleMut.isPending || !rescheduleForm.scheduledAt}
                className="px-3 py-1.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-white text-xs font-medium disabled:opacity-50 transition">
                {rescheduleMut.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {confirmAction && (() => {
        const isCancel = confirmAction.kind === "cancel";
        const i = confirmAction.interview;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => !updateMut.isPending && setConfirmAction(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-4">
                <div className="flex items-start gap-4">
                  <div className={clsx("shrink-0 flex items-center justify-center w-12 h-12 rounded-full ring-4",
                    isCancel ? "bg-red-50 ring-red-50/60" : "bg-slate-100 ring-slate-50/60")}>
                    {isCancel ? <X className="w-6 h-6 text-red-600" /> : <AlertCircle className="w-6 h-6 text-slate-600" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[13px] font-semibold text-slate-900">
                      {isCancel ? "Cancel Interview?" : "Mark as No Show?"}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      {isCancel
                        ? <>This will cancel the scheduled interview for{" "}
                            <span className="font-semibold text-slate-700">{i.application.candidate.firstName} {i.application.candidate.lastName}</span>.
                            Candidate should be notified separately.</>
                        : <>The candidate{" "}
                            <span className="font-semibold text-slate-700">{i.application.candidate.firstName} {i.application.candidate.lastName}</span>
                            {" "}will be marked as No Show for this round.</>}
                    </p>
                    <div className="mt-3 text-xs bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5 text-slate-600">
                      R{i.round} · {i.type} · {new Date(i.scheduledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="mt-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Reason {isCancel ? "for cancellation" : "for no-show"} <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        placeholder={isCancel ? "e.g. Interviewer unavailable, candidate requested reschedule…" : "e.g. Candidate didn't join, no prior notice…"}
                        className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                <button type="button" onClick={() => setConfirmAction(null)} disabled={updateMut.isPending}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
                  Not Now
                </button>
                <button type="button"
                  onClick={() => updateMut.mutate({ id: i.id, status: isCancel ? "IntCancelled" : "IntNoShow", reason: actionReason.trim() || undefined })}
                  disabled={updateMut.isPending}
                  className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 transition text-white",
                    isCancel
                      ? "bg-gradient-to-r from-red-600 to-green-600 hover:from-red-700 hover:to-green-700"
                      : "bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800")}>
                  {updateMut.isPending ? "Updating..." : isCancel ? "Yes, Cancel" : "Yes, Mark No Show"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Post-schedule result — the API has already queued invite emails to both
          parties and (for Video/Panel) auto-generated a Teams link. Surface that
          link instead of re-sending mail. Mirrors the pipeline page's flow. */}
      {scheduleResult && (() => {
        const i = scheduleResult;
        const dt = new Date(i.scheduledAt);
        const isVirtual = i.type === "Video" || i.type === "Panel";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setScheduleResult(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden">
              <div className="p-4 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <CheckCircle2 size={14} /> Interview scheduled
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Invite emails have been queued to {i.application.candidate.firstName} {i.application.candidate.lastName} and the interviewer.
                  </div>
                </div>

                <div className="text-xs bg-slate-50 border border-slate-100 rounded-md px-2.5 py-2 text-slate-600 space-y-0.5">
                  <div className="font-semibold text-slate-800">{i.application.candidate.firstName} {i.application.candidate.lastName}</div>
                  <div className="text-[11px] text-slate-500">{i.application.requisition.title} · R{i.round} · {i.type}</div>
                  <div className="text-[11px] text-slate-500">{dt.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {i.duration}min</div>
                  <div className="text-[11px] text-slate-500">Interviewer: {i.interviewer.firstName} {i.interviewer.lastName}</div>
                  {i.location && <div className="text-[11px] text-slate-500">Venue: {i.location}</div>}
                </div>

                {isVirtual && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5"><Link2 size={12} /> Meeting Link</label>
                    {i.meetingLink ? (
                      <div className="flex items-center gap-2">
                        <input type="text" readOnly value={i.meetingLink} onFocus={(e) => e.currentTarget.select()}
                          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500" />
                        <button type="button"
                          onClick={() => { navigator.clipboard?.writeText(i.meetingLink!); toast.success("Copied", "Meeting link copied to clipboard"); }}
                          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50" title="Copy link">
                          <Copy size={13} /> Copy
                        </button>
                        <a href={i.meetingLink} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50" title="Open link">
                          <ExternalLink size={13} /> Open
                        </a>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        No meeting link was generated — Teams may not be configured. You can add a link later by rescheduling.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                <button type="button" onClick={() => setScheduleResult(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm">
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
