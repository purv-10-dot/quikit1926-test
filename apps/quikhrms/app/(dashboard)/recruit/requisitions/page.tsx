"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Plus, Briefcase, Filter, X, AlertTriangle, Check, XCircle, Pause, Play, Pencil, Sparkles, Target, ChevronDown,
  ArrowLeft, ArrowRight, Users, Search as SearchIcon, IndianRupee, GraduationCap, Gift, Globe, Lock, UserCog, Eye, Star,
  FileText, ClipboardList, ThumbsUp, Gem, HelpCircle, History, Building2, User, MapPin, Clock, Video,
  Flag, Circle, Calendar, AlignLeft, MoreVertical, Send, Rocket, ShieldX, Layers } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { RequisitionWizard, toReqPayload, emptyReqForm } from "../_components/requisition-wizard";
import { ActivityTimelineList, type ActivityEntry } from "../_components/activity-timeline";
import type { ReqFormShape, DeptOption, PipelineOption, EmpOption, SkillWeightItem, JobLevelOption } from "../_components/requisition-wizard";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";


interface ReqItem {
  id: string;
  requisitionNumber: string;
  title: string;
  positions: number;
  filledPositions: number;
  type: string;
  employmentType: string;
  status: string;
  priority: string;
  workLocation?: string;
  pipelineId: string | null;
  reportingToId?: string | null;
  jobDescription?: string | null;
  skillWeights?: SkillWeightItem[] | null;
  department: { id: string; name: string } | null;
  hiringManager: { id: string; firstName: string; lastName: string } | null;
  recruiter: { id: string; firstName: string; lastName: string } | null;
  jobLevelId?: string | null;
  customSlaDays?: number | null;
  customSlaReason?: string | null;
  recruiterSplits?: { employeeId: string; positionsAssigned: number }[];
  raiser?: { id: string; firstName: string; lastName: string } | null;
  creator?: { id: string; firstName: string; lastName: string } | null;
  rolePurpose?: string | null;
  raisedAt?: string | null;
  closedDate?: string | null;
  createdAt?: string | null;
  // 5-step wizard extras
  jobOpeningName?: string | null;
  interviewPanel?: string[] | null;
  budget?: string | number | null;
  targetJoiningDate?: string | null;
  etaToFillDays?: number | null;
  jobGrade?: string | null;
  costCenter?: string | null;
  jobLocation?: string | null;
  jobDuration?: string | null;
  workTimings?: string | null;
  interviewMode?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  salaryMin?: string | number | null;
  salaryMax?: string | number | null;
  education?: string | null;
  passingYear?: number | null;
  technicalQuestions?: string[] | null;
  referralBonusAmount?: string | number | null;
  careerPageVisible?: boolean;
  internalPostingOnly?: boolean;
  postToJobPortal?: boolean;
  requirements?: string[] | null;
  niceToHave?: string[] | null;
  benefits?: string[] | null;
  responsibilities?: string[] | null;
  _count: { applications: number };
}

type HeldAction = "restore" | "reject" | "keep";

interface HeldCandidate {
  id: string;
  currentStage: string | null;
  reconfirmSentAt: string | null;
  candidate: { id: string; firstName: string; lastName: string; email: string; currentDesignation: string | null; totalExperience: number | string | null };
  feedback: {
    round: number;
    overallRating: number | null;
    recommendation: string | null;
    strengths: string | null;
    concerns: string | null;
    overallComments: string | null;
    scorecardSubmittedAt: string | null;
  } | null;
}




const statusColors: Record<string, string> = {
  ReqDraft: "bg-gray-100 text-gray-600",
  PendingApproval: "bg-amber-50 text-amber-600",
  ReqApproved: "bg-green-50 text-green-600",
  ReqOpen: "bg-green-50 text-green-600",
  ReqOnHold: "bg-orange-50 text-orange-600",
  ReqClosed: "bg-gray-100 text-gray-500",
  ReqCancelled: "bg-red-50 text-red-600",
};

const priorityColors: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600", Medium: "bg-amber-50 text-amber-600", High: "bg-orange-50 text-orange-600", Urgent: "bg-red-50 text-red-600",
};

function prettyStatus(s: string): string {
  return s
    .replace(/^Req/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

const REQ_EXPORT_COLUMNS = [
  { header: "Requisition", key: "title", width: 26 },
  { header: "Req #", key: "requisitionNumber", width: 16 },
  { header: "Job Opening Name", key: "jobOpeningName", width: 22 },
  { header: "Status", key: "status", width: 14 },
  { header: "Priority", key: "priority", width: 12 },
  { header: "Requisition Type", key: "type", width: 16 },
  { header: "Employment Type", key: "employmentType", width: 16 },
  { header: "Work Location", key: "workLocation", width: 16 },
  { header: "Job Location", key: "jobLocation", width: 18 },
  { header: "Department", key: "department", width: 18 },
  { header: "Hiring Manager", key: "hiringManager", width: 20 },
  { header: "Recruiter (HR)", key: "recruiter", width: 20 },
  { header: "Positions (Filled/Total)", key: "positions", width: 18 },
  { header: "Applications", key: "applications", width: 12 },
  { header: "Experience (Yrs)", key: "experience", width: 14 },
  { header: "Salary Range", key: "salaryRange", width: 20 },
  { header: "Budget", key: "budget", width: 16 },
  { header: "Referral Bonus", key: "referralBonusAmount", width: 14 },
  { header: "Job Grade", key: "jobGrade", width: 12 },
  { header: "Cost Center", key: "costCenter", width: 14 },
  { header: "ETA to Fill (Days)", key: "etaToFillDays", width: 14 },
  { header: "Work Timings", key: "workTimings", width: 16 },
  { header: "Job Duration", key: "jobDuration", width: 14 },
  { header: "Interview Mode", key: "interviewMode", width: 14 },
  { header: "Interview Panel", key: "interviewPanel", width: 16 },
  { header: "Education", key: "education", width: 18 },
  { header: "Passing Year", key: "passingYear", width: 12 },
  { header: "Career Page Visible", key: "careerPageVisible", width: 16 },
  { header: "Internal Posting Only", key: "internalPostingOnly", width: 16 },
  { header: "Post to Job Portal", key: "postToJobPortal", width: 16 },
  { header: "Role Purpose", key: "rolePurpose", width: 40 },
  { header: "Job Description", key: "jobDescription", width: 50 },
  { header: "Responsibilities", key: "responsibilities", width: 50 },
  { header: "Requirements", key: "requirements", width: 50 },
  { header: "Nice to Have", key: "niceToHave", width: 40 },
  { header: "Skills & Weights", key: "skills", width: 30 },
  { header: "Benefits", key: "benefits", width: 40 },
  { header: "Technical Questions", key: "technicalQuestions", width: 50 },
  { header: "Posted On", key: "postedOn", width: 14 },
  { header: "Target Joining Date", key: "targetJoiningDate", width: 16 },
  { header: "Closed Date", key: "closedDate", width: 14 },
];

type ActionVariant = "green" | "blue" | "amber" | "red" | "slate";

const actionVariants: Record<ActionVariant, string> = {
  green: "bg-green-50 text-green-600 border-green-100 hover:bg-green-100",
  blue:  "bg-green-50 text-green-600 border-green-100 hover:bg-green-100",
  amber: "bg-amber-50 text-amber-500 border-amber-100 hover:bg-amber-100",
  red:   "bg-red-50 text-red-500 border-red-100 hover:bg-red-100",
  slate: "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100",
};

// Icon-only square action button (matches the compact recruit table actions).
function ActionBtn({
  icon, title, variant, onClick,
}: { icon: React.ReactNode; title: string; variant: ActionVariant; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={clsx(
        "inline-flex items-center justify-center w-9 h-9 rounded-xl border transition",
        actionVariants[variant],
      )}
    >
      {icon}
    </button>
  );
}

interface MenuAction { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }

// "More" button + portaled dropdown — used instead of a row of icon buttons
// when there are several conditional actions. Portaled to <body> so the
// table's `overflow-hidden` card can't clip it near the bottom row.
function RowActionsMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);

  const reposition = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollResize = () => reposition();
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 transition"
      >
        More <MoreVertical size={13} />
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: rect.top, right: rect.right, width: 200 }}
          className="z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1.5"
        >
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setOpen(false); a.onClick(); }}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left transition",
                a.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50",
              )}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function RequisitionsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useDashboardConfig();
  // Creating / editing / deleting requisitions requires recruit write (also
  // enforced by the API). Viewers reach this page via the dashboard "View All".
  const canManage = hasPermission("hrms.recruit.write") || hasPermission("hrms.recruit.requisition.write");
  const dialog = useDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewReq, setViewReq] = useState<ReqItem | null>(null);
  // Requisition-detail accordion: only one section open at a time (null = first).
  const [openSec, setOpenSec] = useState<string | null>(null);

  // Deep-link support (?view=<id>) — e.g. from Recruiter Performance's "Active
  // Requisitions" detail list, so it can open the SAME view modal here rather
  // than duplicating this detail UI elsewhere. Fetched independently of the
  // list's own filters/pagination so it opens even if the row isn't on the
  // currently-visible page.
  const viewParamId = searchParams.get("view");
  const { data: viewParamData } = useQuery({
    queryKey: ["requisition-detail", viewParamId],
    queryFn: () => api.get<ReqItem>(`/api/v1/hrms/recruit/requisitions/${viewParamId}`),
    enabled: !!viewParamId,
  });
  useEffect(() => {
    if (viewParamData?.data) {
      setViewReq(viewParamData.data);
      router.replace("/recruit/requisitions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParamData]);
  const [statusFilter, setStatusFilter] = useState("ReqOpen"); // default to Open; chips switch to All/others
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [cancelTarget, setCancelTarget] = useState<ReqItem | null>(null);
  const [reviseTarget, setReviseTarget] = useState<ReqItem | null>(null);
  const [reviseForm, setReviseForm] = useState({ startDate: "", endDate: "", reason: "" });
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReqItem | null>(null);
  const [decisions, setDecisions] = useState<Record<string, HeldAction>>({});
  const [openFeedback, setOpenFeedback] = useState<Set<string>>(new Set());

  // ── Recruiter & Position Tracking (Phase 1) — assign positions to recruiters ──
  const [assignRecruiterReq, setAssignRecruiterReq] = useState<ReqItem | null>(null);
  const [timelineReq, setTimelineReq] = useState<ReqItem | null>(null);
  const emptyForm = emptyReqForm;
  const [form, setForm] = useState<ReqFormShape>(emptyForm);

  const params = new URLSearchParams({
    limit: "100",
    ...(statusFilter && { status: statusFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["requisitions", statusFilter, priorityFilter],
    queryFn: () => api.get<ReqItem[]>(`/api/v1/hrms/recruit/requisitions?${params}`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
  });
  const departments = deptsData?.data ?? [];

  const { data: pipelinesData } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<PipelineOption[]>("/api/v1/hrms/recruit/pipelines"),
  });
  const pipelines = pipelinesData?.data ?? [];

  const { data: empData } = useQuery({
    queryKey: ["employees-picker"],
    queryFn: () => api.get<EmpOption[]>("/api/v1/hrms/employees?limit=500&status=Active&picker=1"),
  });
  const employees = empData?.data ?? [];

  const { data: jobLevelsData } = useQuery({
    queryKey: ["job-levels"],
    queryFn: () => api.get<JobLevelOption[]>("/api/v1/hrms/settings/job-levels"),
  });
  const jobLevels = jobLevelsData?.data ?? [];

  // ── Recruiter & Position Tracking (Phase 1) ──────────────────────────────
  interface PositionRow {
    id: string; positionCode: string; sequenceNo: number; status: "Open" | "PendingOnboarding" | "Filled" | "Cancelled";
    recruiterId: string | null; recruiterName: string | null;
    filledByApplicationId: string | null; filledAt: string | null;
  }
  const { data: positionsData } = useQuery({
    queryKey: ["req-positions", assignRecruiterReq?.id],
    queryFn: () => api.get<PositionRow[]>(`/api/v1/hrms/recruit/requisitions/${assignRecruiterReq!.id}/positions`),
    enabled: !!assignRecruiterReq,
  });
  const positions = positionsData?.data ?? [];
  const openPositionsCount = positions.filter((p) => p.status === "Open" && !p.recruiterId).length;


  // Assign one SPECIFIC seat (picked directly from its row) — vs. the bulk
  // "allocate N oldest" flow above.
  const assignPositionMut = useMutation({
    mutationFn: ({ reqId, positionId, recruiterId }: { reqId: string; positionId: string; recruiterId: string }) =>
      api.post(`/api/v1/hrms/recruit/requisitions/${reqId}/positions/${positionId}/assign`, { recruiterId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["req-positions", assignRecruiterReq?.id] });
      toast.success("Recruiter assigned");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to assign recruiter"),
  });

  const createMut = useMutation({
    mutationFn: (body: ReqFormShape) => api.post("/api/v1/hrms/recruit/requisitions", toReqPayload(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setShowCreate(false); toast.success("Requisition created"); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReqFormShape }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, toReqPayload(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setEditId(null); setShowCreate(false); toast.success("Requisition updated"); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setCancelTarget(null); },
  });

  // ── Revise Date (Start/End Date only, with a mandatory reason) ───────────
  const reviseMut = useMutation({
    mutationFn: ({ id, startDate, endDate, reason }: { id: string; startDate: string; endDate: string; reason: string }) => {
      const etaToFillDays = Math.max(0, Math.ceil((new Date(endDate + "T00:00:00").getTime() - new Date(startDate + "T00:00:00").getTime()) / 86400000));
      return api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, {
        closedDate: startDate, targetJoiningDate: endDate, etaToFillDays, dateRevisionReason: reason,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requisitions"] });
      qc.invalidateQueries({ queryKey: ["req-date-history", reviseTarget?.id] });
      setReviseTarget(null);
      toast.success("Date revised");
    },
  });

  interface DateHistoryEntry {
    id: string; by: string; at: string;
    startDateFrom: string | null; startDateTo: string | null;
    endDateFrom: string | null; endDateTo: string | null;
    reason: string | null;
  }
  const { data: dateHistoryData } = useQuery({
    queryKey: ["req-date-history", viewReq?.id],
    queryFn: () => api.get<DateHistoryEntry[]>(`/api/v1/hrms/recruit/requisitions/${viewReq!.id}/date-history`),
    enabled: !!viewReq,
  });
  const dateHistory = dateHistoryData?.data ?? [];

  // ── Resume-a-held-requisition review flow ────────────────────────────────
  const { data: heldData, isLoading: heldLoading } = useQuery({
    queryKey: ["held-candidates", reviewTarget?.id],
    queryFn: () => api.get<HeldCandidate[]>(`/api/v1/hrms/recruit/requisitions/${reviewTarget!.id}/held-candidates`),
    enabled: !!reviewTarget,
  });
  const heldList = heldData?.data ?? [];

  const closeReview = () => { setReviewTarget(null); setDecisions({}); setOpenFeedback(new Set()); };
  const setDecision = (appId: string, action: HeldAction) =>
    setDecisions((prev) => ({ ...prev, [appId]: action }));
  const setAllDecisions = (action: HeldAction) =>
    setDecisions(Object.fromEntries(heldList.map((h) => [h.id, action])));
  const toggleFeedback = (appId: string) =>
    setOpenFeedback((prev) => { const n = new Set(prev); n.has(appId) ? n.delete(appId) : n.add(appId); return n; });

  const resumeMut = useMutation({
    mutationFn: async (reqId: string) => {
      if (heldList.length > 0) {
        await api.post(`/api/v1/hrms/recruit/requisitions/${reqId}/restore-candidates`, {
          decisions: heldList.map((h) => ({ applicationId: h.id, action: decisions[h.id] ?? "keep" })),
        });
      }
      await api.patch(`/api/v1/hrms/recruit/requisitions/${reqId}`, { status: "ReqOpen" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requisitions"] });
      const invited = heldList.filter((h) => decisions[h.id] === "restore").length;
      const rejected = heldList.filter((h) => decisions[h.id] === "reject").length;
      toast.success("Requisition resumed", heldList.length ? `${invited} invited · ${rejected} rejected · ${heldList.length - invited - rejected} kept in archive` : undefined);
      closeReview();
    },
    onError: () => toast.error("Could not resume requisition"),
  });

  const reqs = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(reqs.length / PAGE_SIZE));
  const pageItems = reqs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Export the currently filtered requisitions (matches the visible table) with
  // the full requisition detail — one row per JR.
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const fmtMoney = (n?: string | number | null) =>
    n == null || n === "" ? "" : `₹${Number(n).toLocaleString("en-IN")}`;
  const joinList = (a?: (string | null)[] | null) => (Array.isArray(a) ? a.filter(Boolean).join("; ") : "");
  // Job Description is stored as rich-text HTML — strip tags for a clean Excel cell.
  const stripHtml = (html?: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const yn = (b?: boolean) => (b ? "Yes" : "No");
  const range = (min?: number | null, max?: number | null) =>
    min == null && max == null ? "" : `${min ?? ""}${min != null && max != null ? " – " : ""}${max ?? ""}`;
  const person = (p?: { firstName: string; lastName: string } | null) =>
    p ? `${p.firstName} ${p.lastName}`.trim() : "";

  const reqExportRows = reqs.map((r) => {
    const posted = r.raisedAt ?? r.createdAt;
    return {
      title: r.title,
      requisitionNumber: r.requisitionNumber ?? "",
      jobOpeningName: r.jobOpeningName ?? "",
      status: prettyStatus(r.status),
      priority: r.priority ?? "",
      type: r.type ?? "",
      employmentType: r.employmentType ?? "",
      workLocation: r.workLocation ?? "",
      jobLocation: r.jobLocation ?? "",
      department: r.department?.name ?? "",
      hiringManager: person(r.hiringManager),
      recruiter: person(r.recruiter),
      positions: `${r.filledPositions}/${r.positions}`,
      applications: r._count.applications,
      experience: range(r.experienceMin, r.experienceMax),
      salaryRange: r.salaryMin != null || r.salaryMax != null ? `${fmtMoney(r.salaryMin)}${r.salaryMin != null && r.salaryMax != null ? " – " : ""}${fmtMoney(r.salaryMax)}` : "",
      budget: fmtMoney(r.budget),
      referralBonusAmount: fmtMoney(r.referralBonusAmount),
      jobGrade: r.jobGrade ?? "",
      costCenter: r.costCenter ?? "",
      etaToFillDays: r.etaToFillDays ?? "",
      workTimings: r.workTimings ?? "",
      jobDuration: r.jobDuration ?? "",
      interviewMode: r.interviewMode ?? "",
      interviewPanel: r.interviewPanel?.length ? `${r.interviewPanel.length} panelist(s)` : "",
      education: r.education ?? "",
      passingYear: r.passingYear ?? "",
      careerPageVisible: yn(r.careerPageVisible),
      internalPostingOnly: yn(r.internalPostingOnly),
      postToJobPortal: yn(r.postToJobPortal),
      rolePurpose: r.rolePurpose ?? "",
      jobDescription: stripHtml(r.jobDescription),
      responsibilities: joinList(r.responsibilities),
      requirements: joinList(r.requirements),
      niceToHave: joinList(r.niceToHave),
      skills: Array.isArray(r.skillWeights) ? r.skillWeights.map((s) => `${s.skill} (${s.weight})`).join("; ") : "",
      benefits: joinList(r.benefits),
      technicalQuestions: joinList(r.technicalQuestions),
      postedOn: fmtDate(posted),
      targetJoiningDate: fmtDate(r.targetJoiningDate),
      closedDate: fmtDate(r.closedDate),
    };
  });

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-page-title text-gray-900">Job Openings</h1>
        <ExcelExportButton filename="requisitions" sheetName="Requisitions" columns={REQ_EXPORT_COLUMNS} rows={reqExportRows} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500"><Filter size={15} /> Status</span>
              <Select
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
                size="sm"
                className="w-40"
                placeholder="All statuses"
                options={[
                  { value: "", label: "All statuses" },
                  { value: "ReqDraft", label: "Draft" },
                  { value: "ReqOpen", label: "Open" },
                  { value: "ReqOnHold", label: "On Hold" },
                  { value: "ReqClosed", label: "Closed" },
                  { value: "ReqCancelled", label: "Cancelled" },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500"><Filter size={15} /> Priority</span>
              <Select
                value={priorityFilter}
                onChange={(v) => { setPriorityFilter(v); setPage(1); }}
                size="sm"
                className="w-36"
                placeholder="All priorities"
                options={[
                  { value: "", label: "All priorities" },
                  { value: "Urgent", label: "Urgent" },
                  { value: "High", label: "High" },
                  { value: "Medium", label: "Medium" },
                  { value: "Low", label: "Low" },
                ]}
              />
            </div>
          </div>
          {canManage && (
            <button onClick={() => { setForm(emptyForm); setEditId(null); setShowCreate(true); }}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[14px] bg-green-600 hover:bg-green-700 text-white text-xs font-medium shrink-0 transition">
              <Plus size={13} /> New requisition
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : reqs.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><Briefcase size={32} className="mx-auto mb-2 text-gray-300" />No requisitions</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Requisition</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Department</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Recruiter (HR)</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Positions</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Applications</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Priority</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Posted On</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">End Date</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r, i) => {
                const opened = r.raisedAt ?? r.createdAt;
                const ageDays = opened ? Math.max(0, Math.floor((Date.now() - new Date(opened).getTime()) / 86400000)) : null;
                const toClose = r.closedDate ? Math.ceil((new Date(r.closedDate).getTime() - Date.now()) / 86400000) : null;
                const recruiterName = r.recruiter ? `${r.recruiter.firstName} ${r.recruiter.lastName}`
                  : r.hiringManager ? `${r.hiringManager.firstName} ${r.hiringManager.lastName}` : "—";
                const isOpenish = r.status === "ReqOpen" || r.status === "ReqOnHold";
                return (
                <tr key={r.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-gray-900">{r.title}</p>
                    <p className="text-[11px] text-gray-500">{r.requisitionNumber} &middot; {r.employmentType}</p>
                    {(isOpenish || toClose != null) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {isOpenish && ageDays != null && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200">
                            {prettyStatus(r.status)} {ageDays}d
                          </span>
                        )}
                        {toClose != null && (
                          <span className={clsx(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1",
                            toClose >= 0
                              ? "bg-green-50 text-green-700 ring-green-200"
                              : "bg-red-50 text-red-700 ring-red-200",
                          )}>
                            {toClose >= 0 ? `${toClose}d to close` : `${Math.abs(toClose)}d overdue`}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{r.department?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{recruiterName}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-center">{r.filledPositions}/{r.positions}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-center">{r._count.applications}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium", priorityColors[r.priority])}>{r.priority}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium", statusColors[r.status])}>{prettyStatus(r.status)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">
                    {(() => { const d = r.raisedAt ?? r.createdAt; return d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"; })()}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">
                    {r.targetJoiningDate ? new Date(r.targetJoiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {(() => {
                      const isActiveStatus = r.status !== "ReqCancelled" && r.status !== "ReqClosed";
                      const menuActions: MenuAction[] = [];
                      if (canManage) {
                        if (isActiveStatus) {
                          menuActions.push({
                            label: "Edit Requisition", icon: <Pencil size={13} />, onClick: () => {
                              setForm(reqToForm(r));
                              setEditId(r.id);
                              setShowCreate(true);
                            },
                          });
                          // Recruiter & Position Tracking (Phase 1) — own dedicated modal,
                          // separate from the general "View" details modal.
                          menuActions.push({
                            label: "Assign Recruiter", icon: <Users size={13} />, onClick: () => setAssignRecruiterReq(r),
                          });
                        }
                        if (r.status === "ReqDraft") {
                          menuActions.push({ label: "Open", icon: <Check size={13} />, onClick: () => updateMut.mutate({ id: r.id, status: "ReqOpen" }) });
                        }
                        if (r.status === "ReqOpen") {
                          menuActions.push({
                            label: "Close Requisition", icon: <XCircle size={13} />, onClick: async () => {
                              const ok = await dialog.confirm({
                                title: "Close this requisition?",
                                description: "Hiring for this role will stop. You can reopen it later.",
                                confirmLabel: "Close",
                              });
                              if (ok) updateMut.mutate({ id: r.id, status: "ReqClosed" });
                            },
                          });
                        }
                        if (r.status === "ReqOpen" || r.status === "ReqApproved" || r.status === "ReqDraft") {
                          menuActions.push({
                            label: "On Hold", icon: <Pause size={13} />, onClick: async () => {
                              const ok = await dialog.confirm({
                                title: "Put this requisition on hold?",
                                description: "Applications pause until you resume it. Candidates stay in the pipeline.",
                                confirmLabel: "Put on hold",
                              });
                              if (ok) updateMut.mutate({ id: r.id, status: "ReqOnHold" });
                            },
                          });
                        }
                        if (r.status === "ReqOnHold") {
                          menuActions.push({ label: "Resume", icon: <Play size={13} />, onClick: () => { setDecisions({}); setOpenFeedback(new Set()); setReviewTarget(r); } });
                        }
                        if (isActiveStatus) {
                          menuActions.push({ label: "Cancel Requisition", icon: <XCircle size={13} />, danger: true, onClick: () => setCancelTarget(r) });
                        }
                      }
                      menuActions.push({ label: "Timeline", icon: <History size={13} />, onClick: () => setTimelineReq(r) });
                      return (
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <ActionBtn title="View" variant="slate" icon={<Eye size={12} />} onClick={() => { setOpenSec(null); setShowAllHistory(false); setViewReq(r); }} />
                          <RowActionsMenu actions={menuActions} />
                        </div>
                      );
                    })()}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && reqs.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={reqs.length} limit={PAGE_SIZE} onPageChange={setPage} className="mt-4" />
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }}
        title={editId ? "Edit Job Requisition" : "New Job Requisition"} size="3xl" maxWidthClass="max-w-6xl">
        <RequisitionWizard
          form={form}
          setForm={setForm}
          isEdit={!!editId}
          departments={departments}
          pipelines={pipelines}
          employees={employees}
          jobLevels={jobLevels}
          submitting={createMut.isPending || editMut.isPending}
          onCancel={() => { setShowCreate(false); setEditId(null); }}
          onSubmit={() => { editId ? editMut.mutate({ id: editId, body: form }) : createMut.mutate(form); }}
        />
      </Modal>

      {viewReq && (() => {
        const rcv = viewReq.recruiter ? `${viewReq.recruiter.firstName} ${viewReq.recruiter.lastName}`.trim() : "—";
        const hm = viewReq.hiringManager ? `${viewReq.hiringManager.firstName} ${viewReq.hiringManager.lastName}`.trim() : "—";
        // Prefer the approval-flow "raiser" when this went through Raise Requisition;
        // otherwise fall back to whoever directly created it.
        const raisedByEmp = viewReq.raiser ?? viewReq.creator;
        const raisedBy = raisedByEmp ? `${raisedByEmp.firstName} ${raisedByEmp.lastName}`.trim() : "—";
        const jobLevel = jobLevels.find((l) => l.id === viewReq.jobLevelId);
        const STATUS_LABEL: Record<string, string> = {
          ReqDraft: "Draft", PendingApproval: "Pending Approval", ReqApproved: "Approved",
          ReqOpen: "Open", ReqOnHold: "On Hold", ReqClosed: "Closed", ReqCancelled: "Cancelled",
        };
        const INTERVIEW_MODE_LABEL: Record<string, string> = {
          Video: "Yes — Video", InPerson: "Yes — In-person", Either: "Either", NotRequired: "Not required",
        };
        const rng = (a: string | number | null | undefined, b: string | number | null | undefined, suffix: string) =>
          a != null || b != null ? `${a ?? "?"} – ${b ?? "?"} ${suffix}` : "—";
        const fmtDate = (d?: string | null) =>
          d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
        // lucide-react icons are forwardRef components, which don't structurally
        // satisfy a narrow ComponentType<{size,className}> signature — ElementType
        // is the permissive type that actually accepts them (and plain FCs too).
        type AccIcon = React.ElementType;
        interface DetailField { label: string; value: string; Icon: AccIcon; badge?: "status" | "priority" | "employment" }
        const fields: DetailField[] = [
          { label: "Department", value: viewReq.department?.name ?? "—", Icon: Building2 },
          { label: "Job Level", value: jobLevel ? `${jobLevel.name} (${jobLevel.code})` : "—", Icon: Layers },
          { label: "Recruiter (HR)", value: rcv, Icon: User },
          { label: "Hiring Manager", value: hm, Icon: User },
          { label: "Raised By", value: raisedBy, Icon: User },
          { label: "Employment Type", value: viewReq.employmentType ?? "—", Icon: Briefcase, badge: "employment" },
          { label: "Work Location", value: viewReq.workLocation ?? "—", Icon: Building2 },
          { label: "Job Location", value: viewReq.jobLocation ?? "—", Icon: MapPin },
          { label: "Job Duration", value: viewReq.jobDuration ?? "—", Icon: Clock },
          { label: "Work Timings / Shift", value: viewReq.workTimings ?? "—", Icon: Clock },
          { label: "In-person / Video", value: INTERVIEW_MODE_LABEL[viewReq.interviewMode ?? ""] ?? "—", Icon: Video },
          { label: "Positions", value: `${viewReq.filledPositions}/${viewReq.positions}`, Icon: Users },
          { label: "Applications", value: String(viewReq._count.applications), Icon: FileText },
          { label: "Priority", value: viewReq.priority ?? "—", Icon: Flag, badge: "priority" },
          { label: "Status", value: STATUS_LABEL[viewReq.status] ?? viewReq.status, Icon: Circle, badge: "status" },
          { label: "Experience", value: rng(viewReq.experienceMin, viewReq.experienceMax, "yrs"), Icon: Star },
          { label: "Salary", value: rng(viewReq.salaryMin, viewReq.salaryMax, "LPA"), Icon: IndianRupee },
          { label: "Education", value: viewReq.education ?? "—", Icon: GraduationCap },
          { label: "Passing Year", value: viewReq.passingYear != null ? String(viewReq.passingYear) : "—", Icon: Calendar },
          { label: "Job Grade", value: viewReq.jobGrade ?? "—", Icon: AlignLeft },
          { label: "Cost Center", value: viewReq.costCenter ?? "—", Icon: Building2 },
          { label: "Referral Bonus", value: viewReq.referralBonusAmount != null && `${viewReq.referralBonusAmount}` !== "" ? `₹${viewReq.referralBonusAmount}` : "—", Icon: Gift },
          { label: "Target Joining", value: fmtDate(viewReq.targetJoiningDate), Icon: Calendar },
          { label: "Closes On", value: fmtDate(viewReq.closedDate), Icon: Calendar },
          { label: "Posted On", value: fmtDate(viewReq.raisedAt ?? viewReq.createdAt), Icon: Calendar },
        ];
        const listBlock = (items: string[]) => (
          <ul className="list-disc pl-5 space-y-1 text-gray-700">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        );
        const accordionItems: Array<{ key: string; label: string; Icon: AccIcon; tile: string; body: React.ReactNode }> = [];
        if (viewReq.jobDescription)
          accordionItems.push({ key: "jd", label: "Job Description", Icon: FileText, tile: "bg-blue-50 text-blue-600",
            body: <div className="max-w-none whitespace-pre-line leading-relaxed text-gray-700">{viewReq.jobDescription}</div> });
        if (viewReq.requirements?.length)
          accordionItems.push({ key: "req", label: "Requirements", Icon: ClipboardList, tile: "bg-violet-50 text-violet-600", body: listBlock(viewReq.requirements) });
        if (viewReq.responsibilities?.length)
          accordionItems.push({ key: "resp", label: "Responsibilities", Icon: Users, tile: "bg-amber-50 text-amber-600", body: listBlock(viewReq.responsibilities) });
        if (viewReq.niceToHave?.length)
          accordionItems.push({ key: "nice", label: "Nice to Have", Icon: ThumbsUp, tile: "bg-green-50 text-green-600", body: listBlock(viewReq.niceToHave) });
        if (viewReq.benefits?.length)
          accordionItems.push({ key: "ben", label: "Benefits", Icon: Gem, tile: "bg-sky-50 text-sky-600", body: listBlock(viewReq.benefits) });
        if (viewReq.technicalQuestions?.length)
          accordionItems.push({ key: "tech", label: "Technical / Interview Questions", Icon: HelpCircle, tile: "bg-rose-50 text-rose-600",
            body: <ol className="list-decimal pl-5 space-y-1 text-gray-700">{viewReq.technicalQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol> });
        if (viewReq.skillWeights?.length)
          accordionItems.push({ key: "skills", label: "Skills & Weightage", Icon: Star, tile: "bg-indigo-50 text-indigo-600",
            body: <div className="flex flex-wrap gap-1.5">{viewReq.skillWeights.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 ring-1 ring-green-200 px-2.5 py-1 text-[11px] font-medium">{s.skill} · {s.weight}%</span>
            ))}</div> });
        const firstKey = accordionItems[0]?.key;
        const effectiveOpen = openSec === null ? firstKey : openSec;
        const typeLabel = viewReq.type.replace(/([a-z])([A-Z])/g, "$1 $2");
        const badgeClass = (f: DetailField) =>
          f.badge === "status" ? clsx("inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium", statusColors[viewReq.status])
          : f.badge === "priority" ? clsx("inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium", priorityColors[viewReq.priority])
          : f.badge === "employment" ? "inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700"
          : "";
        return (
          <Modal open onClose={() => setViewReq(null)} size="3xl" maxWidthClass="max-w-6xl" maxHeightClass="max-h-[96vh]"
            headerIcon={<Briefcase size={16} />}
            title={viewReq.title} subtitle={`${viewReq.requisitionNumber} · ${typeLabel}`}
            bodyClassName="p-0 flex flex-col">
            <div className="p-5 space-y-5 overflow-y-auto text-xs flex-1 min-h-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
                {fields.map((f) => (
                  <div key={f.label} className="flex items-start gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 grid place-items-center shrink-0">
                      <f.Icon size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{f.label}</p>
                      {f.badge ? (
                        <span className={clsx("mt-0.5", badgeClass(f))}>{f.value}</span>
                      ) : (
                        <p className="text-gray-800 font-medium mt-0.5 truncate" title={f.value}>{f.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {dateHistory.length > 0 && (
                <div className="rounded-xl bg-indigo-50/60 ring-1 ring-indigo-100 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 flex items-center gap-1.5">
                      <History size={13} /> Revision History
                    </p>
                    {dateHistory.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowAllHistory((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white ring-1 ring-indigo-200 px-2 py-1 text-[10.5px] font-semibold text-indigo-700 hover:bg-indigo-50 transition shrink-0"
                      >
                        <History size={11} /> {showAllHistory ? "Show latest only" : `View all history (${dateHistory.length})`}
                      </button>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {(showAllHistory ? dateHistory : dateHistory.slice(0, 1)).map((h) => {
                      const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
                      return (
                        <li key={h.id} className="text-[11px] text-gray-600 border-l-2 border-amber-300 pl-2.5">
                          <span className="font-medium text-gray-800">{h.by}</span>
                          {" "}revised the dates on{" "}
                          <span className="text-gray-500">{fmt(h.at)}</span>
                          {h.startDateFrom !== h.startDateTo && (
                            <> — Start: <span className="font-mono">{fmt(h.startDateFrom)} → {fmt(h.startDateTo)}</span></>
                          )}
                          {h.endDateFrom !== h.endDateTo && (
                            <> · End: <span className="font-mono">{fmt(h.endDateFrom)} → {fmt(h.endDateTo)}</span></>
                          )}
                          {h.reason && <p className="text-gray-500 mt-0.5">Reason: {h.reason}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {accordionItems.length > 0 && (
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {accordionItems.map(({ key, label, Icon, tile, body }) => {
                    const isOpen = effectiveOpen === key;
                    return (
                      <div key={key}>
                        <button type="button" onClick={() => setOpenSec(isOpen ? "__none__" : key)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition">
                          <span className={clsx("w-9 h-9 rounded-lg grid place-items-center shrink-0", tile)}><Icon size={16} /></span>
                          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
                          <ChevronDown size={16} className={clsx("text-gray-400 transition-transform", isOpen && "rotate-180")} />
                        </button>
                        {isOpen && <div className="px-3 pb-3 pl-[3.25rem]">{body}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
              <button type="button" onClick={() => setViewReq(null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* Recruiter & Position Tracking (Phase 1) — dedicated modal, separate from
          the general "View" details modal. */}
      {assignRecruiterReq && (() => {
        const recruiterOptions = employees.map((e) => ({
          value: e.id,
          label: (e.displayName || `${e.firstName} ${e.lastName}`.trim()) + (e.employeeCode ? ` (${e.employeeCode})` : ""),
        }));
        const positionStatusPill: Record<PositionRow["status"], string> = {
          Open: "bg-gray-100 text-gray-600",
          PendingOnboarding: "bg-amber-50 text-amber-700",
          Filled: "bg-green-50 text-green-700",
          Cancelled: "bg-red-50 text-red-600",
        };
        const positionStatusLabel: Record<PositionRow["status"], string> = {
          Open: "Open", PendingOnboarding: "Pending Onboarding", Filled: "Filled", Cancelled: "Cancelled",
        };
        return (
          <Modal open onClose={() => setAssignRecruiterReq(null)} size="md"
            headerIcon={<Users size={16} />}
            title="Assign Recruiter" subtitle={`${assignRecruiterReq.title} · ${assignRecruiterReq.requisitionNumber}`}>
            <div className="space-y-3 text-xs">
              {positions.length === 0 ? (
                <p className="text-gray-400">No position records yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {positions.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-2.5 py-2">
                      <span className="font-mono text-[11px] text-gray-700 shrink-0">{p.positionCode}</span>
                      <span className={clsx("inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium shrink-0", positionStatusPill[p.status])}>{positionStatusLabel[p.status]}</span>
                      {canManage && p.status === "Open" ? (
                        <div className="flex-1 min-w-0">
                          <Select
                            value={p.recruiterId ?? ""}
                            onChange={(v) => v && assignPositionMut.mutate({ reqId: assignRecruiterReq.id, positionId: p.id, recruiterId: v })}
                            searchable size="sm"
                            placeholder="Unallocated"
                            options={recruiterOptions}
                          />
                        </div>
                      ) : (
                        <span className="flex-1 text-gray-500 truncate">{p.recruiterName || "Unallocated"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {openPositionsCount === 0 && positions.length > 0 && (
                <p className="text-[11px] text-gray-400">All positions are allocated or filled.</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAssignRecruiterReq(null)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {timelineReq && (
        <RequisitionTimelineModal requisition={timelineReq} onClose={() => setTimelineReq(null)} />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !updateMut.isPending && setCancelTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 ring-4 ring-red-50/60">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[13px] font-semibold text-slate-900">Cancel Requisition</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    Are you sure you want to cancel{" "}
                    <span className="font-semibold text-slate-700">&quot;{cancelTarget.title}&quot;</span>{" "}
                    <span className="text-slate-400">({cancelTarget.requisitionNumber})</span>?
                  </p>
                  <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">
                    This will stop all hiring activity. Candidates already applied will be notified. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={updateMut.isPending}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Keep Open
              </button>
              <button
                type="button"
                onClick={() => updateMut.mutate({ id: cancelTarget.id, status: "ReqCancelled" })}
                disabled={updateMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-green-600 hover:from-red-700 hover:to-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 transition"
              >
                {updateMut.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Date — Start/End Date only, with a mandatory reason (kept
          separate from the full Edit wizard since this is meant to be a
          quick, frequent action). Every revision is logged (who/when/why)
          and shown in the Revision History list inside the View popup. */}
      <Modal
        open={!!reviseTarget}
        onClose={() => setReviseTarget(null)}
        title="Revise Date"
        subtitle={reviseTarget ? `${reviseTarget.title} · ${reviseTarget.requisitionNumber}` : undefined}
        size="sm"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={reviseForm.startDate}
                onChange={(e) => setReviseForm({ ...reviseForm, startDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={reviseForm.endDate}
                onChange={(e) => setReviseForm({ ...reviseForm, endDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea rows={3} value={reviseForm.reason}
              onChange={(e) => setReviseForm({ ...reviseForm, reason: e.target.value })}
              placeholder="e.g. Client delayed the interview panel"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setReviseTarget(null)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={!reviseForm.startDate || !reviseForm.endDate || !reviseForm.reason.trim() || reviseMut.isPending}
              onClick={() => reviseTarget && reviseMut.mutate({ id: reviseTarget.id, ...reviseForm })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {reviseMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Resume-a-held-requisition — review held candidates before reopening. */}
      <Modal
        open={!!reviewTarget}
        onClose={() => !resumeMut.isPending && closeReview()}
        title={reviewTarget ? `Resume "${reviewTarget.title}"` : "Resume Requisition"}
        size="lg"
      >
        {heldLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading candidates…</div>
        ) : heldList.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-green-50 mb-3">
              <Play className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-slate-800">No candidates are on hold</p>
            <p className="mt-1 text-xs text-slate-500">This requisition has no parked candidates to review. You can reopen it now.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={closeReview} disabled={resumeMut.isPending}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={() => reviewTarget && resumeMut.mutate(reviewTarget.id)} disabled={resumeMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                <Play size={13} /> {resumeMut.isPending ? "Reopening…" : "Reopen Requisition"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{heldList.length}</span> candidate{heldList.length > 1 ? "s" : ""} on hold. <span className="text-slate-400">Restore sends a “still interested?” invite — they rejoin the pipeline only after they confirm. Default: Keep in Archive.</span>
              </p>
              <div className="inline-flex items-center gap-1 text-[11px]">
                <span className="text-slate-400 mr-1">All:</span>
                <button onClick={() => setAllDecisions("restore")} className="px-2 py-0.5 rounded-md text-green-700 bg-green-50 hover:bg-green-100 font-medium">Restore</button>
                <button onClick={() => setAllDecisions("reject")} className="px-2 py-0.5 rounded-md text-red-700 bg-red-50 hover:bg-red-100 font-medium">Reject</button>
                <button onClick={() => setAllDecisions("keep")} className="px-2 py-0.5 rounded-md text-slate-600 bg-slate-100 hover:bg-slate-200 font-medium">Keep</button>
              </div>
            </div>

            <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1 space-y-2">
              {heldList.map((h) => {
                const decision = decisions[h.id] ?? "keep";
                const open = openFeedback.has(h.id);
                const fb = h.feedback;
                return (
                  <div key={h.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#dbeafe] to-[#93c5fd] text-[#1d4ed8] flex items-center justify-center text-[11px] font-bold shrink-0">
                        {(h.candidate.firstName[0] ?? "") + (h.candidate.lastName[0] ?? "")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-semibold text-slate-900 truncate">{h.candidate.firstName} {h.candidate.lastName}</p>
                          {h.reconfirmSentAt && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-600 ring-1 ring-blue-100 shrink-0">Invited · awaiting reply</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          {h.currentStage ?? "—"}{h.candidate.currentDesignation ? ` · ${h.candidate.currentDesignation}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 inline-flex rounded-lg border border-slate-200 overflow-hidden">
                        {([
                          { key: "restore", label: "Restore", on: "bg-green-600 text-white", off: "text-slate-600 hover:bg-green-50" },
                          { key: "reject", label: "Reject", on: "bg-red-600 text-white", off: "text-slate-600 hover:bg-red-50" },
                          { key: "keep", label: "Keep", on: "bg-slate-600 text-white", off: "text-slate-600 hover:bg-slate-100" },
                        ] as const).map((b, bi) => (
                          <button key={b.key} onClick={() => setDecision(h.id, b.key)}
                            className={clsx("px-2.5 py-1 text-[11px] font-medium transition", bi > 0 && "border-l border-slate-200", decision === b.key ? b.on : b.off)}>
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2 pl-11">
                      {fb ? (
                        <>
                          <RecoBadge value={fb.recommendation} />
                          {fb.overallRating != null && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-600">
                              <Star size={11} className="fill-amber-400 text-amber-400" /> {fb.overallRating}/10
                            </span>
                          )}
                          <button onClick={() => toggleFeedback(h.id)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                            {open ? "Hide" : "View"} feedback <ChevronDown size={12} className={clsx("transition", open && "rotate-180")} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">No feedback recorded</span>
                      )}
                    </div>

                    {open && fb && (
                      <div className="mt-2 ml-11 rounded-lg bg-slate-50 border border-slate-100 p-2.5 space-y-1.5 text-[11px] text-slate-600">
                        {fb.strengths && <p><span className="font-semibold text-green-700">Strengths:</span> {fb.strengths}</p>}
                        {fb.concerns && <p><span className="font-semibold text-red-700">Concerns:</span> {fb.concerns}</p>}
                        {fb.overallComments && <p><span className="font-semibold text-slate-700">Comments:</span> {fb.overallComments}</p>}
                        {!fb.strengths && !fb.concerns && !fb.overallComments && <p className="text-slate-400">Rating given, no written notes.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500">
                {heldList.filter((h) => (decisions[h.id] ?? "keep") === "restore").length} restore ·{" "}
                {heldList.filter((h) => (decisions[h.id] ?? "keep") === "reject").length} reject ·{" "}
                {heldList.filter((h) => (decisions[h.id] ?? "keep") === "keep").length} keep
              </p>
              <div className="flex gap-2">
                <button onClick={closeReview} disabled={resumeMut.isPending}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button onClick={() => reviewTarget && resumeMut.mutate(reviewTarget.id)} disabled={resumeMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                  <Play size={13} /> {resumeMut.isPending ? "Applying…" : "Reopen & Apply"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RecoBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, { label: string; cls: string }> = {
    StrongHire: { label: "Strong Hire", cls: "bg-green-100 text-green-700" },
    Hire: { label: "Hire", cls: "bg-green-50 text-green-700" },
    MaybeHire: { label: "On Hold", cls: "bg-amber-50 text-amber-700" },
    NoHire: { label: "No Hire", cls: "bg-red-50 text-red-700" },
    StrongNoHire: { label: "Strong No", cls: "bg-red-100 text-red-700" },
  };
  const m = map[value] ?? { label: value, cls: "bg-slate-100 text-slate-600" };
  return <span className={clsx("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold", m.cls)}>{m.label}</span>;
}

/* ─── Role Scorecard section (collapsible) ────────────────────────────────
   Optional fields modeled on the JD-Scorecard pattern:
   - Role Purpose: 1-2 sentences ("why this role exists")
   - Key Responsibilities
*/

function reqNum(v: string | number | null | undefined): number | null {
  return v === null || v === undefined || v === "" ? null : Number(v);
}

function reqToForm(r: ReqItem): ReqFormShape {
  return {
    title: r.title ?? "",
    jobOpeningName: r.jobOpeningName ?? "",
    departmentId: r.department?.id ?? "",
    pipelineId: r.pipelineId ?? "",
    positions: r.positions ?? 1,
    type: r.type ?? "NewPosition",
    priority: r.priority ?? "Medium",
    employmentType: r.employmentType ?? "FullTime",
    workLocation: r.workLocation ?? "Office",
    interviewPanelIds: Array.isArray(r.interviewPanel) ? r.interviewPanel : [],
    reportingToId: r.reportingToId ?? "",
    hiringManagerId: r.hiringManager?.id ?? "",
    recruiterId: r.recruiter?.id ?? "",
    jobLevelId: r.jobLevelId ?? "",
    customSlaDays: reqNum(r.customSlaDays),
    customSlaReason: r.customSlaReason ?? "",
    recruiterAssignments: r.recruiterSplits?.length
      ? r.recruiterSplits.map((s) => ({ employeeId: s.employeeId, positionsAssigned: s.positionsAssigned }))
      : r.recruiter?.id ? [{ employeeId: r.recruiter.id, positionsAssigned: r.positions ?? 1 }] : [],
    experienceMin: reqNum(r.experienceMin),
    experienceMax: reqNum(r.experienceMax),
    salaryMin: reqNum(r.salaryMin),
    salaryMax: reqNum(r.salaryMax),
    budget: reqNum(r.budget),
    targetJoiningDate: r.targetJoiningDate ? r.targetJoiningDate.slice(0, 10) : "",
    closedDate: r.closedDate ? r.closedDate.slice(0, 10) : "",
    etaToFillDays: reqNum(r.etaToFillDays),
    jobGrade: r.jobGrade ?? "",
    costCenter: r.costCenter ?? "",
    jobLocation: r.jobLocation ?? "",
    jobDuration: r.jobDuration ?? "",
    workTimings: r.workTimings ?? "",
    interviewMode: r.interviewMode ?? "",
    jobDescription: r.jobDescription ?? "",
    requirements: Array.isArray(r.requirements) ? r.requirements : [],
    niceToHave: Array.isArray(r.niceToHave) ? r.niceToHave : [],
    benefits: Array.isArray(r.benefits) ? r.benefits : [],
    education: r.education ?? "",
    passingYear: reqNum(r.passingYear),
    technicalQuestions: Array.isArray(r.technicalQuestions) ? r.technicalQuestions : [],
    referralBonusAmount: reqNum(r.referralBonusAmount),
    careerPageVisible: r.careerPageVisible ?? true,
    internalPostingOnly: r.internalPostingOnly ?? false,
    postToJobPortal: r.postToJobPortal ?? false,
    responsibilities: Array.isArray(r.responsibilities) ? r.responsibilities : [],
    skillWeights: Array.isArray(r.skillWeights) ? r.skillWeights : [],
    justification: "",
  };
}

// ─── Requisition Activity Timeline ───────────────────────

interface ReqTimelineResponse {
  requisition: { id: string; title: string; requisitionNumber: string; status: string; createdAt: string };
  entries: ActivityEntry[];
}

function RequisitionTimelineModal({ requisition, onClose }: { requisition: ReqItem; onClose: () => void }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["requisition-timeline", requisition.id],
    queryFn: () => api.get<ReqTimelineResponse>(`/api/v1/hrms/recruit/requisitions/${requisition.id}/timeline`),
  });
  const res = data?.data;

  return (
    <Modal open onClose={onClose} title="Requisition Timeline" size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <p className="font-semibold text-slate-900">{requisition.title}</p>
          <p className="text-xs text-slate-500">{requisition.requisitionNumber}</p>
        </div>

        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shimmer rounded-full w-6 h-6 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="shimmer h-2.5 rounded w-3/5" />
                  <div className="shimmer h-2 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : !res || res.entries.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
            <Clock size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-[13px] font-semibold text-slate-700">No activity yet</p>
          </div>
        ) : (
          <ActivityTimelineList entries={res.entries} />
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}
