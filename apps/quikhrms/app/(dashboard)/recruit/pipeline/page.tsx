"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { User, ArrowRight, UserPlus, CheckCircle, Star, MessageSquare, X, Search, Mail, Clock, ThumbsUp, ThumbsDown, LayoutGrid, List, Download, CalendarPlus, MapPin, Link2, FileCheck2, FileText, IndianRupee, Briefcase, Gift, Calendar, FileCheck, Pencil } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface ApplicationItem {
  id: string;
  currentStage: string | null;
  status: string;
  aiMatchScore: string | null;
  aiMatchAnalysis?: { verdict?: string; summary?: string } | null;
  appliedDate: string;
  candidate: { id: string; firstName: string; lastName: string; email: string; phone: string | null; currentCompany: string | null; totalExperience: number | null; expectedCTC: string | null };
  requisition: { id: string; title: string; requisitionNumber: string };
  _count: { interviews: number; scorecards: number };
  latestScorecard: { round: number; recommendation: string; submittedAt: string } | null;
  latestInterview: {
    id: string; round: number; type: string; status: string;
    scheduledAt: string; duration: number;
    location: string | null; meetingLink: string | null;
    interviewer: { id: string; firstName: string; lastName: string } | null;
  } | null;
  latestOffer: {
    id: string; status: string; designation: string;
    offeredCTC: string; joiningDate: string;
    sentAt: string | null; respondedAt: string | null;
  } | null;
}

interface StageConfig {
  name: string;
  sendMail: boolean;
  mailTemplate: "interview" | "offer-branded" | "offer-default" | "welcome" | null;
}

interface PipelineItem {
  id: string;
  name: string;
  stages: StageConfig[];
  isDefault: boolean;
}

const DEFAULT_STAGE_NAMES = ["Screening", "PhoneScreen", "TechnicalInterview", "ManagerInterview", "HRInterview", "Offer", "Hired"];

const stageColors: Record<string, string> = {
  Screening: "bg-gray-50 border-gray-200",
  PhoneScreen: "bg-[#dbeafe] border-[#bfdbfe]",
  TechnicalInterview: "bg-purple-50 border-purple-200",
  ManagerInterview: "bg-orange-50 border-orange-200",
  HRInterview: "bg-sky-50 border-sky-200",
  Assessment: "bg-violet-50 border-violet-200",
  FinalRound: "bg-indigo-50 border-indigo-200",
  Interview: "bg-[#dbeafe] border-[#93c5fd]",
  Offer: "bg-emerald-50 border-emerald-200",
  Hired: "bg-green-50 border-green-200",
};

const defaultStageColor = "bg-slate-50 border-slate-200";

function atsTone(score: number): { bg: string; text: string; ring: string; label: string } {
  if (score >= 85) return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", label: "Strong" };
  if (score >= 70) return { bg: "bg-[#dbeafe]", text: "text-[#2563eb]", ring: "ring-[#bfdbfe]", label: "Good" };
  if (score >= 50) return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", label: "Partial" };
  if (score >= 25) return { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-200", label: "Weak" };
  return { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200", label: "No" };
}

function AtsBadge({ score, verdict, title }: { score: number | null; verdict?: string | null; title?: string }) {
  if (score === null || score === undefined) return null;
  const n = Math.round(Number(score));
  const t = atsTone(n);
  return (
    <span
      title={title ?? `ATS ${n}/100${verdict ? ` · ${verdict}` : ""}`}
      className={clsx(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 whitespace-nowrap",
        t.bg, t.text, t.ring,
      )}
    >
      ATS {n}
    </span>
  );
}

export default function PipelinePage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [reqFilter, setReqFilter] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set());
  const [requisitionFilters, setRequisitionFilters] = useState<Set<string>>(new Set());
  const [minExpYears, setMinExpYears] = useState<number | null>(null);
  const [onlyWithFeedback, setOnlyWithFeedback] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [feedbackApp, setFeedbackApp] = useState<ApplicationItem | null>(null);
  const [feedback, setFeedback] = useState({ overallRating: 4, recommendation: "" as string, strengths: "", concerns: "", overallComments: "" });

  const [moveApp, setMoveApp] = useState<ApplicationItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");

  const [historyApp, setHistoryApp] = useState<ApplicationItem | null>(null);

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const [docRequestApp, setDocRequestApp] = useState<{ app: ApplicationItem; bundle: "PreOffer" | "PostOffer" } | null>(null);
  const [docRequestSelected, setDocRequestSelected] = useState<Set<string>>(new Set());

  const [scheduleApp, setScheduleApp] = useState<{ app: ApplicationItem; stage: string } | null>(null);
  const [schedule, setSchedule] = useState({
    interviewerId: "",
    scheduledAt: "",
    duration: 60 as number | null,
    type: "Video" as "Phone" | "Video" | "InPerson" | "Panel" | "TakeHome" | "GroupDiscussion",
    location: "",
    meetingLink: "",
  });

  // Offer modal — shared with the standalone /recruit/offers page (same
  // endpoint POST/PATCH /api/v1/hrms/recruit/offers). Edits in either place
  // refresh both via invalidateAll().
  const [offerApp, setOfferApp] = useState<ApplicationItem | null>(null);
  const [offerEditId, setOfferEditId] = useState<string | null>(null);
  const emptyOffer = {
    designation: "", departmentId: "", reportingToId: "",
    offeredCTC: 0, joiningBonus: 0, relocationBonus: 0, equityGrant: "",
    joiningDate: "", expiresAt: "",
  };
  const [offer, setOffer] = useState(emptyOffer);

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-apps", reqFilter],
    queryFn: () => api.get<ApplicationItem[]>(`/api/v1/hrms/recruit/applications?status=AppActive&limit=200${reqFilter ? `&requisitionId=${reqFilter}` : ""}`),
  });

  const { data: pipelinesData } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<PipelineItem[]>("/api/v1/hrms/recruit/pipelines"),
  });
  const defaultPipeline = (pipelinesData?.data ?? []).find((p) => p.isDefault) ?? pipelinesData?.data?.[0];
  const stageConfigs: StageConfig[] = defaultPipeline?.stages && defaultPipeline.stages.length > 0
    ? defaultPipeline.stages
    : DEFAULT_STAGE_NAMES.map((n) => ({ name: n, sendMail: false, mailTemplate: null }));
  const STAGES: string[] = stageConfigs.map((s) => s.name);
  const stageHasMail = (name: string) => stageConfigs.find((s) => s.name === name)?.sendMail ?? false;
  const isInterviewStage = (s: string | null | undefined) => !!s && /interview|screen/i.test(s);
  const getNextStage = (current: string | null | undefined) => {
    const idx = current ? STAGES.indexOf(current) : -1;
    return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
  };

  const isPendingSchedule = (app: ApplicationItem) => {
    const cur = app.currentStage ?? STAGES[0];
    const idx = STAGES.indexOf(cur);
    const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
    return !!app.latestScorecard
      && app.latestScorecard.round === idx + 1
      && app.latestScorecard.recommendation === "Hire"
      && !!next
      && isInterviewStage(next);
  };

  const openAction = (app: ApplicationItem) => {
    if (isPendingSchedule(app)) {
      const cur = app.currentStage ?? STAGES[0];
      const next = STAGES[STAGES.indexOf(cur) + 1];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setMinutes(0, 0, 0);
      const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setSchedule({ interviewerId: "", scheduledAt: iso, duration: 60, type: "Video", location: "", meetingLink: "" });
      setScheduleApp({ app, stage: next });
    } else {
      setFeedback({ overallRating: 4, recommendation: "", strengths: "", concerns: "", overallComments: "" });
      setFeedbackApp(app);
    }
  };

  const { data: empData } = useQuery({
    queryKey: ["employees-active-list"],
    queryFn: () => api.get<{ id: string; firstName: string; lastName: string; jobTitle: string | null; employeeCode?: string }[]>("/api/v1/hrms/employees?status=Active&limit=200"),
    enabled: !!scheduleApp || !!offerApp,
  });
  const employees = empData?.data ?? [];

  const { data: deptsData } = useQuery({
    queryKey: ["departments-pipeline-offer"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/v1/hrms/departments?limit=200"),
    enabled: !!offerApp,
  });
  const departments = deptsData?.data ?? [];

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["pipeline-apps"] });
    qc.invalidateQueries({ queryKey: ["interviews"] });
    qc.invalidateQueries({ queryKey: ["offers"] });
  };

  const moveMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch<{ mailFired?: { template: string; to?: string; skipped?: string } | null }>(
        `/api/v1/hrms/recruit/applications/${id}`,
        { currentStage: stage },
      ),
    onSuccess: (res) => {
      invalidateAll();
      setMoveApp(null);
      const fired = res?.data?.mailFired;
      if (fired) {
        if (fired.skipped) toast.warning("Mail skipped", fired.skipped);
        else if (fired.to) toast.success("Mail sent", `${fired.template} → ${fired.to}`);
      }
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/hrms/recruit/applications/${id}`, { status: "AppRejected" }),
    onSuccess: () => invalidateAll(),
  });

  const onboardMut = useMutation({
    mutationFn: (id: string) => api.post<{ employee: { id: string }; redirectUrl: string }>(`/api/v1/hrms/recruit/applications/${id}/onboard`, {}),
    onSuccess: (res) => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["requisitions"] });
      toast.success("Onboarding started", "Redirecting to onboarding page...");
      if (res.data?.redirectUrl) router.push(res.data.redirectUrl);
    },
  });

  const feedbackMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof feedback & { deferStageMove?: boolean } }) =>
      api.post(`/api/v1/hrms/recruit/applications/${id}/stage-feedback`, body),
    onSuccess: (_res, vars) => {
      invalidateAll();
      const app = feedbackApp;
      const isApprove = vars.body.recommendation === "Hire";
      const nextStage = app ? getNextStage(app.currentStage) : null;
      const willSchedule = isApprove && !!app && !!nextStage && isInterviewStage(nextStage);
      setFeedbackApp(null);
      setFeedback({ overallRating: 4, recommendation: "", strengths: "", concerns: "", overallComments: "" });
      toast.success("Feedback saved", willSchedule ? "Stage will move once interview is scheduled" : undefined);
      if (willSchedule && app && nextStage) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        tomorrow.setMinutes(0, 0, 0);
        const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setSchedule({ interviewerId: "", scheduledAt: iso, duration: 60, type: "Video", location: "", meetingLink: "" });
        setScheduleApp({ app, stage: nextStage });
      }
    },
  });

  const { data: preOfferDocTypes } = useQuery({
    queryKey: ["candidate-doc-types", "PreOffer"],
    queryFn: () => api.get<Array<{ id: string; code: string; name: string; isRequired: boolean; sortOrder: number; helpText: string | null }>>("/api/v1/hrms/recruit/candidate-document-types?bundle=PreOffer"),
    enabled: docRequestApp?.bundle === "PreOffer",
  });
  const { data: postOfferDocTypes } = useQuery({
    queryKey: ["candidate-doc-types", "PostOffer"],
    queryFn: () => api.get<Array<{ id: string; code: string; name: string; isRequired: boolean; sortOrder: number; helpText: string | null }>>("/api/v1/hrms/recruit/candidate-document-types?bundle=PostOffer"),
    enabled: docRequestApp?.bundle === "PostOffer",
  });
  const docTypesForBundle = docRequestApp?.bundle === "PreOffer" ? (preOfferDocTypes?.data ?? []) : (postOfferDocTypes?.data ?? []);

  const docRequestMut = useMutation({
    mutationFn: () => {
      if (!docRequestApp) throw new Error("No application selected");
      return api.post(`/api/v1/hrms/recruit/applications/${docRequestApp.app.id}/documents/${docRequestApp.bundle}`, {
        documentTypeIds: Array.from(docRequestSelected),
      });
    },
    onSuccess: () => {
      const bundleLabel = docRequestApp?.bundle === "PreOffer" ? "Before Offer" : "After Offer";
      toast.success("Document request sent", `${bundleLabel} bundle emailed to candidate`);
      setDocRequestApp(null);
      setDocRequestSelected(new Set());
    },
    onError: (e: Error) => toast.error("Request failed", e.message),
  });

  const openDocRequest = (app: ApplicationItem, bundle: "PreOffer" | "PostOffer") => {
    setDocRequestApp({ app, bundle });
    setDocRequestSelected(new Set());
  };

  useEffect(() => {
    if (!docRequestApp) return;
    if (docTypesForBundle.length === 0) return;
    if (docRequestSelected.size > 0) return;
    const requiredIds = docTypesForBundle.filter((d) => d.isRequired).map((d) => d.id);
    setDocRequestSelected(new Set(requiredIds));
  }, [docRequestApp, docTypesForBundle, docRequestSelected.size]);

  const scheduleMut = useMutation({
    mutationFn: () => {
      if (!scheduleApp) throw new Error("No application selected");
      const round = STAGES.indexOf(scheduleApp.stage) + 1;
      return api.post("/api/v1/hrms/recruit/interviews", {
        applicationId: scheduleApp.app.id,
        round,
        type: schedule.type,
        interviewerId: schedule.interviewerId,
        scheduledAt: new Date(schedule.scheduledAt).toISOString(),
        duration: schedule.duration ?? 60,
        location: schedule.location || undefined,
        meetingLink: schedule.meetingLink || undefined,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setScheduleApp(null);
      toast.success("Interview scheduled", "Send invite from the Interviews page");
    },
    onError: (e: Error) => toast.error("Schedule failed", e.message),
  });

  const buildOfferBody = (body: typeof offer) => ({
    designation: body.designation,
    departmentId: body.departmentId || undefined,
    reportingToId: body.reportingToId || undefined,
    offeredCTC: body.offeredCTC,
    joiningBonus: body.joiningBonus || undefined,
    relocationBonus: body.relocationBonus || undefined,
    equityGrant: body.equityGrant || undefined,
    joiningDate: body.joiningDate,
    expiresAt: body.expiresAt || undefined,
  });

  const offerMut = useMutation({
    mutationFn: () => {
      if (!offerApp) throw new Error("No application selected");
      const body = buildOfferBody(offer);
      return offerEditId
        ? api.patch(`/api/v1/hrms/recruit/offers/${offerEditId}`, body)
        : api.post("/api/v1/hrms/recruit/offers", { ...body, applicationId: offerApp.id });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(offerEditId ? "Offer updated" : "Offer created", "Send the letter from the Offers page");
      setOfferApp(null);
      setOfferEditId(null);
      setOffer(emptyOffer);
    },
    onError: (e: Error) => toast.error("Offer save failed", e.message),
  });

  const openOfferModal = (app: ApplicationItem) => {
    const existing = app.latestOffer;
    if (existing) {
      setOffer({
        designation: existing.designation,
        departmentId: "",
        reportingToId: "",
        offeredCTC: Number(existing.offeredCTC) || 0,
        joiningBonus: 0,
        relocationBonus: 0,
        equityGrant: "",
        joiningDate: new Date(existing.joiningDate).toISOString().slice(0, 10),
        expiresAt: "",
      });
      setOfferEditId(existing.id);
    } else {
      setOffer({
        ...emptyOffer,
        designation: app.requisition.title,
        offeredCTC: app.candidate.expectedCTC ? Number(app.candidate.expectedCTC) : 0,
      });
      setOfferEditId(null);
    }
    setOfferApp(app);
  };

  const allApps = data?.data ?? [];

  const requisitionOpts = Array.from(
    new Map(allApps.map((a) => [a.requisition.id, a.requisition])).values(),
  ).map((r) => ({ value: r.id, label: `${r.requisitionNumber} — ${r.title}` }));

  const nq = nameQuery.trim().toLowerCase();
  const minExpMonths = minExpYears != null ? minExpYears * 12 : null;
  const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;

  const apps = allApps.filter((a) => {
    if (nq) {
      const hay = `${a.candidate.firstName} ${a.candidate.lastName} ${a.candidate.email}`.toLowerCase();
      if (!hay.includes(nq)) return false;
    }
    if (stageFilters.size > 0 && !(a.currentStage && stageFilters.has(a.currentStage))) return false;
    if (requisitionFilters.size > 0 && !requisitionFilters.has(a.requisition.id)) return false;
    if (minExpMonths !== null && (a.candidate.totalExperience ?? 0) < minExpMonths) return false;
    if (onlyWithFeedback && a._count.scorecards === 0) return false;
    if (fromTs !== null || toTs !== null) {
      const ts = a.appliedDate ? new Date(a.appliedDate).getTime() : null;
      if (ts === null) return false;
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }
    return true;
  });

  const visibleStages = stageFilters.size > 0 ? STAGES.filter((s) => stageFilters.has(s)) : STAGES;

  const groupedByStage = visibleStages.reduce<Record<string, ApplicationItem[]>>((acc, stage) => {
    acc[stage] = apps.filter((a) => a.currentStage === stage);
    return acc;
  }, {});

  const filtersActive = !!(nameQuery || stageFilters.size > 0 || requisitionFilters.size > 0 || minExpYears != null || onlyWithFeedback || dateFrom || dateTo);
  const clearFilters = () => {
    setNameQuery(""); setStageFilters(new Set()); setRequisitionFilters(new Set());
    setMinExpYears(null); setOnlyWithFeedback(false); setDateFrom(""); setDateTo("");
  };

  const exportCsv = () => {
    if (apps.length === 0) {
      toast.warning("Nothing to export", "No applications match current filters.");
      return;
    }
    const headers = [
      "Candidate Name", "Email", "Phone", "Current Company", "Experience (yrs)",
      "Expected CTC", "Requisition #", "Requisition Title", "Current Stage",
      "Status", "AI Match Score", "Feedback Count", "Interviews Count", "Applied Date",
    ];
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = apps.map((a) => [
      `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
      a.candidate.email,
      a.candidate.phone ?? "",
      a.candidate.currentCompany ?? "",
      a.candidate.totalExperience ? (a.candidate.totalExperience / 12).toFixed(1) : "",
      a.candidate.expectedCTC ?? "",
      a.requisition.requisitionNumber,
      a.requisition.title,
      a.currentStage ?? "",
      a.status,
      a.aiMatchScore ?? "",
      String(a._count.scorecards ?? 0),
      String(a._count.interviews ?? 0),
      a.appliedDate ? new Date(a.appliedDate).toISOString().slice(0, 10) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hiring-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported", `${apps.length} application${apps.length === 1 ? "" : "s"} downloaded as CSV.`);
  };

  const toggleStage = (s: string) => {
    setStageFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleRequisition = (id: string) => {
    setRequisitionFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Hiring pipeline</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-white overflow-hidden shadow-sm">
            <button
              onClick={() => setViewMode("kanban")}
              className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition",
                viewMode === "kanban"
                  ? "bg-[#16243A] text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50")}
              title="Kanban view"
            >
              <LayoutGrid size={13} /> Kanban
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-l border-gray-300 transition",
                viewMode === "list"
                  ? "bg-[#16243A] text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50")}
              title="List view"
            >
              <List size={13} /> List
            </button>
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
            title="Download filtered applications as CSV (opens in Excel)"
          >
            <Download size={13} /> Export Excel ({apps.length})
          </button>
          <span className="text-xs text-gray-500 ml-2">
            {apps.length} of {allApps.length}
          </span>
        </div>
      </div>

      {/* Compact stage strip — click to filter, doubles as funnel */}
      {allApps.length > 0 && (() => {
        const counts = STAGES.map((s) => ({ stage: s, value: allApps.filter((a) => (a.currentStage ?? STAGES[0]) === s).length }));
        const top = counts[0]?.value ?? 0;
        const hired = counts[counts.length - 1]?.value ?? 0;
        const overallConv = top > 0 ? Math.round((hired / top) * 100) : 0;
        return (
          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3 shadow-sm">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stages</h2>
                <span className="text-[11px] text-gray-500">{allApps.length} apps · {overallConv}% conv</span>
              </div>
              {stageFilters.size > 0 && (
                <button onClick={() => setStageFilters(new Set())} className="text-[11px] text-[#3b82f6] hover:underline">Reset</button>
              )}
            </div>
            <div className="flex items-stretch gap-1.5 overflow-x-auto">
              {counts.map(({ stage, value }) => {
                const active = stageFilters.has(stage);
                const pct = top > 0 ? (value / top) * 100 : 0;
                return (
                  <button
                    key={stage}
                    onClick={() => toggleStage(stage)}
                    className={clsx(
                      "flex-1 min-w-[110px] text-left px-3 py-2 rounded-lg border transition",
                      active ? "border-[#16243A] bg-[#16243A] text-white" : "border-gray-200 bg-white hover:border-gray-300",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={clsx("text-[11px] font-semibold", active ? "text-white" : "text-gray-700")}>
                        {stage.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span className={clsx("text-sm font-bold", active ? "text-white" : "text-gray-900")}>{value}</span>
                    </div>
                    <div className={clsx("mt-1.5 h-1 rounded-full overflow-hidden", active ? "bg-white/30" : "bg-gray-100")}>
                      <div
                        className={clsx("h-full rounded-full", active ? "bg-white" : "bg-[#3b82f6]")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Compact filter bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:bg-white focus:border-[#16243A] focus:outline-none focus:ring-1 focus:ring-[#16243A]/20"
          />
        </div>
        {requisitionOpts.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) toggleRequisition(e.target.value); }}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A]"
          >
            <option value="">+ Requisition</option>
            {requisitionOpts.filter((r) => !requisitionFilters.has(r.value)).map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
          title="Applied from"
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
          title="Applied to"
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A]"
        />
        <NumberInput
          min={0}
          value={minExpYears}
          onChange={(v) => setMinExpYears(v)}
          placeholder="Min exp"
          className="w-24 px-2 py-1.5 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#16243A]"
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 px-2 cursor-pointer">
          <input type="checkbox" checked={onlyWithFeedback} onChange={(e) => setOnlyWithFeedback(e.target.checked)}
            className="rounded border-gray-300 text-[#3b82f6] focus:ring-[#16243A]" />
          With feedback
        </label>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto px-2 py-1 text-[11px] text-[#3b82f6] hover:underline font-medium">Clear all</button>
        )}
      </div>

      {/* Active requisition chips */}
      {requisitionFilters.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {requisitionOpts.filter((r) => requisitionFilters.has(r.value)).map((r) => (
            <span key={r.value} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 rounded-full text-[11px] font-semibold">
              {r.label}
              <button onClick={() => toggleRequisition(r.value)} className="text-indigo-400 hover:text-indigo-700">×</button>
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : viewMode === "list" ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2.5">Candidate</th>
                <th className="px-3 py-2.5">Requisition</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Applied</th>
                <th className="px-3 py-2.5">Exp</th>
                <th className="px-3 py-2.5">Expected CTC</th>
                <th className="px-3 py-2.5 text-center">Feedback</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apps.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">No applications match current filters.</td></tr>
              )}
              {apps.map((app, i) => {
                const stageName = app.currentStage ?? "—";
                const si = STAGES.indexOf(stageName);
                const isHired = stageName === "Hired";
                return (
                  <tr key={app.id} className="row-stagger hover:bg-slate-50/60 transition" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#dbeafe] to-[#93c5fd] text-[#2563eb] flex items-center justify-center text-[11px] font-bold shrink-0">
                          {(app.candidate.firstName[0] ?? "") + (app.candidate.lastName[0] ?? "")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-900 truncate">{app.candidate.firstName} {app.candidate.lastName}</p>
                            <AtsBadge
                              score={app.aiMatchScore ? Number(app.aiMatchScore) : null}
                              verdict={app.aiMatchAnalysis?.verdict}
                              title={app.aiMatchAnalysis?.summary ?? undefined}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">{app.candidate.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800 truncate max-w-[200px]">{app.requisition.title}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{app.requisition.requisitionNumber}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={clsx(
                        "inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1",
                        isHired ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : app.status === "AppRejected" ? "bg-red-50 text-red-700 ring-red-200"
                          : "bg-[#dbeafe] text-[#2563eb] ring-[#3b82f6]",
                      )}>
                        {stageName.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">
                      {app.appliedDate ? new Date(app.appliedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">
                      {app.candidate.totalExperience ? `${(app.candidate.totalExperience / 12).toFixed(1)}y` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">
                      {app.candidate.expectedCTC ? `₹ ${Number(app.candidate.expectedCTC).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {app._count.scorecards > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                          <Star size={10} className="fill-current" /> {app._count.scorecards}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {!isHired && (() => {
                          const pending = isPendingSchedule(app);
                          return (
                            <button
                              onClick={() => openAction(app)}
                              className={clsx(
                                "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ring-1",
                                pending
                                  ? "bg-[#dbeafe] text-[#2563eb] ring-[#3b82f6] hover:bg-[#bfdbfe]"
                                  : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
                              )}
                              title={pending ? "Schedule interview" : "Give feedback"}
                            >
                              {pending ? <><CalendarPlus size={10} /> Schedule</> : <><Star size={10} /> Feedback</>}
                            </button>
                          );
                        })()}
                        {!isHired && si >= 0 && si < STAGES.length - 1 && (
                          <button
                            onClick={() => {
                              if ((app._count.scorecards ?? 0) === 0) {
                                toast.warning("Feedback required", `Provide feedback for "${stageName}" before moving to the next stage.`);
                                setFeedback({ overallRating: 4, recommendation: "", strengths: "", concerns: "", overallComments: "" });
                                setFeedbackApp(app);
                                return;
                              }
                              moveMut.mutate({ id: app.id, stage: STAGES[si + 1] });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#bfdbfe] hover:bg-[#dbeafe] rounded text-[11px] font-semibold" title="Next stage">
                            <ArrowRight size={10} /> Next
                          </button>
                        )}
                        <button onClick={() => setHistoryApp(app)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 rounded text-[11px] font-semibold" title="Feedback history">
                          <Clock size={10} /> History
                        </button>
                        {isHired ? (
                          <button onClick={() => onboardMut.mutate(app.id)} disabled={onboardMut.isPending}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded text-[11px] font-semibold shadow-sm disabled:opacity-50">
                            <UserPlus size={10} /> Onboard
                          </button>
                        ) : (
                          <button onClick={() => rejectMut.mutate(app.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 rounded text-[11px] font-semibold" title="Reject">
                            <X size={10} /> Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {visibleStages.map((stage) => {
            const si = STAGES.indexOf(stage);
            const mailOn = stageHasMail(stage);
            return (
            <div key={stage} className={clsx("flex-shrink-0 w-72 rounded-lg border p-3", stageColors[stage] ?? defaultStageColor)}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-1">
                  {stage.replace(/([A-Z])/g, " $1").trim()}
                  {mailOn && <Mail size={11} className="text-emerald-600" aria-label="Auto-mail on" />}
                </h3>
                <span className="text-xs bg-white/70 px-1.5 py-0.5 rounded text-gray-600">{groupedByStage[stage]?.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {(groupedByStage[stage] ?? []).map((app) => (
                  <div key={app.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={12} className="text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate">{app.candidate.firstName} {app.candidate.lastName}</p>
                          <AtsBadge
                            score={app.aiMatchScore ? Number(app.aiMatchScore) : null}
                            verdict={app.aiMatchAnalysis?.verdict}
                            title={app.aiMatchAnalysis?.summary ?? undefined}
                          />
                        </div>
                        <p className="text-xs text-gray-500 truncate">{app.requisition.title}</p>
                        {app.candidate.totalExperience ? (
                          <p className="text-xs text-gray-400">{Math.floor(app.candidate.totalExperience / 12)}y exp</p>
                        ) : null}
                        {app._count.scorecards > 0 && (
                          <p className="text-[10px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                            <Star size={9} className="fill-current" /> {app._count.scorecards} feedback
                          </p>
                        )}
                      </div>
                    </div>

                    {(app.latestInterview || app.latestOffer) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {app.latestInterview && (
                          <span
                            title={`Round ${app.latestInterview.round} · ${app.latestInterview.type}${app.latestInterview.interviewer ? ` · ${app.latestInterview.interviewer.firstName} ${app.latestInterview.interviewer.lastName}` : ""}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#bfdbfe]"
                          >
                            <CalendarPlus size={9} />
                            {new Date(app.latestInterview.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            {" · "}{app.latestInterview.status.replace("Int", "")}
                          </span>
                        )}
                        {app.latestOffer && (
                          <span
                            title={`${app.latestOffer.designation} · CTC ₹${Number(app.latestOffer.offeredCTC).toLocaleString("en-IN")}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          >
                            <FileCheck size={9} />
                            {app.latestOffer.status.replace("Offer", "")}
                            {" · ₹"}{(Number(app.latestOffer.offeredCTC) / 100000).toFixed(1)}L
                          </span>
                        )}
                      </div>
                    )}

                    {stage === "Hired" ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <button onClick={() => onboardMut.mutate(app.id)}
                          disabled={onboardMut.isPending}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded text-xs font-semibold shadow-sm disabled:opacity-50">
                          <UserPlus size={11} /> {onboardMut.isPending ? "Onboarding..." : "Onboard"}
                        </button>
                        <button
                          onClick={() => openDocRequest(app, "PostOffer")}
                          title="Request post-offer documents"
                          className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-violet-50 hover:text-violet-600 hover:ring-violet-200 rounded-md transition"
                        >
                          <FileCheck2 size={13} />
                        </button>
                      </div>
                    ) : (() => {
                      const pending = isPendingSchedule(app);
                      return (
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            onClick={() => openAction(app)}
                            className={clsx(
                              "flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-white rounded-md text-xs font-semibold shadow-sm hover:shadow transition",
                              pending
                                ? "bg-[#16243A] hover:bg-[#1E3354]"
                                : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700",
                            )}
                          >
                            {pending ? <><CalendarPlus size={11} /> Schedule Interview</> : <><Star size={11} /> Give Feedback</>}
                          </button>
                          <button
                            onClick={() => setHistoryApp(app)}
                            title="Feedback history"
                            className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:ring-indigo-200 rounded-md transition"
                          >
                            <Clock size={13} />
                          </button>
                          <button
                            onClick={() => openDocRequest(app, /offer/i.test(stage) ? "PreOffer" : "PostOffer")}
                            title="Request candidate documents"
                            className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-violet-50 hover:text-violet-600 hover:ring-violet-200 rounded-md transition"
                          >
                            <FileCheck2 size={13} />
                          </button>
                          {/offer/i.test(stage) && (
                            <button
                              onClick={() => openOfferModal(app)}
                              title={app.latestOffer ? "Edit offer" : "Send offer"}
                              className="inline-flex items-center justify-center w-8 h-8 bg-white text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-50 hover:ring-emerald-300 rounded-md transition"
                            >
                              {app.latestOffer ? <Pencil size={13} /> : <FileCheck size={13} />}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {stage === "Hired" && app.status === "AppHired" && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                        <CheckCircle size={11} /> Onboarding started
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Stage Feedback Modal */}
      <Modal open={!!feedbackApp} onClose={() => setFeedbackApp(null)} title="Stage Feedback" size="lg">
        {feedbackApp && (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!feedback.recommendation) return toast.error("Recommendation required");
            const nextStage = getNextStage(feedbackApp.currentStage);
            const deferStageMove = feedback.recommendation === "Hire" && !!nextStage && isInterviewStage(nextStage);
            feedbackMut.mutate({ id: feedbackApp.id, body: { ...feedback, deferStageMove } });
          }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm">
              <div className="font-semibold text-slate-900">{feedbackApp.candidate.firstName} {feedbackApp.candidate.lastName}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{feedbackApp.requisition.title}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#3b82f6] font-semibold">
                  <MessageSquare size={10} />
                  Stage: {(feedbackApp.currentStage ?? "Screening").replace(/([A-Z])/g, " $1").trim()}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Overall Rating</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setFeedback({ ...feedback, overallRating: n })}
                    className={clsx("w-10 h-10 rounded-lg border-2 flex items-center justify-center transition",
                      n <= feedback.overallRating
                        ? "border-amber-400 bg-amber-50 text-amber-600"
                        : "border-slate-200 text-slate-300 hover:border-slate-300")}>
                    <Star size={18} className={n <= feedback.overallRating ? "fill-current" : ""} />
                  </button>
                ))}
                <span className="ml-2 text-sm font-semibold text-slate-700">{feedback.overallRating}/5</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recommendation</label>
              {(() => {
                const nextStage = getNextStage(feedbackApp.currentStage);
                const nextLabel = nextStage ? nextStage.replace(/([A-Z])/g, " $1").trim() : "next stage";
                const nextIsInterview = isInterviewStage(nextStage);
                const opts = [
                  { value: "",          label: "Select recommendation…", description: "Required to save feedback" },
                  { value: "Hire",      label: "Approve",  description: nextIsInterview ? `Good fit — schedule ${nextLabel}` : `Good fit — move to ${nextLabel}` },
                  { value: "MaybeHire", label: "On Hold",  description: "Park for later — stays in current stage" },
                  { value: "NoHire",    label: "Reject",   description: "Not a fit — close application" },
                ];
                const rec = feedback.recommendation;
                if (!rec) return <Select value={rec} onChange={(v) => setFeedback({ ...feedback, recommendation: v })} options={opts} />;
                const previewIcon = rec === "Hire" ? <ArrowRight size={11} /> : rec === "MaybeHire" ? <Clock size={11} /> : <X size={11} />;
                const previewCls = rec === "Hire" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : rec === "MaybeHire" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200";
                const previewText = rec === "Hire"
                  ? (nextStage ? (nextIsInterview ? `Will move to ${nextLabel} → opens interview scheduler` : `Will move to ${nextLabel}`) : "Already at final stage")
                  : rec === "MaybeHire" ? "Stays in current stage — no auto-action"
                  : "Application will be marked rejected";
                return (
                  <>
                    <Select value={rec} onChange={(v) => setFeedback({ ...feedback, recommendation: v })} options={opts} />
                    <div className={clsx("mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md ring-1 text-[11px] font-semibold", previewCls)}>
                      {previewIcon} {previewText}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
                <textarea rows={3} value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concerns</label>
                <textarea rows={3} value={feedback.concerns} onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall Comments</label>
              <textarea rows={2} value={feedback.overallComments} onChange={(e) => setFeedback({ ...feedback, overallComments: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setFeedbackApp(null)} disabled={feedbackMut.isPending}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={feedbackMut.isPending || !feedback.recommendation}
                className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {feedbackMut.isPending ? "Saving..." : "Save Feedback"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Request Candidate Documents Modal */}
      <Modal
        open={!!docRequestApp}
        onClose={() => !docRequestMut.isPending && setDocRequestApp(null)}
        title={docRequestApp?.bundle === "PreOffer" ? "Request Before-Offer Documents" : "Request After-Offer Documents"}
        size="lg"
      >
        {docRequestApp && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (docRequestSelected.size === 0) return toast.error("Select at least one document");
              docRequestMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-violet-700 text-xs font-semibold mb-1">
                <FileCheck2 size={12} /> {docRequestApp.bundle === "PreOffer" ? "Before Offer" : "After Offer"} bundle
              </div>
              <div className="font-semibold text-slate-900">{docRequestApp.app.candidate.firstName} {docRequestApp.app.candidate.lastName}</div>
              <div className="text-xs text-slate-600 mt-0.5 truncate">
                {docRequestApp.app.requisition.title} · {docRequestApp.app.candidate.email}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Select documents to request</p>
              <div className="flex items-center gap-2 text-xs">
                <button type="button"
                  onClick={() => setDocRequestSelected(new Set(docTypesForBundle.map((d) => d.id)))}
                  className="text-[#3b82f6] hover:underline font-medium">All</button>
                <span className="text-slate-300">·</span>
                <button type="button"
                  onClick={() => setDocRequestSelected(new Set(docTypesForBundle.filter((d) => d.isRequired).map((d) => d.id)))}
                  className="text-[#3b82f6] hover:underline font-medium">Required only</button>
                <span className="text-slate-300">·</span>
                <button type="button"
                  onClick={() => setDocRequestSelected(new Set())}
                  className="text-slate-500 hover:text-slate-700 font-medium">None</button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg max-h-[46vh] overflow-y-auto">
              {docTypesForBundle.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">Loading doc list…</div>
              ) : (
                docTypesForBundle.map((d) => {
                  const on = docRequestSelected.has(d.id);
                  return (
                    <label key={d.id} className={clsx(
                      "flex items-start gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 cursor-pointer transition",
                      on ? "bg-violet-50/60" : "hover:bg-slate-50")}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = new Set(docRequestSelected);
                          if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                          setDocRequestSelected(next);
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileText size={12} className="text-slate-400" />
                          <span className="text-sm font-semibold text-slate-800">{d.name}</span>
                          {d.isRequired
                            ? <span className="text-[9px] font-bold uppercase tracking-wide bg-red-50 text-red-700 ring-1 ring-red-200 px-1.5 py-0.5 rounded">Required</span>
                            : <span className="text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Optional</span>}
                        </div>
                        {d.helpText && <p className="text-[11px] text-slate-500 mt-0.5 ml-4">{d.helpText}</p>}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <p className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Candidate will receive a secure link valid for 7 days. Link auto-reminds after 24h / 48h / 72h if still pending.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDocRequestApp(null)} disabled={docRequestMut.isPending}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={docRequestMut.isPending || docRequestSelected.size === 0}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
                <Mail size={13} /> {docRequestMut.isPending ? "Sending…" : `Send Request (${docRequestSelected.size})`}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Schedule Interview Modal — opens after Approve when next stage is interview */}
      <Modal open={!!scheduleApp} onClose={() => !scheduleMut.isPending && setScheduleApp(null)} title="Schedule Interview" size="lg">
        {scheduleApp && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!schedule.interviewerId) return toast.error("Interviewer required");
              if (!schedule.scheduledAt) return toast.error("Date & time required");
              if (schedule.type === "Video" && !schedule.meetingLink) return toast.error("Meeting link required for video");
              if (schedule.type === "InPerson" && !schedule.location) return toast.error("Location required for in-person");
              scheduleMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold mb-1">
                <CheckCircle size={12} /> Feedback saved · Now schedule next round
              </div>
              <div className="font-semibold text-slate-900">{scheduleApp.app.candidate.firstName} {scheduleApp.app.candidate.lastName}</div>
              <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{scheduleApp.app.requisition.title}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white text-emerald-700 ring-1 ring-emerald-300 font-semibold">
                  <CalendarPlus size={10} /> {scheduleApp.stage.replace(/([A-Z])/g, " $1").trim()} · Round {STAGES.indexOf(scheduleApp.stage) + 1}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interview Type *</label>
                <Select
                  value={schedule.type}
                  onChange={(v) => setSchedule({ ...schedule, type: v as typeof schedule.type })}
                  options={[
                    { value: "Video",            label: "Video Call",        description: "Zoom / Meet / Teams" },
                    { value: "Phone",            label: "Phone Screen",      description: "Voice only" },
                    { value: "InPerson",         label: "In-Person",         description: "On-site" },
                    { value: "Panel",            label: "Panel",             description: "Multiple interviewers" },
                    { value: "TakeHome",         label: "Take-Home Task",    description: "Async assignment" },
                    { value: "GroupDiscussion",  label: "Group Discussion",  description: "Multi-candidate" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer *</label>
                <Select
                  value={schedule.interviewerId}
                  onChange={(v) => setSchedule({ ...schedule, interviewerId: v })}
                  options={[{ value: "", label: "Select interviewer…" },
                    ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, description: e.jobTitle ?? undefined })),
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  value={schedule.scheduledAt}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && new Date(v).getTime() < Date.now() - 60000) {
                      toast.error("Cannot schedule in the past");
                      return;
                    }
                    setSchedule({ ...schedule, scheduledAt: v });
                  }}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min) *</label>
                <NumberInput
                  allowDecimal={false}
                  min={15}
                  required
                  value={schedule.duration}
                  onChange={(v) => setSchedule({ ...schedule, duration: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
            </div>

            {(schedule.type === "Video" || schedule.type === "Panel") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"><Link2 size={12} /> Meeting Link {schedule.type === "Video" && "*"}</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/…"
                  value={schedule.meetingLink}
                  onChange={(e) => setSchedule({ ...schedule, meetingLink: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
            )}
            {(schedule.type === "InPerson" || schedule.type === "Panel" || schedule.type === "GroupDiscussion") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"><MapPin size={12} /> Location {schedule.type === "InPerson" && "*"}</label>
                <input
                  type="text"
                  placeholder="Office address, room, or floor"
                  value={schedule.location}
                  onChange={(e) => setSchedule({ ...schedule, location: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
              </div>
            )}

            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Stage will move to <strong>{scheduleApp.stage.replace(/([A-Z])/g, " $1").trim()}</strong> only after interview is scheduled. Closing this dialog keeps candidate at current stage.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="submit" disabled={scheduleMut.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
                <CalendarPlus size={13} /> {scheduleMut.isPending ? "Scheduling..." : "Schedule Interview"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Move / Edit Stage Modal */}
      <Modal open={!!moveApp} onClose={() => setMoveApp(null)} title="Edit Stage">
        {moveApp && (
          <form onSubmit={(e) => { e.preventDefault(); moveMut.mutate({ id: moveApp.id, stage: moveTarget }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <div className="font-semibold text-slate-900">{moveApp.candidate.firstName} {moveApp.candidate.lastName}</div>
              <div className="text-xs text-slate-500">{moveApp.requisition.title}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Move to Stage</label>
              <Select value={moveTarget} onChange={setMoveTarget}
                options={STAGES.map((s) => ({
                  value: s,
                  label: s.replace(/([A-Z])/g, " $1").trim(),
                  description: s === moveApp.currentStage
                    ? "Current stage"
                    : stageHasMail(s) ? "Auto-mail enabled" : undefined,
                }))} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setMoveApp(null)}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={moveMut.isPending || moveTarget === moveApp.currentStage}
                className="px-5 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
                {moveMut.isPending ? "Moving..." : "Move"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Offer Modal — shared endpoint with /recruit/offers, so edits sync both ways */}
      <Modal
        open={!!offerApp}
        onClose={() => { if (!offerMut.isPending) { setOfferApp(null); setOfferEditId(null); } }}
        title={offerEditId ? "Edit Offer" : "Send Offer"}
        size="xl"
      >
        {offerApp && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!offer.designation) return toast.error("Designation required");
              if (!offer.offeredCTC) return toast.error("CTC required");
              if (!offer.joiningDate) return toast.error("Joining date required");
              offerMut.mutate();
            }}
            className="space-y-5"
          >
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold mb-1">
                <FileCheck size={12} /> {offerEditId ? "Existing offer — edit details" : "Create offer for this candidate"}
              </div>
              <div className="font-semibold text-slate-900">{offerApp.candidate.firstName} {offerApp.candidate.lastName}</div>
              <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{offerApp.requisition.title}</span>
                <span>·</span>
                <span>{offerApp.candidate.email}</span>
                {offerApp.candidate.expectedCTC && (
                  <>
                    <span>·</span>
                    <span>Expected ₹{Number(offerApp.candidate.expectedCTC).toLocaleString("en-IN")}</span>
                  </>
                )}
              </div>
            </div>

            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <Briefcase size={12} /> Role
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Designation <span className="text-red-500">*</span></label>
                  <input type="text" value={offer.designation} onChange={(e) => setOffer({ ...offer, designation: e.target.value })} required
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                  <Select value={offer.departmentId} onChange={(v) => setOffer({ ...offer, departmentId: v })}
                    placeholder="Select department" searchable clearable
                    options={departments.map((d) => ({ value: d.id, label: d.name }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reporting Manager</label>
                  <Select value={offer.reportingToId} onChange={(v) => setOffer({ ...offer, reportingToId: v })}
                    placeholder="Select manager" searchable clearable
                    options={employees.map((e) => ({
                      value: e.id,
                      label: `${e.firstName} ${e.lastName}`,
                      description: `${e.employeeCode ?? ""}${e.jobTitle ? ` · ${e.jobTitle}` : ""}`,
                    }))} />
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <IndianRupee size={12} /> Compensation
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1 whitespace-nowrap">
                    <IndianRupee size={11} /> Annual CTC <span className="text-red-500">*</span>
                  </label>
                  <NumberInput min={0} value={offer.offeredCTC}
                    onChange={(v) => setOffer({ ...offer, offeredCTC: v ?? 0 })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Gift size={11} /> Joining Bonus</label>
                  <NumberInput min={0} value={offer.joiningBonus}
                    onChange={(v) => setOffer({ ...offer, joiningBonus: v ?? 0 })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Gift size={11} /> Relocation</label>
                  <NumberInput min={0} value={offer.relocationBonus}
                    onChange={(v) => setOffer({ ...offer, relocationBonus: v ?? 0 })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Equity Grant (optional)</label>
                  <input type="text" value={offer.equityGrant}
                    placeholder="e.g. 0.1% vested over 4 years"
                    onChange={(e) => setOffer({ ...offer, equityGrant: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <Calendar size={12} /> Dates
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Joining Date <span className="text-red-500">*</span></label>
                  <input type="date" value={offer.joiningDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setOffer({ ...offer, joiningDate: e.target.value })} required
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Offer Expires</label>
                  <input type="date" value={offer.expiresAt}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setOffer({ ...offer, expiresAt: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
                </div>
              </div>
            </section>

            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {offerEditId
                ? "Saving updates the same record visible in the Offers page."
                : "Creates the offer in Draft. Send the letter from the Offers page."}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button"
                onClick={() => { setOfferApp(null); setOfferEditId(null); }}
                disabled={offerMut.isPending}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit"
                disabled={offerMut.isPending || !offer.designation || !offer.offeredCTC || !offer.joiningDate}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50">
                <FileCheck size={13} />
                {offerMut.isPending ? "Saving..." : (offerEditId ? "Save Changes" : "Create Offer")}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {historyApp && (
        <FeedbackHistoryModal app={historyApp} onClose={() => setHistoryApp(null)} />
      )}
    </div>
  );
}

interface FeedbackHistoryEntry {
  id: string;
  stage: string;
  round: number;
  overallRating: number;
  recommendation: "StrongHire" | "Hire" | "MaybeHire" | "NoHire" | "StrongNoHire";
  strengths: string | null;
  concerns: string | null;
  overallComments: string | null;
  submittedAt: string;
  interview: { id: string; type: string; scheduledAt: string; duration: number; status: string };
  interviewer: { id: string; name: string; jobTitle: string | null; employeeCode: string; profilePhoto: string | null };
}

interface FeedbackHistoryResponse {
  applicationId: string;
  currentStage: string | null;
  stages: string[];
  history: FeedbackHistoryEntry[];
}

const REC_META: Record<FeedbackHistoryEntry["recommendation"], { label: string; cls: string; icon: React.ReactNode }> = {
  StrongHire:   { label: "Strong Approve", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <ThumbsUp size={11} /> },
  Hire:         { label: "Approve",        cls: "bg-green-50 text-green-700 ring-green-200",       icon: <ThumbsUp size={11} /> },
  MaybeHire:    { label: "On Hold",        cls: "bg-amber-50 text-amber-700 ring-amber-200",       icon: <MessageSquare size={11} /> },
  NoHire:       { label: "Reject",         cls: "bg-red-50 text-red-700 ring-red-200",             icon: <ThumbsDown size={11} /> },
  StrongNoHire: { label: "Strong Reject",  cls: "bg-rose-50 text-rose-700 ring-rose-200",          icon: <ThumbsDown size={11} /> },
};

function FeedbackHistoryModal({ app, onClose }: { app: ApplicationItem; onClose: () => void }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["application-feedback-history", app.id],
    queryFn: () => api.get<FeedbackHistoryResponse>(`/api/v1/hrms/recruit/applications/${app.id}/feedback-history`),
  });
  const res = data?.data;

  return (
    <Modal open={true} onClose={onClose} title="Feedback History" size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm">
          <div className="font-semibold text-slate-900">{app.candidate.firstName} {app.candidate.lastName}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
            <span>{app.requisition.title}</span>
            <span>·</span>
            <span>{app.candidate.email}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#3b82f6] font-semibold">
              Current: {(res?.currentStage ?? app.currentStage ?? "—").replace(/([A-Z])/g, " $1").trim()}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-sm text-slate-500">Loading feedback history...</div>
        ) : !res || res.history.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
            <MessageSquare size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No feedback yet</p>
            <p className="text-xs text-slate-500 mt-1">Submit stage feedback to see it here.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {res.history.map((h) => {
              const rec = REC_META[h.recommendation];
              return (
                <div key={h.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#dbeafe] to-[#93c5fd] text-[#2563eb] flex items-center justify-center text-sm font-bold shrink-0">
                      {h.interviewer.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{h.interviewer.name}</p>
                        {h.interviewer.jobTitle && (
                          <span className="text-xs text-slate-500">· {h.interviewer.jobTitle}</span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">{h.interviewer.employeeCode}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dbeafe] text-[#2563eb] ring-1 ring-[#3b82f6]">
                          {h.stage.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1", rec.cls)}>
                          {rec.icon} {rec.label}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600 font-semibold">
                          <Star size={11} className="fill-current" /> {h.overallRating}/5
                        </span>
                        <span className="text-[11px] text-slate-400 ml-auto">
                          {new Date(h.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(h.strengths || h.concerns || h.overallComments) && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {h.strengths && (
                        <div className="rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-2">
                          <p className="font-semibold text-emerald-700 mb-0.5">Strengths</p>
                          <p className="text-slate-700 whitespace-pre-wrap">{h.strengths}</p>
                        </div>
                      )}
                      {h.concerns && (
                        <div className="rounded-md bg-red-50 border border-red-100 px-2.5 py-2">
                          <p className="font-semibold text-red-700 mb-0.5">Concerns</p>
                          <p className="text-slate-700 whitespace-pre-wrap">{h.concerns}</p>
                        </div>
                      )}
                      {h.overallComments && (
                        <div className="md:col-span-2 rounded-md bg-slate-50 border border-slate-100 px-2.5 py-2">
                          <p className="font-semibold text-slate-700 mb-0.5">Overall Comments</p>
                          <p className="text-slate-700 whitespace-pre-wrap">{h.overallComments}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-400">
                    <span>Interview type: {h.interview.type}</span>
                    <span>· Duration: {h.interview.duration} min</span>
                    <span>· Round: {h.round}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}
