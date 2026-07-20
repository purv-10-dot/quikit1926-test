"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import Link from "next/link";
import { useToast } from "@/components/hrms/toast";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { User, Users, ArrowRight, UserPlus, CheckCircle, Check, Star, MessageSquare, X, Search, Mail, Clock, ThumbsUp, ThumbsDown, LayoutGrid, List, Download, CalendarPlus, MapPin, Link2, FileCheck2, FileText, Briefcase, Calendar, FileCheck, Copy, ExternalLink, SkipForward, Phone, Video, Award, Send, BellRing, Info, AlertTriangle, ChevronDown, Save, HelpCircle, ClipboardList } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { SendOfferWizard } from "./_components/send-offer-wizard";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";

interface ApplicationItem {
  id: string;
  currentStage: string | null;
  status: string;
  aiMatchScore: string | null;
  aiMatchAnalysis?: { verdict?: string; summary?: string } | null;
  appliedDate: string;
  stageHistory?: Array<{ stage?: string; date?: string; movedBy?: string; reason?: string }> | null;
  candidate: {
    id: string; firstName: string; lastName: string; email: string; phone: string | null;
    location: string | null; source: string | null;
    currentCompany: string | null; currentDesignation: string | null;
    totalExperience: number | null; noticePeriod: number | null;
    currentCTC: string | null; expectedCTC: string | null;
    skills: string[] | null; linkedinUrl: string | null; portfolioUrl: string | null; resumeUrl: string | null;
  };
  requisition: { id: string; title: string; requisitionNumber: string; interviewPanel?: string[] | null; technicalQuestions?: string[] | null };
  _count: { interviews: number; scorecards: number };
  avgRating: number | null;
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
  docRequest: {
    status: "Pending" | "Completed" | "Cancelled";
    lastReminderAt: string | null; reminderCount: number | null;
  } | null;
  docGate: { blocking: boolean; pending: string[] } | null;
}

const REMINDER_COOLDOWN_HOURS = 24;
function reminderCooldownRemaining(lastReminderAt: string | null): number {
  if (!lastReminderAt) return 0;
  const elapsedMs = Date.now() - new Date(lastReminderAt).getTime();
  const cooldownMs = REMINDER_COOLDOWN_HOURS * 3600 * 1000;
  return Math.max(0, cooldownMs - elapsedMs);
}

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

// Columns for the styled .xlsx export of the filtered applications list.
const PIPELINE_EXCEL_COLUMNS = [
  { header: "Candidate", key: "candidate", width: 22 },
  { header: "Email", key: "email", width: 28 },
  { header: "Requisition", key: "requisition", width: 26 },
  { header: "Current Stage", key: "stage", width: 18 },
  { header: "Status", key: "status", width: 14 },
  { header: "Applied", key: "applied", width: 16 },
];

// Screening-call questionnaire — the same for every job. Shown only in the
// Screening stage; the recruiter captures each answer live on the call.
const SCREENING_CHECKLIST: { key: string; label: string; question: string; hint?: string; type?: "text" | "select"; options?: string[] }[] = [
  { key: "name", label: "Name", question: "What is your name?" },
  { key: "contact", label: "Contact number", question: "What is your contact number?" },
  { key: "email", label: "Email", question: "What is your email address?" },
  { key: "techStack", label: "Tech stack", question: "What is your tech stack?" },
  { key: "experience", label: "Experience", question: "How much experience do you have?", hint: "total / relevant" },
  { key: "location", label: "Location", question: "Where are you located?", hint: "current location & hometown" },
  { key: "reasonForChange", label: "Reason for job change", question: "Why are you looking for a change?" },
  { key: "noticePeriod", label: "Notice period", question: "What is your notice period?" },
  { key: "currentSalary", label: "Current salary", question: "What is your current salary?" },
  { key: "expectedSalary", label: "Expected salary", question: "What is your expected salary?" },
  { key: "communication", label: "Communication", question: "How was the communication?", hint: "rate on the call" },
  { key: "interviewScheduled", label: "Interview scheduled", question: "Is the interview scheduled?", hint: "date & time confirmed?" },
  { key: "status", label: "Status", question: "What is the status?", hint: "shortlisted / on hold / rejected", type: "select", options: ["Shortlisted", "On hold", "Rejected"] },
];

const stageColors: Record<string, string> = {
  Screening: "bg-gray-50 border-gray-200",
  PhoneScreen: "bg-[#dcfce7] border-[#bbf7d0]",
  TechnicalInterview: "bg-purple-50 border-purple-200",
  ManagerInterview: "bg-orange-50 border-orange-200",
  HRInterview: "bg-sky-50 border-sky-200",
  Assessment: "bg-violet-50 border-violet-200",
  FinalRound: "bg-green-50 border-green-200",
  Interview: "bg-[#dcfce7] border-[#86efac]",
  Offer: "bg-emerald-50 border-emerald-200",
  Hired: "bg-green-50 border-green-200",
};

const defaultStageColor = "bg-slate-50 border-slate-200";

function atsTone(score: number): { bg: string; text: string; ring: string; label: string } {
  if (score >= 85) return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", label: "Strong" };
  if (score >= 70) return { bg: "bg-[#dcfce7]", text: "text-[#16a34a]", ring: "ring-[#bbf7d0]", label: "Good" };
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

/**
 * Scrollable column body that renders ALL cards and shows a non-interactive
 * "more below" cue at the bottom while there's content below the fold. The cue
 * hides once you scroll to the end.
 */
function StageScroll({ children, count }: { children: React.ReactNode; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showCue, setShowCue] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const overflowing = el.scrollHeight > el.clientHeight + 4;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      setShowCue(overflowing && !atBottom);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [count]);
  return (
    <div className="relative flex-1 min-h-0">
      <div ref={ref} className="h-full overflow-y-auto no-scrollbar space-y-2 px-3 pb-2">
        {children}
      </div>
      {showCue && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pt-8 pb-2 bg-gradient-to-t from-white via-white/85 to-transparent">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white shadow-sm ring-1 ring-gray-200 text-[11px] font-medium text-gray-500">
            More candidates below <ChevronDown size={12} />
          </span>
        </div>
      )}
    </div>
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [feedbackApp, setFeedbackApp] = useState<ApplicationItem | null>(null);
  const [feedback, setFeedback] = useState({ overallRating: 7, recommendation: "" as string, strengths: "", concerns: "", overallComments: "" });
  // "Move forward" reuses the `feedback` state above for rating/strengths/etc.
  const [skipApp, setSkipApp] = useState<ApplicationItem | null>(null);
  const [skipTarget, setSkipTarget] = useState<string>("");

  const [moveApp, setMoveApp] = useState<ApplicationItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");

  const [historyApp, setHistoryApp] = useState<ApplicationItem | null>(null);
  const [questionsApp, setQuestionsApp] = useState<ApplicationItem | null>(null);
  const [screeningApp, setScreeningApp] = useState<ApplicationItem | null>(null);
  // Reject-with-reason: X opens this dialog instead of rejecting immediately.
  const [rejectApp, setRejectApp] = useState<ApplicationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Popup shown when HR tries to advance to Offer while requested docs are unapproved.
  const [docBlockApp, setDocBlockApp] = useState<ApplicationItem | null>(null);

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const [docRequestApp, setDocRequestApp] = useState<{ app: ApplicationItem; bundle: "PreOffer" | "PostOffer" } | null>(null);
  const [docRequestSelected, setDocRequestSelected] = useState<Set<string>>(new Set());
  const [docRequestDeadline, setDocRequestDeadline] = useState("");

  const [scheduleApp, setScheduleApp] = useState<{ app: ApplicationItem; stage: string } | null>(null);
  const [schedule, setSchedule] = useState({
    interviewerIds: [] as string[],
    scheduledAt: "",
    duration: 60 as number | null,
    type: "Video" as "Phone" | "Video" | "InPerson" | "Panel" | "TakeHome" | "GroupDiscussion",
    location: "",
    meetingLink: "",
  });
  // After scheduling, hold the result so we can show the (possibly auto-generated
  // Teams) meeting link back to the recruiter instead of closing immediately.
  const [scheduleResult, setScheduleResult] = useState<{ meetingLink: string | null; type: string } | null>(null);

  // Send Offer — the 4-step wizard (create/edit the offer + email it in one flow).
  // Replaces the old single-page offer modal and send-confirm dialog.
  // (The standalone /recruit/offers page was removed; this is the only entry point.)
  const [offerWizardApp, setOfferWizardApp] = useState<ApplicationItem | null>(null);

  // Accept / Decline — captured via the stage-feedback modal.
  const emptyOfferFb = { overallRating: 7, recommendation: "", strengths: "", concerns: "", overallComments: "" };
  const [offerDecision, setOfferDecision] = useState<{ app: ApplicationItem; kind: "accept" | "decline" } | null>(null);
  const [offerFb, setOfferFb] = useState(emptyOfferFb);

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-apps", reqFilter],
    // Include offered / on-hold candidates so the Offer stage shows the whole
    // offer lifecycle (Draft → Sent → Accept/Decline), not just AppActive.
    queryFn: () => api.get<ApplicationItem[]>(`/api/v1/hrms/recruit/applications?status=AppActive,AppOffered,AppOnHold&limit=200${reqFilter ? `&requisitionId=${reqFilter}` : ""}`),
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
  // Technical interview questions (from the requisition) are surfaced on every
  // pipeline stage EXCEPT Screening, Offer, and Hired.
  const showQuestions = (app: ApplicationItem) => {
    const qs = app.requisition.technicalQuestions;
    if (!qs || qs.length === 0) return false;
    return !/screen|offer|hire/i.test(app.currentStage ?? "");
  };
  // Static screening checklist — shown ONLY in the Screening stage.
  const showScreening = (app: ApplicationItem) => /screen/i.test(app.currentStage ?? "");
  // Manual "Move forward" / "Skip" only advances through pre-offer stages — a
  // candidate can be pushed up to (and into) the HR/interview rounds, but NOT
  // into Offer/Hired via these buttons. Those transitions happen through the
  // offer flow (send offer) and onboarding.
  const canMoveForward = (current: string | null | undefined) => {
    const idx = current ? STAGES.indexOf(current) : -1;
    if (idx < 0 || idx >= STAGES.length - 1) return false;
    const next = STAGES[idx + 1];
    return !/offer|hired/i.test(next);
  };
  const getNextStage = (current: string | null | undefined) => {
    const idx = current ? STAGES.indexOf(current) : -1;
    return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
  };

  const BLANK_FEEDBACK = { overallRating: 7, recommendation: "", strengths: "", concerns: "", overallComments: "" };

  // Fetch existing feedback for the CURRENT stage only, so reopening the form for
  // a stage you already gave feedback on shows it. A brand-new stage stays blank
  // (we never inherit a previous stage's feedback).
  const prefillFeedback = async (app: ApplicationItem): Promise<typeof feedback> => {
    try {
      const res = await api.get<FeedbackHistoryResponse>(`/api/v1/hrms/recruit/applications/${app.id}/feedback-history`);
      const hist = res.data?.history ?? [];
      const stages = res.data?.stages ?? STAGES;
      const curIdx = stages.indexOf(app.currentStage ?? "");
      const entry = curIdx >= 0 ? hist.find((h) => h.round === curIdx + 1) : undefined;
      if (entry) {
        return {
          overallRating: entry.overallRating ?? 7,
          recommendation: entry.recommendation ?? "",
          strengths: entry.strengths ?? "",
          concerns: entry.concerns ?? "",
          overallComments: entry.overallComments ?? "",
        };
      }
    } catch { /* fall through to blank */ }
    return { ...BLANK_FEEDBACK };
  };

  const isPendingSchedule = (app: ApplicationItem) => {
    const cur = app.currentStage ?? STAGES[0];
    const idx = STAGES.indexOf(cur);
    const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
    return !!app.latestScorecard
      && app.latestScorecard.round === idx + 1
      && (app.latestScorecard.recommendation === "Hire" || app.latestScorecard.recommendation === "StrongHire")
      && !!next
      && isInterviewStage(next);
  };

  // Feedback can only be given once the interview's scheduled start time has arrived.
  const feedbackNotYet = (app: ApplicationItem) =>
    !!app.latestInterview && new Date(app.latestInterview.scheduledAt).getTime() > Date.now();

  // Feedback for the current stage has already been submitted. Set by every
  // submission path — in-app, interview-invite mail, and reminder mail — since
  // all persist a scorecard for the current round (latestScorecard).
  const feedbackGiven = (app: ApplicationItem) => {
    const cur = app.currentStage ?? STAGES[0];
    const curRound = STAGES.indexOf(cur) + 1;
    return !!app.latestScorecard && app.latestScorecard.round === curRound;
  };

  // After a positive final-round scorecard, the next stage is the Offer stage — a
  // non-interview stage the Skip/Next controls intentionally don't cover, so the
  // candidate otherwise dead-ends at "View Feedback". Surface a primary
  // "Move to Offer" action; moving there auto-creates the offer draft and the
  // Offer-column card then shows "Send Offer".
  const readyForOffer = (app: ApplicationItem) => {
    const cur = app.currentStage ?? STAGES[0];
    const idx = STAGES.indexOf(cur);
    const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
    return isInterviewStage(cur)
      && !!app.latestScorecard
      && app.latestScorecard.round === idx + 1
      && (app.latestScorecard.recommendation === "Hire" || app.latestScorecard.recommendation === "StrongHire")
      && !!next && /offer/i.test(next);
  };

  const openAction = (app: ApplicationItem) => {
    if (isPendingSchedule(app)) {
      const cur = app.currentStage ?? STAGES[0];
      const next = STAGES[STAGES.indexOf(cur) + 1];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setMinutes(0, 0, 0);
      const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setSchedule({ interviewerIds: [], scheduledAt: iso, duration: 60, type: "Video", location: "", meetingLink: "" });
      setScheduleResult(null);
      setScheduleApp({ app, stage: next });
    } else {
      setFeedback({ overallRating: 7, recommendation: "", strengths: "", concerns: "", overallComments: "" });
      setFeedbackApp(app);
      prefillFeedback(app).then(setFeedback);
    }
  };

  const { data: empData } = useQuery({
    queryKey: ["employees-active-list"],
    queryFn: () => api.get<{ id: string; firstName: string; lastName: string; jobTitle: string | null; employeeCode?: string }[]>("/api/v1/hrms/employees?status=Active&limit=200"),
    enabled: !!scheduleApp,
  });
  const employees = empData?.data ?? [];
  // #3 — restrict the scheduler's interviewer list to the requisition's interview panel.
  const schedulePanelIds: string[] = scheduleApp && Array.isArray(scheduleApp.app.requisition.interviewPanel)
    ? (scheduleApp.app.requisition.interviewPanel as string[]) : [];
  const schedulePanelEmps = schedulePanelIds.length ? employees.filter((e) => schedulePanelIds.includes(e.id)) : [];
  const scheduleInterviewerChoices = schedulePanelEmps.length ? schedulePanelEmps : employees;

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
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/api/v1/hrms/recruit/applications/${id}`, { status: "AppRejected", rejectionReason: reason }),
    onSuccess: () => { invalidateAll(); setRejectApp(null); setRejectReason(""); },
  });

  // "Move forward" uses the same rich feedback form as stage feedback, but with
  // an explicit target-stage picker instead of a recommendation. It records the
  // real feedback (rating/strengths/concerns/comments) for the current stage
  // WITHOUT auto-moving (deferStageMove), then moves to the chosen stage — or,
  // for an interview stage, opens the scheduler (booking does the move).
  const skipMut = useMutation({
    mutationFn: async ({ id, target, body, openScheduler }: {
      id: string; target: string; openScheduler: boolean;
      body: { overallRating: number; strengths: string; concerns: string; overallComments: string };
    }) => {
      await api.post(`/api/v1/hrms/recruit/applications/${id}/stage-feedback`, {
        overallRating: body.overallRating,
        recommendation: "Hire",
        deferStageMove: true,
        strengths: body.strengths || undefined,
        concerns: body.concerns || undefined,
        overallComments: body.overallComments || undefined,
      });
      if (!openScheduler) {
        await api.patch(`/api/v1/hrms/recruit/applications/${id}`, {
          currentStage: target,
          moveReason: body.overallComments || "Moved forward",
        });
      }
    },
    onSuccess: (_res, vars) => {
      invalidateAll();
      const app = skipApp;
      setSkipApp(null); setSkipTarget("");
      if (vars.openScheduler && app) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        tomorrow.setMinutes(0, 0, 0);
        const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setSchedule({ interviewerIds: [], scheduledAt: iso, duration: 60, type: "Video", location: "", meetingLink: "" });
        setScheduleResult(null);
        setScheduleApp({ app, stage: vars.target });
      } else {
        toast.success("Moved forward", "Candidate advanced to the selected stage.");
      }
    },
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
      setFeedback({ overallRating: 7, recommendation: "", strengths: "", concerns: "", overallComments: "" });
      toast.success("Feedback saved", willSchedule ? "Stage will move once interview is scheduled" : undefined);
      if (willSchedule && app && nextStage) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        tomorrow.setMinutes(0, 0, 0);
        const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setSchedule({ interviewerIds: [], scheduledAt: iso, duration: 60, type: "Video", location: "", meetingLink: "" });
        setScheduleResult(null);
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

  // Existing request for THIS bundle — drives the modal's "already requested"
  // state (status pill, pre-checked docs, Update vs Send, in-modal reminder).
  const { data: docBundleStatus, refetch: refetchDocBundle } = useQuery({
    queryKey: ["doc-bundle-status", docRequestApp?.app.id, docRequestApp?.bundle],
    queryFn: () => api.get<{
      request: {
        status: "Pending" | "Completed" | "Cancelled" | "Expired";
        requestSentAt: string;
        submissionDeadline: string | null;
        selectedDocTypeIds: string[] | null;
        lastReminderAt: string | null;
        reminderCount: number | null;
        uploads: Array<{ documentTypeId: string | null }>;
      } | null;
    }>(`/api/v1/hrms/recruit/applications/${docRequestApp!.app.id}/documents/${docRequestApp!.bundle}`),
    enabled: !!docRequestApp,
  });
  const existingReq = docBundleStatus?.data?.request ?? null;
  // Enhanced "update / re-request" state applies to a still-Pending request — the
  // service can refresh + resend those. Completed bundles fall back to the plain
  // flow (they can't be re-sent).
  const alreadyRequested = existingReq?.status === "Pending";
  const receivedCount = existingReq
    ? new Set(existingReq.uploads.filter((u) => u.documentTypeId).map((u) => u.documentTypeId)).size
    : 0;

  const docRequestMut = useMutation({
    mutationFn: () => {
      if (!docRequestApp) throw new Error("No application selected");
      return api.post(`/api/v1/hrms/recruit/applications/${docRequestApp.app.id}/documents/${docRequestApp.bundle}`, {
        documentTypeIds: Array.from(docRequestSelected),
        submissionDeadline: docRequestDeadline ? new Date(docRequestDeadline).toISOString() : null,
      });
    },
    onSuccess: () => {
      // Requesting documents only sends the request — it must NOT move the
      // candidate to another stage (that previously tripped the stage-feedback
      // guard and produced a confusing "feedback required" error).
      invalidateAll();
      setDocRequestApp(null);
      setDocRequestSelected(new Set());
      setDocRequestDeadline("");
    },
  });

  const openDocRequest = (app: ApplicationItem, bundle: "PreOffer" | "PostOffer") => {
    setDocRequestApp({ app, bundle });
    setDocRequestSelected(new Set());
    setDocRequestDeadline("");
  };

  // In-modal reminder — re-sends the reminder email for the CURRENT bundle
  // (the card button hardcodes PostOffer; this respects the open bundle).
  const remindDocModalMut = useMutation({
    mutationFn: () => {
      if (!docRequestApp) throw new Error("No application selected");
      return api.post<{ reminderCount: number; mailed: boolean; pendingDocs: string[]; mailError?: string }>(
        `/api/v1/hrms/recruit/applications/${docRequestApp.app.id}/documents/${docRequestApp.bundle}/remind`, {},
      );
    },
    onSuccess: () => {
      refetchDocBundle();
      invalidateAll();
    },
  });

  // Pre-check documents when the modal opens: existing selection (re-request) if
  // present, else all previously-requested, else the required defaults.
  useEffect(() => {
    if (!docRequestApp) return;
    if (docTypesForBundle.length === 0) return;
    if (docBundleStatus === undefined) return; // wait for the existing-request lookup
    if (docRequestSelected.size > 0) return;
    const sel = existingReq && Array.isArray(existingReq.selectedDocTypeIds) ? existingReq.selectedDocTypeIds : null;
    if (existingReq && sel && sel.length) {
      setDocRequestSelected(new Set(sel));
    } else if (existingReq && !sel) {
      setDocRequestSelected(new Set(docTypesForBundle.map((d) => d.id)));
    } else {
      setDocRequestSelected(new Set(docTypesForBundle.filter((d) => d.isRequired).map((d) => d.id)));
    }
  }, [docRequestApp, docTypesForBundle, docBundleStatus, existingReq, docRequestSelected.size]);

  // Prime the deadline field from an existing request (only while still empty).
  useEffect(() => {
    if (!docRequestApp || !existingReq?.submissionDeadline) return;
    setDocRequestDeadline((cur) => cur || new Date(existingReq.submissionDeadline!).toISOString().slice(0, 10));
  }, [docRequestApp, existingReq]);

  const scheduleMut = useMutation({
    mutationFn: () => {
      if (!scheduleApp) throw new Error("No application selected");
      const round = STAGES.indexOf(scheduleApp.stage) + 1;
      return api.post("/api/v1/hrms/recruit/interviews", {
        applicationId: scheduleApp.app.id,
        round,
        type: schedule.type,
        interviewerId: schedule.interviewerIds[0],
        additionalInterviewerIds: schedule.interviewerIds.slice(1),
        scheduledAt: new Date(schedule.scheduledAt).toISOString(),
        duration: schedule.duration ?? 60,
        location: schedule.location || undefined,
        meetingLink: schedule.meetingLink || undefined,
      });
    },
    onSuccess: (res) => {
      invalidateAll();
      const link = (res as { data?: { meetingLink?: string | null } }).data?.meetingLink ?? null;
      // Keep the dialog open showing the link (auto-generated Teams links are
      // only known after the response). User closes via Done.
      setScheduleResult({ meetingLink: link, type: schedule.type });
    },
  });

  // Accept / Decline — records stage feedback first, then flips the offer status
  // (OfferAccepted → AppHired, OfferDeclined → AppDeclined). Same flow the old
  // Offers page used.
  const offerDecisionMut = useMutation({
    mutationFn: async ({ app, kind, body }: { app: ApplicationItem; kind: "accept" | "decline"; body: typeof offerFb }) => {
      await api.post(`/api/v1/hrms/recruit/applications/${app.id}/stage-feedback`, body);
      await api.patch(`/api/v1/hrms/recruit/offers/${app.id}`, {
        status: kind === "accept" ? "OfferAccepted" : "OfferDeclined",
      });
    },
    onSuccess: (_res, vars) => {
      invalidateAll();
      toast.success(vars.kind === "accept" ? "Offer accepted" : "Offer declined");
      setOfferDecision(null);
      setOfferFb(emptyOfferFb);
    },
  });

  // Re-send the pending post-offer document request reminder email.
  const remindMut = useMutation({
    mutationFn: (app: ApplicationItem) =>
      api.post<{ reminderCount: number; mailed: boolean; pendingDocs: string[]; mailError?: string }>(
        `/api/v1/hrms/recruit/applications/${app.id}/documents/PostOffer/remind`, {},
      ),
    onSuccess: () => {
      invalidateAll();
    },
  });

  const allApps = data?.data ?? [];

  const requisitionOpts = Array.from(
    new Map(allApps.map((a) => [a.requisition.id, a.requisition])).values(),
  ).map((r) => ({ value: r.id, label: `${r.title} · ${r.requisitionNumber}` }));

  const nq = nameQuery.trim().toLowerCase();
  const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;

  const apps = allApps.filter((a) => {
    if (nq) {
      const hay = `${a.candidate.firstName} ${a.candidate.lastName} ${a.candidate.email}`.toLowerCase();
      if (!hay.includes(nq)) return false;
    }
    if (stageFilters.size > 0 && !(a.currentStage && stageFilters.has(a.currentStage))) return false;
    if (requisitionFilters.size > 0 && !requisitionFilters.has(a.requisition.id)) return false;
    if (fromTs !== null || toTs !== null) {
      const ts = a.appliedDate ? new Date(a.appliedDate).getTime() : null;
      if (ts === null) return false;
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }
    return true;
  });

  // Flat, human-readable rows for the styled .xlsx export — same filtered set
  // the CSV export uses.
  const excelRows = apps.map((a) => ({
    candidate: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
    email: a.candidate.email,
    requisition: a.requisition.title,
    stage: (a.currentStage ?? "").replace(/([A-Z])/g, " $1").trim(),
    status: (a.status ?? "").replace(/^App/, "").replace(/([A-Z])/g, " $1").trim(),
    applied: a.appliedDate
      ? new Date(a.appliedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "",
  }));

  // Candidates on requisitions that use a DIFFERENT pipeline have stages not in
  // the default pipeline's STAGES. Append those extra stages as trailing columns
  // so every candidate stays visible (previously they were dropped from the board).
  const extraStages = Array.from(
    new Set(allApps.map((a) => a.currentStage).filter((s): s is string => !!s && !STAGES.includes(s))),
  );
  const displayStages = [...STAGES, ...extraStages];

  const visibleStages = stageFilters.size > 0 ? displayStages.filter((s) => stageFilters.has(s)) : displayStages;

  const groupedByStage = visibleStages.reduce<Record<string, ApplicationItem[]>>((acc, stage) => {
    acc[stage] = apps.filter((a) => a.currentStage === stage);
    return acc;
  }, {});

  const filtersActive = !!(nameQuery || stageFilters.size > 0 || requisitionFilters.size > 0 || dateFrom || dateTo);
  const clearFilters = () => {
    setNameQuery(""); setStageFilters(new Set()); setRequisitionFilters(new Set());
    setDateFrom(""); setDateTo("");
  };

  const exportCsv = () => {
    if (apps.length === 0) {
      toast.warning("Nothing to export", "No applications match current filters.");
      return;
    }
    const headers = [
      "Candidate Name", "Email", "Phone", "Location", "Source",
      "Current Company", "Current Designation", "Experience (yrs)", "Notice Period (days)",
      "Current CTC", "Expected CTC", "Skills", "LinkedIn", "Portfolio", "Resume URL",
      "Requisition #", "Requisition Title", "Current Stage",
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
      a.candidate.location ?? "",
      a.candidate.source ?? "",
      a.candidate.currentCompany ?? "",
      a.candidate.currentDesignation ?? "",
      a.candidate.totalExperience ? (a.candidate.totalExperience / 12).toFixed(1) : "",
      a.candidate.noticePeriod ?? "",
      a.candidate.currentCTC ?? "",
      a.candidate.expectedCTC ?? "",
      Array.isArray(a.candidate.skills) ? a.candidate.skills.join(", ") : "",
      a.candidate.linkedinUrl ?? "",
      a.candidate.portfolioUrl ?? "",
      a.candidate.resumeUrl ?? "",
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
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-page-title text-gray-900">Hiring pipeline</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-white overflow-hidden shadow-sm">
            <button
              onClick={() => setViewMode("kanban")}
              className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition",
                viewMode === "kanban"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50")}
              title="Kanban view"
            >
              <LayoutGrid size={13} /> Kanban
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-gray-300 transition",
                viewMode === "list"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50")}
              title="List view"
            >
              <List size={13} /> List
            </button>
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
            title="Download filtered applications as CSV (opens in Excel)"
          >
            <Download size={13} /> Export CSV ({apps.length})
          </button>
          <ExcelExportButton
            filename="pipeline"
            sheetName="Pipeline"
            columns={PIPELINE_EXCEL_COLUMNS}
            rows={excelRows}
            label={`Export Excel (${apps.length})`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm disabled:opacity-50"
          />
          <span className="text-xs text-gray-500 ml-2">
            {apps.length} of {allApps.length}
          </span>
        </div>
      </div>

      {/* Stat cards — Total + per-stage counts; click to filter by stage. */}
      {allApps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-4">
          <StatCard label="Total Candidates" value={allApps.length} icon={<Users size={16} />} color="bg-green-50 text-green-600"
            active={stageFilters.size === 0} onClick={() => setStageFilters(new Set())} />
          {STAGES.map((stage) => {
            const value = allApps.filter((a) => (a.currentStage ?? STAGES[0]) === stage).length;
            const meta = stageMeta(stage);
            return (
              <StatCard key={stage} label={prettyStage(stage)} value={value} icon={meta.icon} color={meta.color}
                active={stageFilters.has(stage)} onClick={() => toggleStage(stage)} />
            );
          })}
        </div>
      )}

      {/* Compact filter bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:bg-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500/20"
          />
        </div>
        {requisitionOpts.length > 0 && (
          <Select
            value=""
            onChange={(v) => { if (v) toggleRequisition(v); }}
            size="sm"
            className="w-52 shrink-0"
            placeholder="+ Requisition"
            options={requisitionOpts.filter((r) => !requisitionFilters.has(r.value)).map((r) => ({ value: r.value, label: r.label }))}
          />
        )}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="Applied from"
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="Applied to"
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto px-2 py-1 text-[11px] text-[#22c55e] hover:underline font-medium">Clear all</button>
        )}
      </div>

      {/* Active requisition chips */}
      {requisitionFilters.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {requisitionOpts.filter((r) => requisitionFilters.has(r.value)).map((r) => (
            <span key={r.value} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 ring-1 ring-green-200 rounded-full text-[11px] font-semibold">
              {r.label}
              <button onClick={() => toggleRequisition(r.value)} className="text-green-400 hover:text-green-700">×</button>
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : viewMode === "list" ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-table-head font-semibold text-slate-600 uppercase tracking-wide">
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
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#86efac] text-[#16a34a] flex items-center justify-center text-[11px] font-bold shrink-0">
                          {(app.candidate.firstName[0] ?? "") + (app.candidate.lastName[0] ?? "")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/recruit/candidates/${app.candidate.id}`} className="font-semibold text-slate-900 truncate hover:text-green-700 hover:underline">{app.candidate.firstName} {app.candidate.lastName}</Link>
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
                          : "bg-[#dcfce7] text-[#16a34a] ring-[#22c55e]",
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
                          // #4 — at the Offer stage, feedback is blocked until offer details are filled.
                          const needsOffer = /offer/i.test(app.currentStage ?? "") && !app.latestOffer;
                          // Feedback stays locked until the interview's start time.
                          const locked = !pending && feedbackNotYet(app);
                          const disabled = needsOffer || locked;
                          return (
                            <button
                              onClick={() => openAction(app)}
                              disabled={disabled}
                              className={clsx(
                                "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ring-1",
                                disabled
                                  ? "bg-slate-50 text-slate-400 ring-slate-200 cursor-not-allowed"
                                  : pending
                                    ? "bg-[#dcfce7] text-[#16a34a] ring-[#22c55e] hover:bg-[#bbf7d0]"
                                    : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
                              )}
                              title={needsOffer ? "Fill the offer details first" : locked ? "Feedback opens at the interview start time" : pending ? "Schedule interview" : "Give feedback"}
                            >
                              {pending ? <><CalendarPlus size={10} /> Schedule</> : <><Star size={10} /> Feedback</>}
                            </button>
                          );
                        })()}
                        {!isHired && isInterviewStage(app.currentStage ?? "") && canMoveForward(app.currentStage) && (
                          <button
                            onClick={() => { setFeedback({ ...BLANK_FEEDBACK }); setSkipTarget(getNextStage(app.currentStage) ?? ""); setSkipApp(app); prefillFeedback(app).then(setFeedback); }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 rounded text-[11px] font-semibold"
                            title="Move forward to a later stage">
                            <SkipForward size={10} /> Skip
                          </button>
                        )}
                        {!isHired && canMoveForward(app.currentStage) && (
                          <button
                            onClick={() => {
                              if ((app._count.scorecards ?? 0) === 0) {
                                toast.warning("Feedback required", `Provide feedback for "${stageName}" before moving to the next stage.`);
                                setFeedback({ overallRating: 7, recommendation: "", strengths: "", concerns: "", overallComments: "" });
                                setFeedbackApp(app);
                                return;
                              }
                              moveMut.mutate({ id: app.id, stage: STAGES[si + 1] });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#bbf7d0] hover:bg-[#dcfce7] rounded text-[11px] font-semibold" title="Next stage">
                            <ArrowRight size={10} /> Next
                          </button>
                        )}
                        {showScreening(app) && (
                          <button onClick={() => setScreeningApp(app)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100 rounded text-[11px] font-semibold" title="Screening questions">
                            <ClipboardList size={10} /> Screening
                          </button>
                        )}
                        {showQuestions(app) && (
                          <button onClick={() => setQuestionsApp(app)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 rounded text-[11px] font-semibold" title="Technical interview questions">
                            <HelpCircle size={10} /> Questions
                          </button>
                        )}
                        <button onClick={() => setHistoryApp(app)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100 rounded text-[11px] font-semibold" title="Feedback history">
                          <Clock size={10} /> History
                        </button>
                        {isHired ? (
                          <button onClick={() => onboardMut.mutate(app.id)} disabled={onboardMut.isPending}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded text-[11px] font-semibold shadow-sm disabled:opacity-50">
                            <UserPlus size={10} /> Onboard
                          </button>
                        ) : (
                          <button onClick={() => { setRejectReason(""); setRejectApp(app); }}
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
            const list = groupedByStage[stage] ?? [];
            return (
            <div key={stage} className={clsx("flex-shrink-0 w-64 rounded-xl border border-gray-200 border-t-4 bg-white shadow-sm flex flex-col max-h-[calc(100vh-300px)]", stageBorder(stage))}>
              <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
                <h3 className="font-semibold text-[13px] text-gray-900 flex items-center gap-1.5">
                  <span className={clsx("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", stageMeta(stage).color)}>{stageMeta(stage).icon}</span>
                  {prettyStage(stage)}
                  {mailOn && <Mail size={11} className="text-emerald-600" aria-label="Auto-mail on" />}
                </h3>
                <span className="text-[11px] font-semibold bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-3 py-10 text-gray-400">
                  <Users size={22} className="mb-2 opacity-50" />
                  <p className="text-[12px] font-medium text-gray-500">No candidates</p>
                  <p className="text-[11px]">in this stage</p>
                </div>
              ) : (
              <StageScroll count={list.length}>
                {list.map((app) => (
                  <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-2.5 shadow-sm space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-emerald-700 uppercase">
                        {`${app.candidate.firstName?.[0] ?? ""}${app.candidate.lastName?.[0] ?? ""}` || <User size={15} className="text-emerald-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/recruit/candidates/${app.candidate.id}`} className="text-[13px] font-semibold text-gray-900 truncate hover:text-green-700 hover:underline">{app.candidate.firstName} {app.candidate.lastName}</Link>
                          <AtsBadge score={app.aiMatchScore ? Number(app.aiMatchScore) : null} verdict={app.aiMatchAnalysis?.verdict} title={app.aiMatchAnalysis?.summary ?? undefined} />
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{app.requisition.title}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {app.status === "AppOnHold" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                          <Clock size={10} /> On Hold
                        </span>
                      )}
                      {app.avgRating != null && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                          title={`Average of ${app._count.scorecards} feedback${app._count.scorecards === 1 ? "" : "s"}`}
                        >
                          {app.avgRating}/10
                        </span>
                      )}
                      {app.latestInterview && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200">
                          <Calendar size={10} />
                          {new Date(app.latestInterview.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {app.latestInterview.status.replace("Int", "")}
                        </span>
                      )}
                      {app.latestOffer && app.latestOffer.status !== "OfferDraft" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          <FileCheck size={10} /> {app.latestOffer.status.replace("Offer", "")} · ₹{(Number(app.latestOffer.offeredCTC) / 100000).toFixed(1)}L
                        </span>
                      )}
                    </div>

                    {stage === "Hired" ? (
                      <button onClick={() => onboardMut.mutate(app.id)} disabled={onboardMut.isPending}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-medium shadow-sm disabled:opacity-50">
                        <UserPlus size={13} /> {onboardMut.isPending ? "Onboarding..." : "Onboard"}
                      </button>
                    ) : /offer/i.test(stage) ? (() => {
                      // Offer-stage lifecycle — the full flow relocated from the old
                      // /recruit/offers page: create → send → accept/decline.
                      const o = app.latestOffer;
                      if (!o || o.status === "OfferDraft") {
                        return (
                          <button onClick={() => setOfferWizardApp(app)}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white">
                            <Send size={13} /> Send Offer
                          </button>
                        );
                      }
                      if (o.status === "OfferSent") {
                        return (
                          <div className="grid grid-cols-2 gap-1.5">
                            <button onClick={() => { if (app.docGate?.blocking) { setDocBlockApp(app); return; } setOfferFb({ ...emptyOfferFb, recommendation: "Hire" }); setOfferDecision({ app, kind: "accept" }); }}
                              title={app.docGate?.blocking ? "Approve all requested documents before accepting the offer" : "Accept the offer"}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white">
                              <Check size={13} /> Accept
                            </button>
                            <button onClick={() => { setOfferFb({ ...emptyOfferFb, recommendation: "NoHire" }); setOfferDecision({ app, kind: "decline" }); }}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition bg-red-50/60 text-red-600 ring-1 ring-red-200 hover:bg-red-50">
                              <X size={13} /> Reject
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle size={13} /> Offer {o.status.replace("Offer", "")}
                        </div>
                      );
                    })() : (() => {
                      const pending = isPendingSchedule(app);
                      const advance = !pending && readyForOffer(app);
                      const locked = !pending && !advance && feedbackNotYet(app);
                      const done = !pending && !advance && !locked && feedbackGiven(app);
                      const disabled = locked;
                      if (advance) {
                        const next = getNextStage(app.currentStage) ?? "Offer";
                        return (
                          <button onClick={() => { if (app.docGate?.blocking) { setDocBlockApp(app); return; } moveMut.mutate({ id: app.id, stage: next }); }} disabled={moveMut.isPending}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white disabled:opacity-50"
                            title={app.docGate?.blocking ? "Approve all requested documents before moving to Offer" : `Move candidate to ${next}`}>
                            <ArrowRight size={13} /> {moveMut.isPending ? "Moving..." : `Move to ${next.replace(/([A-Z])/g, " $1").trim()}`}
                          </button>
                        );
                      }
                      return (
                        <button onClick={() => done ? setHistoryApp(app) : openAction(app)} disabled={disabled}
                          className={clsx("w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm transition",
                            disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white")}
                          title={locked ? "Feedback opens at the interview start time" : pending ? "Schedule interview" : done ? "View submitted feedback" : "Give feedback"}>
                          {pending ? <><CalendarPlus size={13} /> Schedule Interview</> : locked ? <><Clock size={13} /> Feedback locked</> : done ? <><CheckCircle size={13} /> View Feedback</> : <><Star size={13} /> Give Feedback</>}
                        </button>
                      );
                    })()}

                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setHistoryApp(app)} title="Feedback history"
                        className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-green-50 hover:text-green-600 hover:ring-green-200 rounded-lg transition">
                        <Clock size={12} />
                      </button>
                      {showScreening(app) && (
                        <button onClick={() => setScreeningApp(app)} title="Screening questions"
                          className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-teal-50 hover:text-teal-600 hover:ring-teal-200 rounded-lg transition">
                          <ClipboardList size={12} />
                        </button>
                      )}
                      {showQuestions(app) && (
                        <button onClick={() => setQuestionsApp(app)} title="Technical interview questions"
                          className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:ring-indigo-200 rounded-lg transition">
                          <HelpCircle size={12} />
                        </button>
                      )}
                      {stage !== "Hired" && isInterviewStage(app.currentStage ?? "") && canMoveForward(app.currentStage) && (
                        <button onClick={() => { setFeedback({ ...BLANK_FEEDBACK }); setSkipTarget(getNextStage(app.currentStage) ?? ""); setSkipApp(app); prefillFeedback(app).then(setFeedback); }} title="Skip / move forward"
                          className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-green-50 hover:text-[#16a34a] hover:ring-[#bbf7d0] rounded-lg transition">
                          <SkipForward size={12} />
                        </button>
                      )}
                      {app.docRequest?.status !== "Completed" && (
                        <button onClick={() => openDocRequest(app, /offer/i.test(stage) ? "PreOffer" : "PostOffer")} title="Request documents"
                          className="inline-flex items-center justify-center w-8 h-8 bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-violet-50 hover:text-violet-600 hover:ring-violet-200 rounded-lg transition">
                          <FileText size={12} />
                        </button>
                      )}
                      {/offer/i.test(stage) && app.docRequest?.status === "Pending" && (() => {
                        const cd = reminderCooldownRemaining(app.docRequest.lastReminderAt);
                        const onCd = cd > 0;
                        const h = Math.ceil(cd / 3600000);
                        return (
                          <button onClick={() => toast.promise(remindMut.mutateAsync(app), { loading: "Sending reminder…", success: "Reminder sent", error: "Couldn't send reminder" })} disabled={remindMut.isPending || onCd}
                            title={onCd ? `Reminded recently — try again in ~${h}h` : `Send document reminder${app.docRequest.reminderCount ? ` (sent ${app.docRequest.reminderCount}×)` : ""}`}
                            className="inline-flex items-center justify-center w-8 h-8 bg-white text-amber-600 ring-1 ring-amber-200 hover:bg-amber-50 hover:ring-amber-300 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                            <BellRing size={12} />
                          </button>
                        );
                      })()}
                      {/offer/i.test(stage) && app.docRequest?.status === "Completed" && (
                        <span title="Documents received"
                          className="inline-flex items-center justify-center w-8 h-8 bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 rounded-lg">
                          <Check size={12} />
                        </span>
                      )}
                    </div>

                    {stage === "Hired" && app.status === "AppHired" && (
                      <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                        <CheckCircle size={11} /> Onboarding started
                      </div>
                    )}
                  </div>
                ))}
              </StageScroll>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Full stage list — overflow from a capped Kanban column */}
      {/* Reject candidate — capture a reason before rejecting */}
      <Modal open={!!rejectApp} onClose={() => !rejectMut.isPending && setRejectApp(null)} title="Reject candidate" size="md">
        {rejectApp && (
          <form
            onSubmit={(e) => { e.preventDefault(); rejectMut.mutate({ id: rejectApp.id, reason: rejectReason.trim() }); }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 rounded-xl bg-red-50 ring-1 ring-red-200 px-4 py-3">
              <X size={18} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-800">
                You&apos;re about to reject <span className="font-semibold">{rejectApp.candidate.firstName} {rejectApp.candidate.lastName}</span>.
                They&apos;ll be removed from the active pipeline.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for rejection <span className="text-red-500">*</span></label>
              <textarea
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="e.g. Skills not a match for the role, salary expectations too high…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setRejectApp(null)} disabled={rejectMut.isPending}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={rejectMut.isPending || !rejectReason.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50">
                <X size={13} /> {rejectMut.isPending ? "Rejecting…" : "Reject candidate"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Skip to a later stage (Move forward) */}
      {/* Documents-not-approved gate — blocks moving to Offer */}
      <Modal open={!!docBlockApp} onClose={() => setDocBlockApp(null)} title="Documents not approved yet" size="md">
        {docBlockApp && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
              <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">{docBlockApp.candidate.firstName} {docBlockApp.candidate.lastName}</span> still has
                requested documents awaiting review. All requested documents must be <span className="font-semibold">approved</span> before you can proceed.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Still pending approval</p>
              <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                {(docBlockApp.docGate?.pending ?? []).map((name, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-slate-700">
                    <FileText size={14} className="text-slate-400 shrink-0" /> {name}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500">
              Review the candidate’s uploads (Approve / Reject) from the candidate’s Documents tab, then try again.
            </p>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDocBlockApp(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-sm">
                Got it
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!skipApp} onClose={() => !skipMut.isPending && setSkipApp(null)} title="Move Candidate Forward" size="lg" bodyClassName="p-4 overflow-hidden flex flex-col">
        {skipApp && (() => {
          const curStage = skipApp.currentStage ?? STAGES[0];
          const curIdx = STAGES.indexOf(curStage);
          // A manual move can advance at most to the Offer stage — "Hired" is
          // only reachable through the offer-accept flow, never a direct jump.
          const forwardStages = (curIdx >= 0 ? STAGES.slice(curIdx + 1) : []).filter((s) => s !== "Hired");
          const targetIdx = STAGES.indexOf(skipTarget);
          const steps = targetIdx >= 0 && curIdx >= 0 ? targetIdx - curIdx : 0;
          return (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!skipTarget || steps < 1) { toast.error("Select a stage to move forward to"); return; }
              skipMut.mutate({
                id: skipApp.id,
                target: skipTarget,
                openScheduler: isInterviewStage(skipTarget),
                body: { overallRating: feedback.overallRating, strengths: feedback.strengths, concerns: feedback.concerns, overallComments: feedback.overallComments },
              });
            }}
            className="flex flex-col min-h-0 flex-1"
          >
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4">
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <div className="w-11 h-11 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold uppercase shrink-0">
                  {`${skipApp.candidate.firstName?.[0] ?? ""}${skipApp.candidate.lastName?.[0] ?? ""}`}
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-slate-900 truncate">{skipApp.candidate.firstName} {skipApp.candidate.lastName}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{skipApp.requisition.title}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#22c55e] font-semibold">
                      <MessageSquare size={10} /> Stage: {curStage.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-2">
                  Overall Rating <span className="text-gray-400 font-normal">(out of 10)</span>
                  <Info size={13} className="text-gray-300" />
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" onClick={() => setFeedback({ ...feedback, overallRating: n })}
                      className={clsx("w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition",
                        n === feedback.overallRating ? "border-amber-400 bg-amber-400 text-white"
                          : n < feedback.overallRating ? "border-amber-300 bg-amber-50 text-amber-600"
                            : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                      {n}
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-bold text-slate-800">{feedback.overallRating}/10</span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1"><ArrowRight size={14} className="text-[#16a34a]" /> Move forward to <span className="text-red-500">*</span></label>
                <Select
                  value={skipTarget}
                  onChange={setSkipTarget}
                  placeholder="Select a stage..."
                  options={forwardStages.map((s) => ({ value: s, label: s.replace(/([A-Z])/g, " $1").trim() }))}
                />
                <p className="text-[11px] text-gray-500 mt-1">Only forward stages — you can&apos;t move a candidate backward. An interview stage opens the scheduler.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 inline-flex items-center justify-center"><ThumbsUp size={12} /></span>
                    Strengths
                  </label>
                  <div className="relative">
                    <textarea rows={4} maxLength={500} placeholder="What did the candidate do well?" value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 pb-6 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                    <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">{feedback.strengths.length}/500</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 inline-flex items-center justify-center"><AlertTriangle size={12} /></span>
                    Concerns
                  </label>
                  <div className="relative">
                    <textarea rows={4} maxLength={500} placeholder="What are the areas of concern?" value={feedback.concerns} onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 pb-6 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                    <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">{feedback.concerns.length}/500</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 inline-flex items-center justify-center"><MessageSquare size={12} /></span>
                  Overall Comments
                </label>
                <div className="relative">
                  <textarea rows={3} maxLength={1000} placeholder="Reason for moving forward / additional comments…" value={feedback.overallComments} onChange={(e) => setFeedback({ ...feedback, overallComments: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 pb-6 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">{feedback.overallComments.length}/1000</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 mt-1 border-t border-gray-100">
              <button type="button" onClick={() => setSkipApp(null)} disabled={skipMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={skipMut.isPending || !skipTarget}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                <SkipForward size={13} /> {skipMut.isPending ? "Moving..." : "Move Forward"}
              </button>
            </div>
          </form>
          );
        })()}
      </Modal>

      <Modal open={!!feedbackApp} onClose={() => setFeedbackApp(null)} title="Stage Feedback" size="lg" bodyClassName="p-4 overflow-hidden flex flex-col">
        {feedbackApp && (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!feedback.recommendation) return toast.error("Recommendation required");
            const nextStage = getNextStage(feedbackApp.currentStage);
            const deferStageMove = feedback.recommendation === "Hire" && !!nextStage && isInterviewStage(nextStage);
            feedbackMut.mutate({ id: feedbackApp.id, body: { ...feedback, deferStageMove } });
          }} className="flex flex-col min-h-0 flex-1">
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4">
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <div className="w-11 h-11 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold uppercase shrink-0">
                {`${feedbackApp.candidate.firstName?.[0] ?? ""}${feedbackApp.candidate.lastName?.[0] ?? ""}`}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-slate-900 truncate">{feedbackApp.candidate.firstName} {feedbackApp.candidate.lastName}</div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{feedbackApp.requisition.title}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#22c55e] font-semibold">
                    <MessageSquare size={10} />
                    Stage: {(feedbackApp.currentStage ?? "Screening").replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-2">
                Overall Rating <span className="text-gray-400 font-normal">(out of 10)</span>
                <Info size={13} className="text-gray-300" />
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => setFeedback({ ...feedback, overallRating: n })}
                    className={clsx("w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition",
                      n === feedback.overallRating
                        ? "border-amber-400 bg-amber-400 text-white"
                        : n < feedback.overallRating
                          ? "border-amber-300 bg-amber-50 text-amber-600"
                          : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                    {n}
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-slate-800">{feedback.overallRating}/10</span>
                {(() => {
                  const r = feedback.overallRating;
                  const m = r >= 9 ? { l: "Excellent", c: "bg-emerald-100 text-emerald-700" }
                    : r >= 7 ? { l: "Good", c: "bg-green-100 text-green-700" }
                    : r >= 5 ? { l: "Average", c: "bg-amber-100 text-amber-700" }
                    : r >= 3 ? { l: "Below Avg", c: "bg-orange-100 text-orange-700" }
                    : { l: "Poor", c: "bg-red-100 text-red-700" };
                  return <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-semibold", m.c)}>{m.l}</span>;
                })()}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1"><Award size={14} className="text-[#16a34a]" /> Recommendation</label>
              {(() => {
                const nextStage = getNextStage(feedbackApp.currentStage);
                const nextLabel = nextStage ? nextStage.replace(/([A-Z])/g, " $1").trim() : "next stage";
                const nextIsInterview = isInterviewStage(nextStage);
                const opts = [
                  { value: "",          label: "Select recommendation…", description: "Required to save feedback" },
                  { value: "Hire",      label: "Approve",  description: nextIsInterview ? `Good fit — schedule ${nextLabel}` : `Good fit — move to ${nextLabel}` },
                  { value: "MaybeHire", label: "On Hold",  description: "Move to Archive — restore anytime" },
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 inline-flex items-center justify-center"><ThumbsUp size={12} /></span>
                  Strengths
                </label>
                <div className="relative">
                  <textarea rows={4} maxLength={500} placeholder="What did the candidate do well?" value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 pb-6 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">{feedback.strengths.length}/500</span>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 inline-flex items-center justify-center"><AlertTriangle size={12} /></span>
                  Concerns
                </label>
                <div className="relative">
                  <textarea rows={4} maxLength={500} placeholder="What are the areas of concern?" value={feedback.concerns} onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 pb-6 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">{feedback.concerns.length}/500</span>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1.5">
                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 inline-flex items-center justify-center"><MessageSquare size={12} /></span>
                Overall Comments
              </label>
              <div className="relative">
                <textarea rows={3} maxLength={1000} placeholder="Add any additional comments about the candidate…" value={feedback.overallComments} onChange={(e) => setFeedback({ ...feedback, overallComments: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 pb-6 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-green-500" />
                <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">{feedback.overallComments.length}/1000</span>
              </div>
            </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 mt-1 border-t border-gray-100">
              <button type="button" onClick={() => setFeedbackApp(null)} disabled={feedbackMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={feedbackMut.isPending || !feedback.recommendation}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Save size={13} /> {feedbackMut.isPending ? "Saving..." : "Save Feedback"}
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
        maxWidthClass="ds-modal-wide"
        maxHeightClass="max-h-[80vh]"
        bodyClassName="p-4 overflow-y-auto"
      >
        {docRequestApp && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (docRequestSelected.size === 0) return toast.error("Select at least one document");
              toast.promise(docRequestMut.mutateAsync(), {
                loading: alreadyRequested ? "Updating request…" : "Emailing documents request…",
                success: alreadyRequested ? "Request updated" : "Request sent",
                error: "Couldn't send request",
              });
            }}
            className="space-y-3"
          >
            {(() => {
              const requiredTypes = docTypesForBundle.filter((d) => d.isRequired);
              const allOn = docTypesForBundle.length > 0 && docRequestSelected.size === docTypesForBundle.length;
              const requiredOnlyOn = !allOn && requiredTypes.length > 0
                && docRequestSelected.size === requiredTypes.length
                && requiredTypes.every((d) => docRequestSelected.has(d.id));
              const noneOn = docRequestSelected.size === 0;
              const tabCls = (active: boolean) => clsx(
                "pb-1 font-semibold border-b-2 transition",
                active ? "text-violet-600 border-violet-600" : "text-slate-400 border-transparent hover:text-slate-600");
              return (
                <>
                  <div className="flex items-center gap-3 rounded-xl bg-violet-50/70 ring-1 ring-violet-100 px-3 py-2.5">
                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-violet-600" />
                    </div>
                    <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-slate-900 truncate">
                        {docRequestApp.app.candidate.firstName} {docRequestApp.app.candidate.lastName}
                      </span>
                      <span className="text-[11px] font-semibold text-violet-600 shrink-0">
                        {docRequestApp.bundle === "PreOffer" ? "Before Offer" : "After Offer"} bundle
                      </span>
                      <span className="text-[11px] text-slate-500 truncate">
                        {docRequestApp.app.requisition.title} · {docRequestApp.app.candidate.email}
                      </span>
                    </div>
                  </div>

                  {alreadyRequested && (
                    <div className="flex items-center gap-2 rounded-lg bg-blue-50 ring-1 ring-blue-100 px-3 py-2 text-xs text-blue-700">
                      <Clock size={14} className="shrink-0" />
                      <span>Requested {relativeTime(existingReq!.requestSentAt)} · <strong>{receivedCount}/{docTypesForBundle.length}</strong> received</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-sm font-medium text-gray-700 shrink-0">Submission deadline <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      required
                      value={docRequestDeadline}
                      min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
                      onChange={(e) => setDocRequestDeadline(e.target.value)}
                      className="h-10 w-[200px] border border-[var(--border)] rounded-[14px] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <span className="text-[11px] text-gray-500">Shown to the candidate on the upload page &amp; email.</span>
                  </div>

                  <div className="flex items-end justify-between">
                    <p className="text-[13px] font-semibold text-slate-800">{alreadyRequested ? "Request more documents" : "Select documents to request"}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <button type="button"
                        onClick={() => setDocRequestSelected(new Set(docTypesForBundle.map((d) => d.id)))}
                        className={tabCls(allOn)}>All</button>
                      <button type="button"
                        onClick={() => setDocRequestSelected(new Set(requiredTypes.map((d) => d.id)))}
                        className={tabCls(requiredOnlyOn)}>Required only</button>
                      <button type="button"
                        onClick={() => setDocRequestSelected(new Set())}
                        className={tabCls(noneOn)}>None</button>
                    </div>
                  </div>

                  {docTypesForBundle.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">Loading doc list…</div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {docTypesForBundle.map((d) => {
                        const on = docRequestSelected.has(d.id);
                        return (
                          <label key={d.id} className={clsx(
                            "flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-[14px] border cursor-pointer transition",
                            on ? "border-violet-300 bg-violet-50/50" : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300")}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                const next = new Set(docRequestSelected);
                                if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                                setDocRequestSelected(next);
                              }}
                              className="sr-only"
                            />
                            <span className={clsx(
                              "w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 transition",
                              on ? "bg-violet-600 ring-1 ring-violet-600" : "bg-white ring-1 ring-slate-300")}>
                              {on && <Check size={11} strokeWidth={3.5} className="text-white" />}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800" title={d.name}>{d.name}</span>
                            <span className={clsx(
                              "shrink-0 inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-semibold leading-none",
                              d.isRequired ? "bg-red-50 text-red-600 ring-1 ring-red-100" : "bg-slate-100 text-slate-500")}>
                              {d.isRequired ? "Required" : "Optional"}
                            </span>
                            {d.helpText && (
                              <span
                                title={d.helpText}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                className="shrink-0 text-slate-300 hover:text-slate-500 transition cursor-help">
                                <Info size={14} />
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-[14px] px-3 py-2 text-[11px] text-amber-800">
                    <Clock size={13} className="text-amber-500 shrink-0" />
                    <span>Candidate gets a <span className="font-semibold">secure link</span> valid 7 days · auto-reminds at 24h / 48h / 72h.</span>
                  </div>
                </>
              );
            })()}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <div>
                {alreadyRequested && existingReq!.status === "Pending" && (() => {
                  const cd = reminderCooldownRemaining(existingReq!.lastReminderAt);
                  const onCd = cd > 0;
                  const h = Math.ceil(cd / 3600000);
                  return (
                    <button type="button" onClick={() => toast.promise(remindDocModalMut.mutateAsync(), { loading: "Sending reminder…", success: "Reminder sent", error: "Couldn't send reminder" })}
                      disabled={remindDocModalMut.isPending || onCd}
                      title={onCd ? `Reminded recently — try again in ~${h}h` : "Re-send a reminder for documents already requested"}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed">
                      <BellRing size={13} /> {remindDocModalMut.isPending ? "Sending…" : "Send Reminder"}
                    </button>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDocRequestApp(null)} disabled={docRequestMut.isPending}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={docRequestMut.isPending || docRequestSelected.size === 0 || !docRequestDeadline}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                  <Mail size={13} /> {docRequestMut.isPending
                    ? (alreadyRequested ? "Updating…" : "Sending…")
                    : alreadyRequested ? `Update Request (${docRequestSelected.size})` : `Send Request (${docRequestSelected.size})`}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Schedule Interview Modal — opens after Approve when next stage is interview */}
      <Modal open={!!scheduleApp} onClose={() => { if (!scheduleMut.isPending) { setScheduleApp(null); setScheduleResult(null); } }} title="Schedule Interview" size="lg">
        {scheduleApp && !scheduleResult && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (schedule.interviewerIds.length === 0) return toast.error("Select at least one interviewer");
              if (!schedule.scheduledAt) return toast.error("Date & time required");
              if (schedule.type === "InPerson" && !schedule.location) return toast.error("Location required for in-person");
              toast.promise(scheduleMut.mutateAsync(), { loading: "Sending interview invite…", success: "Invite sent", error: "Couldn't send invite" });
            }}
            className="space-y-4"
          >
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Interviewers *</label>
                <Select
                  value=""
                  onChange={(v) => { if (v && !schedule.interviewerIds.includes(v)) setSchedule({ ...schedule, interviewerIds: [...schedule.interviewerIds, v] }); }}
                  options={[{ value: "", label: "Add interviewer…" },
                    ...scheduleInterviewerChoices
                      .filter((e) => !schedule.interviewerIds.includes(e.id))
                      .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, description: e.jobTitle ?? undefined })),
                  ]}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  {schedulePanelEmps.length > 0 ? "Showing this role's interview panel." : "Pick one or more interviewers."}
                </p>
              </div>
            </div>

            <div>
              {schedule.interviewerIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {schedule.interviewerIds.map((id, idx) => {
                    const emp = scheduleInterviewerChoices.find((e) => e.id === id);
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : id;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 text-xs font-medium pl-2.5 pr-1 py-1 ring-1 ring-green-200">
                        {name}
                        {idx === 0 && <span className="text-[10px] font-semibold text-green-500">· Primary</span>}
                        <button
                          type="button"
                          onClick={() => setSchedule({ ...schedule, interviewerIds: schedule.interviewerIds.filter((x) => x !== id) })}
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-green-500 hover:bg-green-100"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">No interviewers selected yet — add at least one above.</p>
              )}
              <p className="mt-1 text-[11px] text-gray-400">
                The first interviewer is the primary (submits feedback); everyone receives the same invite email &amp; calendar entry.
              </p>
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
                    let v = e.target.value;
                    const minLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    if (v && v < minLocal) {
                      v = minLocal;
                      toast.error("Cannot schedule in the past", "Reset to the earliest allowed time.");
                    }
                    setSchedule({ ...schedule, scheduledAt: v });
                  }}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
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
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            {(schedule.type === "Video" || schedule.type === "Panel") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"><Link2 size={12} /> Meeting Link</label>
                <input
                  type="url"
                  placeholder="Leave blank to auto-generate a Microsoft Teams link"
                  value={schedule.meetingLink}
                  onChange={(e) => setSchedule({ ...schedule, meetingLink: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">Leave blank and we&apos;ll create a Teams meeting automatically. Paste your own (Meet/Zoom/Teams) to override.</p>
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
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            )}

            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Stage will move to <strong>{scheduleApp.stage.replace(/([A-Z])/g, " $1").trim()}</strong> only after interview is scheduled. Closing this dialog keeps candidate at current stage.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="submit" disabled={scheduleMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                <CalendarPlus size={13} /> {scheduleMut.isPending ? "Scheduling..." : "Schedule Interview"}
              </button>
            </div>
          </form>
        )}

        {scheduleApp && scheduleResult && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle size={14} /> Interview scheduled
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Invite emails have been queued to {scheduleApp.app.candidate.firstName} {scheduleApp.app.candidate.lastName} and the interviewer.
              </div>
            </div>

            {(scheduleResult.type === "Video" || scheduleResult.type === "Panel") && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5"><Link2 size={12} /> Meeting Link</label>
              {scheduleResult.meetingLink ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={scheduleResult.meetingLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard?.writeText(scheduleResult.meetingLink!); toast.success("Copied", "Meeting link copied to clipboard"); }}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                    title="Copy link"
                  >
                    <Copy size={13} /> Copy
                  </button>
                  <a
                    href={scheduleResult.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                    title="Open link"
                  >
                    <ExternalLink size={13} /> Open
                  </a>
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  No meeting link was generated — Teams may not be configured. You can add a link later from the Interviews page.
                </p>
              )}
            </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { setScheduleApp(null); setScheduleResult(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm">
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Move / Edit Stage Modal */}
      <Modal open={!!moveApp} onClose={() => setMoveApp(null)} title="Edit Stage">
        {moveApp && (
          <form onSubmit={(e) => { e.preventDefault(); moveMut.mutate({ id: moveApp.id, stage: moveTarget }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
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
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={moveMut.isPending || moveTarget === moveApp.currentStage}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                {moveMut.isPending ? "Moving..." : "Move"}
              </button>
            </div>
          </form>
        )}
      </Modal>


      {/* Accept / Decline — stage feedback then offer status flip (relocated from Offers page) */}
      <Modal open={!!offerDecision} onClose={() => !offerDecisionMut.isPending && setOfferDecision(null)} title="Stage Feedback" size="lg" bodyClassName="p-4 overflow-hidden flex flex-col">
        {offerDecision && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!offerFb.recommendation) return toast.error("Recommendation required");
              offerDecisionMut.mutate({ app: offerDecision.app, kind: offerDecision.kind, body: offerFb });
            }}
            className="flex flex-col min-h-0 flex-1"
          >
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs">
              <div className="font-semibold text-slate-900">
                {offerDecision.app.candidate.firstName} {offerDecision.app.candidate.lastName}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{offerDecision.app.requisition.title}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#22c55e] font-semibold">
                  <MessageSquare size={10} /> Stage: Offer
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Overall Rating <span className="text-gray-400 font-normal">(out of 10)</span></label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => setOfferFb({ ...offerFb, overallRating: n })}
                    className={clsx("w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition",
                      n <= offerFb.overallRating ? "border-amber-400 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                    {n}
                  </button>
                ))}
                <span className="ml-2 text-sm font-semibold text-slate-700">{offerFb.overallRating}/10</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recommendation</label>
              <Select
                value={offerFb.recommendation}
                onChange={(v) => setOfferFb({ ...offerFb, recommendation: v })}
                options={[
                  { value: "", label: "Select recommendation…" },
                  { value: "Hire", label: "Approve — candidate accepted" },
                  { value: "MaybeHire", label: "On Hold — move to Archive" },
                  { value: "NoHire", label: "Reject — candidate declined / withdrew" },
                ]}
              />
              <p className="mt-1 text-[11px] text-gray-400">Pre-filled based on your action — change if the situation differs.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
                <textarea rows={3} value={offerFb.strengths} onChange={(e) => setOfferFb({ ...offerFb, strengths: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concerns</label>
                <textarea rows={3} value={offerFb.concerns} onChange={(e) => setOfferFb({ ...offerFb, concerns: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall Comments</label>
              <textarea rows={3} value={offerFb.overallComments} onChange={(e) => setOfferFb({ ...offerFb, overallComments: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 mt-1 border-t border-gray-100">
              <button type="button" onClick={() => setOfferDecision(null)} disabled={offerDecisionMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={offerDecisionMut.isPending || !offerFb.recommendation}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 bg-gradient-to-r",
                  offerDecision.kind === "accept"
                    ? "from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                    : "from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700")}>
                {offerDecisionMut.isPending ? "Saving..." : offerDecision.kind === "accept" ? <><Check size={13} /> Save & Accept</> : <><X size={13} /> Save & Decline</>}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {offerWizardApp && (
        <SendOfferWizard
          app={offerWizardApp}
          onClose={() => setOfferWizardApp(null)}
          onSent={() => setOfferWizardApp(null)}
        />
      )}

      {historyApp && (
        <FeedbackHistoryModal app={historyApp} onClose={() => setHistoryApp(null)} />
      )}

      <Modal open={!!questionsApp} onClose={() => setQuestionsApp(null)} title="Technical Questions" size="md">
        {questionsApp && (
          <div>
            <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{questionsApp.candidate.firstName} {questionsApp.candidate.lastName}</span>
              <span>·</span>
              <span>{questionsApp.requisition.title}</span>
              {questionsApp.currentStage && (<><span>·</span><span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">{questionsApp.currentStage}</span></>)}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Suggested questions for the interviewer — from the job requisition.</p>
            <ol className="list-decimal pl-5 space-y-1.5">
              {(questionsApp.requisition.technicalQuestions ?? []).map((q, i) => (
                <li key={i} className="text-sm text-slate-700 leading-relaxed">{q}</li>
              ))}
            </ol>
          </div>
        )}
      </Modal>

      <Modal open={!!screeningApp} onClose={() => setScreeningApp(null)} title="Screening Questions" size="md">
        {screeningApp && (
          <div>
            <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{screeningApp.candidate.firstName} {screeningApp.candidate.lastName}</span>
              <span>·</span>
              <span>{screeningApp.requisition.title}</span>
              <span>·</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-semibold">Screening</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Ask these on the screening call.</p>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 list-none">
              {SCREENING_CHECKLIST.map((q, i) => (
                <li key={q.key} className="flex items-start gap-2 text-[13px] text-slate-700 leading-snug">
                  <span className="mt-0.5 text-[11px] font-semibold text-teal-600 shrink-0 w-4 text-right">{i + 1}.</span>
                  <span>
                    {q.question}
                    {q.hint && <span className="block text-[11px] text-slate-400">({q.hint})</span>}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
              <button type="button" onClick={() => setScreeningApp(null)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </div>
        )}
      </Modal>
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
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs">
          <div className="font-semibold text-slate-900">{app.candidate.firstName} {app.candidate.lastName}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
            <span>{app.requisition.title}</span>
            <span>·</span>
            <span>{app.candidate.email}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#22c55e] font-semibold">
              Current: {(res?.currentStage ?? app.currentStage ?? "—").replace(/([A-Z])/g, " $1").trim()}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-xs text-slate-500">Loading feedback history...</div>
        ) : !res || res.history.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
            <MessageSquare size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-700">No feedback yet</p>
            <p className="text-xs text-slate-500 mt-1">Submit stage feedback to see it here.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {res.history.map((h) => {
              const rec = REC_META[h.recommendation];
              return (
                <div key={h.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#86efac] text-[#16a34a] flex items-center justify-center text-sm font-bold shrink-0">
                      {h.interviewer.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-slate-900 truncate">{h.interviewer.name}</p>
                        {h.interviewer.jobTitle && (
                          <span className="text-xs text-slate-500">· {h.interviewer.jobTitle}</span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">{h.interviewer.employeeCode}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#16a34a] ring-1 ring-[#22c55e]">
                          {h.stage.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1", rec.cls)}>
                          {rec.icon} {rec.label}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600 font-semibold">
                          <Star size={11} className="fill-current" /> {h.overallRating}/10
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
                    {h.interview.duration > 0 && h.interview.scheduledAt && (
                      <span>· Scheduled: {new Date(h.interview.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Pipeline stat cards + stage visuals ────────────────
function prettyStage(stage: string): string {
  return stage === "HRInterview" ? "HR Interview" : stage.replace(/([A-Z])/g, " $1").trim();
}

function stageMeta(stage: string): { icon: React.ReactNode; color: string } {
  const key = stage.replace(/\s+/g, "").toLowerCase();
  if (key === "screening") return { icon: <Search size={16} />, color: "bg-green-50 text-green-600" };
  if (key === "phonescreen") return { icon: <Phone size={16} />, color: "bg-purple-50 text-purple-600" };
  if (key === "technicalinterview") return { icon: <Video size={16} />, color: "bg-amber-50 text-amber-600" };
  if (key === "managerinterview") return { icon: <Briefcase size={16} />, color: "bg-rose-50 text-rose-600" };
  if (key === "hrinterview") return { icon: <Users size={16} />, color: "bg-sky-50 text-sky-600" };
  if (key === "offer") return { icon: <FileText size={16} />, color: "bg-green-50 text-green-600" };
  if (key === "hired") return { icon: <Award size={16} />, color: "bg-green-50 text-green-600" };
  return { icon: <User size={16} />, color: "bg-gray-50 text-gray-500" };
}

function stageBorder(stage: string): string {
  const key = stage.replace(/\s+/g, "").toLowerCase();
  const map: Record<string, string> = {
    screening: "border-t-green-400", phonescreen: "border-t-purple-400", technicalinterview: "border-t-amber-400",
    managerinterview: "border-t-rose-400", hrinterview: "border-t-sky-400", offer: "border-t-green-400", hired: "border-t-green-500",
  };
  return map[key] ?? "border-t-gray-300";
}

function StatCard({ label, value, icon, color, active, onClick }: {
  label: string; value: number; icon: React.ReactNode; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={clsx("flex items-center gap-2.5 bg-white rounded-2xl border p-3 text-left transition shadow-sm hover:shadow",
        active ? "border-green-500 ring-1 ring-green-500/30" : "border-gray-200 hover:border-gray-300")}>
      <span className={clsx("w-9 h-9 rounded-full flex items-center justify-center shrink-0", color)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-bold text-gray-900 leading-none">{value}</span>
        <span className="block text-[11px] text-gray-500 truncate mt-0.5">{label}</span>
      </span>
    </button>
  );
}
