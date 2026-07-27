"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { ArrowLeft, CheckCircle, Clock, PauseCircle, SkipForward, Check, Trophy, X, AlertTriangle, Upload, Paperclip, Shield, BadgeCheck, Plus, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp, Banknote, Send, UserCog, FileText, Play, Pause, CalendarClock } from "lucide-react";
import { BankDetailsFields } from "@/components/hrms/bank-details-fields";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { todayInput } from "@/lib/utils/date-input";
import { withBasePath } from "@/lib/utils/base-path";
import { EMAIL_EVENT_MAP } from "@/lib/email/registry";

type TaskStatus = "TaskPending" | "TaskInProgress" | "TaskCompleted" | "TaskSkipped" | "TaskBlocked";

// Friendly labels + a one-line settings summary for workflow step types carried
// from the onboarding template onto the live task.
const STEP_TYPE_LABEL: Record<string, string> = {
  CustomTask: "Custom Task", CompleteProfile: "Complete Profile", DocumentUpload: "Document Upload", SendEmail: "Send Email", Approval: "Approval",
  FillForm: "Fill Form", ESign: "E-Sign", ReadPolicy: "Policy / Training", Training: "Policy / Training",
  BGV: "Background Verification", Clearance: "Admin / Facilities",
  ITProvisioning: "IT Provisioning", AssetAssignment: "Asset Assignment", Notification: "Notification", ExternalLink: "External Link",
};
function stepSummary(stepType?: string | null, config?: Record<string, unknown> | null): string | null {
  if (!stepType || !config) return null;
  const g = (k: string) => { const v = config[k]; return v != null && v !== "" ? String(v) : null; };
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || null;
  switch (stepType) {
    case "SendEmail": {
      const keys = Array.isArray(config.templates) ? (config.templates as string[]).filter(Boolean) : (config.template ? [String(config.template)] : []);
      if (!keys.length) return null;
      const names = keys.map((k) => (k === "onboarding.joining-letter" ? "Joining Letter" : EMAIL_EVENT_MAP[k]?.label ?? k));
      return `${keys.length} email${keys.length === 1 ? "" : "s"}: ${names.join(" · ")}`;
    }
    case "Approval": return join(g("approver") && `Approver: ${g("approver")}`, g("autoApprove") && `Auto-approve: ${g("autoApprove")}`);
    case "DocumentUpload": return join(g("allowedTypes") && `Types: ${g("allowedTypes")}`, g("maxSize") && `Max: ${g("maxSize")}`);
    case "AssetAssignment": {
      const list = Array.isArray(config.assets) ? (config.assets as { type: string; qty?: number; custom?: string }[]) : [];
      if (list.length) return list.map((a) => `${a.type === "Custom" ? (a.custom?.trim() || "Custom") : a.type} ×${a.qty || 1}`).join(", ");
      return join(g("asset") && `Asset: ${g("asset")}`, g("quantity") && `Qty: ${g("quantity")}`);
    }
    case "Training": return join(g("course") && `Course: ${g("course")}`, g("duration") && `Duration: ${g("duration")}`);
    case "ReadPolicy": { const n = Array.isArray(config.files) ? config.files.length : 0; return n ? `${n} file${n === 1 ? "" : "s"} to acknowledge` : null; }
    case "ITProvisioning": {
      const list = Array.isArray(config.systems) ? (config.systems as string[]) : [];
      const other = typeof config.otherSystems === "string" ? config.otherSystems.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const all = [...list, ...other];
      if (all.length) return `Access: ${all.join(", ")}`;
      return join(g("system") && `Access: ${g("system")}`, g("owner") && `Owner: ${g("owner")}`);
    }
    case "Notification": return g("message") && `Message: ${g("message")}`;
    default: return null;
  }
}

type DocCategory = "OfferLetter" | "Policy" | "IdProof" | "Certificate" | "Contract" | "AppointmentLetter" | "ExperienceLetter" | "RelievingLetter" | "NDA" | "Other";

const DOC_CATEGORIES: DocCategory[] = ["OfferLetter", "Policy", "IdProof", "Certificate", "Contract", "AppointmentLetter", "ExperienceLetter", "RelievingLetter", "NDA", "Other"];

function guessCategory(title: string): DocCategory {
  const t = title.toLowerCase();
  if (t.includes("id proof") || t.includes("pan") || t.includes("aadhaar")) return "IdProof";
  if (t.includes("offer letter")) return "OfferLetter";
  if (t.includes("appointment")) return "AppointmentLetter";
  if (t.includes("certificate")) return "Certificate";
  if (t.includes("nda")) return "NDA";
  if (t.includes("contract")) return "Contract";
  if (t.includes("policy")) return "Policy";
  return "Other";
}

// Mirrors the server's isSendableStep — a step automation can email out.
function sendableStep(stepType?: string | null, config?: Record<string, unknown> | null): boolean {
  const st = stepType ?? "CustomTask";
  const cfg = config ?? {};
  if (st === "DocumentUpload") return Array.isArray(cfg.documents) && (cfg.documents as unknown[]).filter(Boolean).length > 0;
  if (st === "ReadPolicy") return Array.isArray(cfg.files) && (cfg.files as unknown[]).length > 0;
  if (st === "SendEmail") return (Array.isArray(cfg.templates) && (cfg.templates as unknown[]).filter(Boolean).length > 0) || !!cfg.template;
  if (["CustomTask", "AssetAssignment", "ITProvisioning"].includes(st)) {
    const ids = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : (cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : []);
    return ids.length > 0;
  }
  return false;
}

interface Task {
  id: string; title: string; description: string | null; assigneeId: string | null; assigneeRole: string;
  category: string; dueDate: string | null; status: TaskStatus; completedAt: string | null; notes: string | null;
  stepType?: string | null; config?: Record<string, unknown> | null;
  sortOrder: number; isMandatory: boolean;
}

interface Instance {
  id: string; employeeId: string; startDate: string; status: string; completedAt: string | null;
  notes: string | null; progress: number; totalTasks: number; completedTasks: number;
  automated?: boolean; phase?: string;
  tasks: Task[]; template: { id: string; name: string } | null;
  employee: {
    id: string; firstName: string | null; lastName: string | null; employeeCode: string | null;
    jobTitle: string | null; dateOfJoining: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
    reportingManager: { firstName: string; lastName: string } | null;
  } | null;
}

export default function OnboardingTrackerPage({ params }: { params: { employeeId: string } }) {
  const { employeeId } = params;
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { employee: meEmp, hasPermission } = useDashboardConfig();
  // Self-view: the employee is looking at their own onboarding page. Hide
  // tasks assigned to other roles (IT/HR/Manager) — they can't act on those.
  const isSelfView = meEmp?.id === employeeId;
  const isAdminViewer = hasPermission("hrms.employee.write") || hasPermission("hrms.rbac.manage");
  const [confirmComplete, setConfirmComplete] = useState<{ force: boolean; pending: number } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [uploadTask, setUploadTask] = useState<Task | null>(null);
  const [uploadForm, setUploadForm] = useState({ title: "", fileUrl: "", fileType: "application/pdf", fileSize: 0, category: "Other" as DocCategory });
  const [uploadMode, setUploadMode] = useState<"local" | "url">("local");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bankTask, setBankTask] = useState<Task | null>(null);
  const [bankForm, setBankForm] = useState({ bankName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "" });
  const [bankError, setBankError] = useState<string | null>(null);
  const [profileTask, setProfileTask] = useState<Task | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", employeeId],
    queryFn: () => api.get<Instance>(`/api/v1/hrms/onboarding/${employeeId}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api.put(`/api/v1/hrms/onboarding/tasks/${taskId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }),
  });

  // "Send now" for Send Email / Notification steps — sends the email, then marks
  // the step In Progress (NOT complete) so the button disables/persists. A failed
  // send throws before the status update, so the step stays Pending for a retry.
  const sendEmailMut = useMutation({
    mutationFn: (taskId: string) => api.post<{ sent: number }>(`/api/v1/hrms/onboarding/tasks/${taskId}/send-emails`, {}),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success(`${r.data.sent} email${r.data.sent === 1 ? "" : "s"} sent`, "This step is now complete."); },
    onError: (e: unknown) => toast.error("Couldn't send emails", e instanceof Error ? e.message : undefined),
  });

  // Per-step deadline (due date) — set/clear on the checklist.
  const dueDateMut = useMutation({
    mutationFn: ({ taskId, dueDate }: { taskId: string; dueDate: string | null }) => api.put(`/api/v1/hrms/onboarding/tasks/${taskId}`, { dueDate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }),
    onError: (e: unknown) => toast.error("Couldn't set deadline", e instanceof Error ? e.message : undefined),
  });

  // "Start onboarding" — completion-chained automation on/off.
  const automationMut = useMutation({
    mutationFn: (enabled: boolean) => api.post(`/api/v1/hrms/onboarding/${employeeId}/start-automation`, { enabled }),
    onSuccess: (_r, enabled) => {
      qc.invalidateQueries({ queryKey: ["onboarding", employeeId] });
      toast.success(enabled ? "Automation started" : "Automation stopped",
        enabled ? "The first step's request has been sent. Each step now triggers the next." : undefined);
    },
    onError: (e: unknown) => toast.error("Couldn't update automation", e instanceof Error ? e.message : undefined),
  });

  // Apply a template to an onboarding started without one (only the auto Complete Profile step).
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const instPhase = data?.data?.phase ?? "Onboarding";
  const { data: tplData } = useQuery({
    queryKey: ["onboarding", "templates", "active", instPhase],
    queryFn: () => api.get<Array<{ id: string; name: string }>>(`/api/v1/hrms/onboarding/templates?kind=${instPhase === "PreOnboarding" ? "PreOnboarding" : "Onboarding"}&limit=100`),
  });
  const onbTemplates = tplData?.data ?? [];
  const applyTemplateMut = useMutation({
    mutationFn: (templateId: string) => api.post(`/api/v1/hrms/onboarding/${employeeId}/apply-template`, { templateId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Template applied", "The checklist has been populated."); },
    onError: (e: unknown) => toast.error("Couldn't apply template", e instanceof Error ? e.message : undefined),
  });
  // Re-apply: rebuild the checklist from the latest version of the template.
  const reApplyMut = useMutation({
    mutationFn: (templateId: string) => api.post(`/api/v1/hrms/onboarding/${employeeId}/apply-template`, { templateId, replace: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Template re-applied", "The checklist was rebuilt from the latest template."); },
    onError: (e: unknown) => toast.error("Couldn't re-apply template", e instanceof Error ? e.message : undefined),
  });

  // Pre-Onboarding: set a BGV check status, and move to Onboarding when ready.
  const bgvMut = useMutation({
    mutationFn: (v: { taskId: string; check: string; status: "clear" | "discrepancy" | "pending" }) =>
      api.post(`/api/v1/hrms/onboarding/tasks/${v.taskId}/bgv`, { check: v.check, status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }),
    onError: (e: unknown) => toast.error("Couldn't update BGV", e instanceof Error ? e.message : undefined),
  });
  const toOnboardingMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/onboarding/${employeeId}/to-onboarding`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Moved to Onboarding", "Day-1 checklist has begun."); },
    onError: (e: unknown) => toast.error("Can't move yet", e instanceof Error ? e.message : undefined),
  });

  // Document Upload step — email the candidate a secure upload link.
  const docRequestMut = useMutation({
    mutationFn: (taskId: string) => api.post(`/api/v1/hrms/onboarding/tasks/${taskId}/doc-request`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Request sent", "The candidate has been emailed an upload link."); },
    onError: (e: unknown) => toast.error("Couldn't send request", e instanceof Error ? e.message : undefined),
  });

  // Policy / Training step — email the candidate a secure read-&-acknowledge link.
  const ackRequestMut = useMutation({
    mutationFn: (taskId: string) => api.post(`/api/v1/hrms/onboarding/tasks/${taskId}/ack-request`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Request sent", "The candidate has been emailed an acknowledgement link."); },
    onError: (e: unknown) => toast.error("Couldn't send request", e instanceof Error ? e.message : undefined),
  });

  // Staff-assigned steps (Custom Task / Asset / IT) — email the assignee(s) a
  // one-click "Mark as done" link, on demand.
  const notifyAssigneesMut = useMutation({
    mutationFn: (taskId: string) => api.post(`/api/v1/hrms/onboarding/tasks/${taskId}/notify-assignees`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Sent", "The assignee(s) have been emailed."); },
    onError: (e: unknown) => toast.error("Couldn't send", e instanceof Error ? e.message : undefined),
  });

  // HR reviews the candidate's uploaded documents (approve / reject).
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const docReviewMut = useMutation({
    mutationFn: (v: { taskId: string; docName: string; action: "approve" | "reject"; reason?: string }) =>
      api.post(`/api/v1/hrms/onboarding/tasks/${v.taskId}/doc-review`, { docName: v.docName, action: v.action, reason: v.reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); },
    onError: (e: unknown) => toast.error("Review failed", e instanceof Error ? e.message : undefined),
  });

  const completeMut = useMutation({
    mutationFn: (force: boolean) => api.post(`/api/v1/hrms/onboarding/${employeeId}/complete${force ? "?force=true" : ""}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", employeeId] });
      setConfirmComplete(null);
    },
  });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/hrms/onboarding/${employeeId}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", employeeId] });
      setConfirmCancel(false);
      setCancelReason("");
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (taskId: string) => {
      let fileUrl = uploadForm.fileUrl;
      let fileType = uploadForm.fileType;
      let fileSize = uploadForm.fileSize;

      if (uploadMode === "local") {
        if (!selectedFile) throw new Error("Select a file");
        const fd = new FormData();
        fd.append("file", selectedFile);
        const res = await api.upload<{ url: string; fileType: string; fileSize: number }>(
          "/api/v1/hrms/uploads", fd,
        );
        fileUrl = res.data.url;
        fileType = res.data.fileType;
        fileSize = res.data.fileSize;
      }
      if (!fileUrl) throw new Error("File URL required");

      await api.post("/api/v1/hrms/documents", {
        title: uploadForm.title,
        fileUrl,
        fileType,
        fileSize,
        category: uploadForm.category,
        status: "Active",
        employeeId,
      });
      await api.put(`/api/v1/hrms/onboarding/tasks/${taskId}`, { status: "TaskCompleted" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", employeeId] });
      setUploadTask(null);
      setSelectedFile(null);
      setUploadError(null);
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setUploadError(e.message),
  });

  const openUpload = (t: Task) => {
    setUploadTask(t);
    setUploadForm({ title: t.title, fileUrl: "", fileType: "application/pdf", fileSize: 0, category: guessCategory(t.title) });
    setSelectedFile(null);
    setUploadMode("local");
    setUploadError(null);
  };

  const isBankTask = (title: string) => /\bbank\b|account number|ifsc|salary account/i.test(title);

  const openBank = async (t: Task) => {
    setBankError(null);
    try {
      const res = await api.get<{ bankAccounts?: Array<{ bankName?: string; accountNumber?: string; ifscCode?: string; branchName?: string; isPrimary?: boolean }> }>(`/api/v1/hrms/employees/${employeeId}`);
      const b = (res.data?.bankAccounts ?? []).find((x) => x?.isPrimary) ?? res.data?.bankAccounts?.[0];
      setBankForm({
        bankName: b?.bankName ?? "",
        bankAccountNumber: b?.accountNumber ?? "",
        bankIfsc: b?.ifscCode ?? "",
        bankBranch: b?.branchName ?? "",
      });
    } catch {
      setBankForm({ bankName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "" });
    }
    setBankTask(t);
  };

  const bankSubmitMut = useMutation({
    mutationFn: async (taskId: string) => {
      if (!bankForm.bankName.trim() || !bankForm.bankAccountNumber.trim()) {
        throw new Error("Bank Name and Account Number required");
      }
      await api.patch(`/api/v1/hrms/employees/${employeeId}`, {
        bankAccounts: [{
          bankName: bankForm.bankName.trim(),
          accountNumber: bankForm.bankAccountNumber.trim(),
          ifscCode: bankForm.bankIfsc.trim() || undefined,
          branchName: bankForm.bankBranch.trim() || undefined,
          isPrimary: true,
        }],
      });
      await api.put(`/api/v1/hrms/onboarding/tasks/${taskId}`, { status: "TaskCompleted" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", employeeId] });
      setBankTask(null);
      setBankError(null);
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setBankError(e.message),
  });

  if (isLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="55%" h={12} />
    </div>
  );
  const inst = data?.data;
  if (!inst) return <div className="p-8 text-center text-gray-500">No onboarding found</div>;

  // Count of mandatory tasks that haven't been completed/skipped. Drives both
  // the "Force Complete" button label and the Confirm Employment gate.
  const pendingMandatoryCount = inst.tasks.filter(
    (t) => t.isMandatory && t.status !== "TaskCompleted" && t.status !== "TaskSkipped",
  ).length;

  // The step automation would send next — used to label the rest as "Queued".
  const firstPendingSendableId = inst.tasks.find(
    (t) => sendableStep(t.stepType, t.config) && t.status !== "TaskCompleted" && t.status !== "TaskSkipped",
  )?.id ?? null;
  const canEditDue = (!isSelfView || isAdminViewer) && inst.status !== "OnboardCompleted" && inst.status !== "OnboardCancelled";

  // Pre-Onboarding gate: all steps done + BGV fully Clear → can move to Onboarding.
  const isPreOnboarding = inst.phase === "PreOnboarding";
  const bgvTask = inst.tasks.find((t) => t.stepType === "BGV");
  const bgvClear = (() => {
    if (!bgvTask) return true;
    const cfg = (bgvTask.config ?? {}) as Record<string, unknown>;
    const checks = Array.isArray(cfg.bgvChecks) ? (cfg.bgvChecks as string[]) : [];
    const st = (cfg.bgvStatus ?? {}) as Record<string, string>;
    return checks.length === 0 || checks.every((c) => st[c] === "clear");
  })();
  const preAllDone = inst.tasks.every((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped");
  const canMoveToOnboarding = isPreOnboarding && preAllDone && bgvClear;

  const employeeName =
    `${inst.employee?.firstName ?? ""} ${inst.employee?.lastName ?? ""}`.trim() ||
    inst.employee?.employeeCode ||
    inst.employeeId;

  const emp = inst.employee;
  const initials = `${emp?.firstName?.[0] ?? ""}${emp?.lastName?.[0] ?? ""}`.toUpperCase() || employeeName.slice(0, 2).toUpperCase();
  const roleLine = [emp?.designation?.title ?? emp?.jobTitle, emp?.department?.name].filter(Boolean).join(" · ");
  const managerName = emp?.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}`.trim() : "—";
  const fmtDate = (dt?: string | null) => (dt ? new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  const total = inst.totalTasks, completed = inst.completedTasks, pending = Math.max(0, total - completed);
  const todayD = new Date(new Date().toDateString());
  const overdue = inst.tasks.filter((t) => {
    const done = t.status === "TaskCompleted" || t.status === "TaskSkipped";
    return !!t.dueDate && !done && new Date(t.dueDate.slice(0, 10)) < todayD;
  }).length;
  const R = 34, C = 2 * Math.PI * R, ringOffset = C * (1 - inst.progress / 100);

  return (
    <div className="w-full pb-10">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <Link href={isPreOnboarding ? "/pre-onboarding" : "/onboarding"} className="inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline mb-4">
        <ArrowLeft size={14} /> {isPreOnboarding ? "Back to Pre-Onboarding" : "Back to dashboard"}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-14 w-14 rounded-2xl grid place-items-center text-lg font-bold text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}>{initials}</div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{employeeName}</h1>
                  <p className="text-xs text-gray-500 truncate">{roleLine || (isPreOnboarding ? "Pre-Onboarding" : "Employee")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
            {isPreOnboarding && <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">Pre-Onboarding</span>}
            <span className={clsx("px-3 py-1 rounded-full text-[11px] font-medium",
              inst.status === "OnboardCompleted" ? "bg-green-100 text-green-700" :
              inst.status === "OnboardCancelled" ? "bg-red-100 text-red-700" :
              inst.status === "InProgress" ? "bg-[#dcfce7] text-[#16a34a]" : "bg-gray-100 text-gray-600")}>
              {inst.status}
            </span>
            {isPreOnboarding && (!isSelfView || isAdminViewer) && (
              <button onClick={() => toOnboardingMut.mutate()} disabled={!canMoveToOnboarding || toOnboardingMut.isPending}
                title={canMoveToOnboarding ? "Convert to Day-1 onboarding" : "Finish all steps and clear BGV first"}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                {toOnboardingMut.isPending ? "Moving…" : "Move to Onboarding →"}
              </button>
            )}
            <button
              onClick={() => window.open(withBasePath(`/api/v1/hrms/onboarding/${employeeId}/joining-letter`), "_blank", "noopener")}
              title="Open the joining (appointment) letter as a PDF"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
              <FileText size={13} /> Joining Letter
            </button>
            {/* Admin-only controls — employee self-view doesn't see Complete /
                Force Complete / Cancel. They just upload tasks; HR closes the loop. */}
            {(!isSelfView || isAdminViewer) && inst.status !== "OnboardCompleted" && inst.status !== "OnboardCancelled" && (
              <button
                onClick={() => automationMut.mutate(!inst.automated)}
                disabled={automationMut.isPending}
                title={inst.automated ? "Stop auto-sending steps" : "Send step 1 now and auto-send each next step as the previous completes"}
                className={clsx("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50",
                  inst.automated ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700")}>
                {inst.automated ? <><Pause size={13} /> Stop automation</> : <><Play size={13} /> Start onboarding</>}
              </button>
            )}
            {(!isSelfView || isAdminViewer) && inst.status !== "OnboardCompleted" && inst.status !== "OnboardCancelled" && (() => {
              const pendingMandatory = inst.tasks.filter((t) => t.isMandatory && t.status !== "TaskCompleted" && t.status !== "TaskSkipped").length;
              const allDone = pendingMandatory === 0;
              return (
                <>
                  <button
                    onClick={() => setConfirmComplete({ force: !allDone, pending: pendingMandatory })}
                    disabled={completeMut.isPending}
                    className={clsx("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50",
                      allDone ? "bg-green-600 text-white hover:bg-green-700" : "bg-yellow-100 text-yellow-700 border border-yellow-300 hover:bg-yellow-200")}>
                    {allDone ? <><Trophy size={13} /> Complete Onboarding</> : <><Check size={13} /> Force Complete ({pendingMandatory} pending)</>}
                  </button>
                  <button
                    onClick={() => { setCancelReason(""); setConfirmCancel(true); }}
                    disabled={cancelMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 disabled:opacity-50">
                    <X size={13} /> Cancel
                  </button>
                </>
              );
            })()}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden border border-gray-100 bg-gray-100">
              {[
                { label: "Employee ID", value: emp?.employeeCode ?? "—" },
                { label: "Department", value: emp?.department?.name ?? "—" },
                { label: "Reporting Manager", value: managerName },
                { label: "Start Date", value: fmtDate(inst.startDate) },
                { label: "Joining Date", value: fmtDate(emp?.dateOfJoining) },
              ].map((m) => (
                <div key={m.label} className="bg-white px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div>
                  <div className="text-xs font-medium text-gray-900 mt-0.5 truncate" title={m.value}>{m.value}</div>
                </div>
              ))}
            </div>

            {inst.template && (
              <div className="mt-3 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                <span><span className="font-medium text-gray-600">Template:</span> {inst.template.name}</span>
                {(!isSelfView || isAdminViewer) && inst.status !== "OnboardCompleted" && inst.status !== "OnboardCancelled" && (
                  <button
                    onClick={() => {
                      if (window.confirm("Re-apply the latest template?\n\nThis rebuilds the checklist from the current template — existing template steps (and their progress/uploads) are replaced. The BGV / Complete Profile step is kept.")) {
                        reApplyMut.mutate(inst.template!.id);
                      }
                    }}
                    disabled={reApplyMut.isPending}
                    title="Rebuild the checklist from the latest version of this template"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-green-700 border border-green-200 hover:bg-green-50 disabled:opacity-50">
                    {reApplyMut.isPending ? "Re-applying…" : "Re-apply template"}
                  </button>
                )}
              </div>
            )}

            {inst.automated && inst.status !== "OnboardCompleted" && inst.status !== "OnboardCancelled" && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 text-[#166534] px-3 py-2 text-xs">
                <Sparkles size={14} /> <span><b>Automation running.</b> Each step&apos;s request is sent automatically when the previous step is completed.</span>
              </div>
            )}
          </div>

          <div className={clsx("grid gap-4 items-stretch", (!isSelfView && isAdminViewer) ? "md:grid-cols-2" : "grid-cols-1")}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center">
            <div className="flex items-center gap-5 flex-wrap w-full">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-gray-900">{isPreOnboarding ? "Pre-Onboarding Progress" : "Onboarding Progress"}</span>
                  <span className="text-xs font-semibold text-gray-900 tabular-nums">{completed}/{total} <span className="text-gray-400">({inst.progress}%)</span></span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-500" style={{ width: `${inst.progress}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {[
                  { label: "Completed", value: completed, cls: "bg-green-50 text-green-700 border-green-100" },
                  { label: "Pending", value: pending, cls: "bg-amber-50 text-amber-700 border-amber-100" },
                  { label: "Overdue", value: overdue, cls: "bg-red-50 text-red-700 border-red-100" },
                ].map((s) => (
                  <div key={s.label} className={clsx("rounded-xl border px-4 py-2 text-center min-w-[76px]", s.cls)}>
                    <div className="text-lg font-bold tabular-nums leading-tight">{s.value}</div>
                    <div className="text-[10px] font-medium">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ConfirmationPanel employeeId={employeeId} pendingMandatory={pendingMandatoryCount} />
          </div>

      {(!isSelfView || isAdminViewer) && !inst.tasks.some((t) => t.stepType !== "CompleteProfile" && t.stepType !== "BGV")
        && inst.status !== "OnboardCompleted" && inst.status !== "OnboardCancelled" && (
        <div className="bg-white rounded-lg shadow-sm border border-dashed border-gray-300 p-4 mb-3">
          <div className="text-[13px] font-semibold text-gray-900 mb-1">No {isPreOnboarding ? "pre-onboarding" : "onboarding"} template applied</div>
          <p className="text-xs text-gray-500 mb-3">
            {isPreOnboarding
              ? "Pick a pre-onboarding template to populate the checklist (BGV is always included)."
              : "This onboarding was started without a template. Pick one to populate the checklist."}
          </p>
          {onbTemplates.length === 0 ? (
            <Link href={isPreOnboarding ? "/pre-onboarding/templates" : "/onboarding/templates"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700">
              <Plus size={13} /> Create a {isPreOnboarding ? "pre-onboarding" : "onboarding"} template
            </Link>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="min-w-[240px]">
                <Select size="sm" value={applyTemplateId} onChange={setApplyTemplateId}
                  placeholder="Choose a template…"
                  options={[{ value: "", label: "Choose a template…" }, ...onbTemplates.map((t) => ({ value: t.id, label: t.name }))]} />
              </div>
              <button onClick={() => applyTemplateMut.mutate(applyTemplateId)} disabled={!applyTemplateId || applyTemplateMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60">
                {applyTemplateMut.isPending ? "Applying…" : "Apply template"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        {(isSelfView && !isAdminViewer
          ? inst.tasks.filter((t) => t.assigneeRole === "EmployeeRole")
          : inst.tasks
        ).map((t, i) => (
          <div key={t.id} className={clsx("row-stagger bg-white rounded-lg shadow-sm border p-4",
            t.status === "TaskCompleted" ? "border-green-200 bg-green-50/30" :
            t.status === "TaskBlocked" ? "border-red-200" : "border-gray-200")} style={{ ["--i" as never]: Math.min(i, 10) }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={clsx("text-[13px] font-semibold", t.status === "TaskCompleted" ? "line-through text-gray-400" : "text-gray-900")}>{t.title}</h3>
                  {t.isMandatory && <span className="text-red-500 text-xs">*</span>}
                  {t.stepType
                    ? <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full text-[11px] font-medium">{STEP_TYPE_LABEL[t.stepType] ?? t.stepType}</span>
                    : <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">{t.category}</span>}
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[11px] font-medium">{t.assigneeRole}</span>
                  {inst.automated && sendableStep(t.stepType, t.config) && t.status !== "TaskCompleted" && t.status !== "TaskSkipped"
                    && !(t.config?.requestSentAt) && firstPendingSendableId !== t.id && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[11px] font-medium">Queued</span>
                  )}
                </div>
                {t.description && <p className="text-xs text-gray-500 mb-1">{t.description}</p>}
                {(() => { const s = stepSummary(t.stepType, t.config); return s ? <div className="text-[11px] text-gray-500 mb-1">{s}</div> : null; })()}
                {t.stepType === "BGV" && (() => {
                  const cfg = (t.config ?? {}) as Record<string, unknown>;
                  const checks = Array.isArray(cfg.bgvChecks) ? (cfg.bgvChecks as string[]) : [];
                  const st = (cfg.bgvStatus ?? {}) as Record<string, string>;
                  return (
                    <div className="mt-1.5 border border-gray-100 rounded-lg p-2 bg-gray-50/60 space-y-1.5">
                      {checks.map((c) => {
                        const s = st[c] ?? "pending";
                        return (
                          <div key={c} className="flex items-center gap-2 text-[11.5px]">
                            <span className="flex-1 text-gray-700">{c}</span>
                            <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold",
                              s === "clear" ? "bg-green-100 text-green-700" : s === "discrepancy" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500")}>
                              {s === "clear" ? "Clear" : s === "discrepancy" ? "Discrepancy" : "Pending"}
                            </span>
                            {(!isSelfView || isAdminViewer) && t.status !== "TaskCompleted" && (
                              <>
                                <button onClick={() => bgvMut.mutate({ taskId: t.id, check: c, status: "clear" })}
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold border border-green-200 text-green-700 hover:bg-green-50">Clear</button>
                                <button onClick={() => bgvMut.mutate({ taskId: t.id, check: c, status: "discrepancy" })}
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold border border-red-200 text-red-600 hover:bg-red-50">Flag</button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {t.stepType === "ExternalLink" && t.config && typeof t.config.url === "string" && t.config.url && (
                  <a href={t.config.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16a34a] mb-1 hover:underline">Open link ↗</a>
                )}
                {(() => {
                  const due = t.dueDate ? t.dueDate.slice(0, 10) : "";
                  const done = t.status === "TaskCompleted" || t.status === "TaskSkipped";
                  const overdue = !!due && !done && new Date(due) < new Date(new Date().toDateString());
                  if (!canEditDue) {
                    return t.dueDate ? (
                      <div className={clsx("text-xs mt-1", overdue ? "text-red-600 font-medium" : "text-gray-500")}>
                        {overdue ? "Overdue · " : "Due: "}{new Date(t.dueDate).toLocaleDateString("en-IN")}
                      </div>
                    ) : null;
                  }
                  return (
                    <div className="flex items-center gap-1.5 mt-1">
                      <CalendarClock size={12} className={overdue ? "text-red-500" : "text-gray-400"} />
                      <input type="date" value={due}
                        onChange={(e) => dueDateMut.mutate({ taskId: t.id, dueDate: e.target.value || null })}
                        className={clsx("bg-transparent border rounded-md px-1.5 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-green-400",
                          overdue ? "border-red-300 text-red-600" : due ? "border-amber-200 text-amber-700" : "border-gray-200 text-gray-500")} />
                      {overdue && <span className="text-[10px] font-bold text-red-600">OVERDUE</span>}
                      {due && <button onClick={() => dueDateMut.mutate({ taskId: t.id, dueDate: null })} className="text-gray-300 hover:text-red-500" title="Clear deadline"><X size={11} /></button>}
                    </div>
                  );
                })()}
                {t.notes && <div className="text-xs text-gray-600 mt-1">{t.notes}</div>}
              </div>
              <div className="flex items-center gap-1">
                {(t.stepType === "SendEmail" || t.stepType === "Notification") && (t.status === "TaskPending" || t.status === "TaskInProgress") && (() => {
                  const n = Array.isArray(t.config?.templates) ? (t.config!.templates as string[]).filter(Boolean).length : (t.config?.template ? 1 : 0);
                  return (
                    <Tooltip content={n === 0 ? "Select email templates in the builder first" : `Send ${n} email${n === 1 ? "" : "s"} now`}>
                      <button onClick={() => sendEmailMut.mutate(t.id)} disabled={sendEmailMut.isPending || n === 0}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60 bg-green-600 text-white hover:bg-green-700">
                        <Send size={11} /> {sendEmailMut.isPending ? "Sending…" : n > 1 ? `Send ${n} now` : "Send now"}
                      </button>
                    </Tooltip>
                  );
                })()}
                {t.stepType === "DocumentUpload" && (() => {
                  const uploads = ((t.config as Record<string, unknown> | null)?.uploads ?? {}) as Record<string, unknown>;
                  const uploadCount = Object.keys(uploads).length;
                  return (
                    <>
                      {uploadCount > 0 && (
                        <button onClick={() => setReviewTask(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                          <BadgeCheck size={11} /> Review ({uploadCount})
                        </button>
                      )}
                      {t.status !== "TaskCompleted" && (
                        <button onClick={() => docRequestMut.mutate(t.id)} disabled={docRequestMut.isPending}
                          className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60",
                            (t.config as Record<string, unknown> | null)?.requestSentAt ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700")}>
                          <Send size={11} /> {docRequestMut.isPending ? "Sending…" : ((t.config as Record<string, unknown> | null)?.requestSentAt ? "Resend request" : "Send document request")}
                        </button>
                      )}
                    </>
                  );
                })()}
                {t.stepType === "CompleteProfile" && t.status !== "TaskCompleted" && (
                  <Tooltip content="Fill the employee's mandatory profile details">
                    <button onClick={() => setProfileTask(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700">
                      <UserCog size={11} /> Complete Profile
                    </button>
                  </Tooltip>
                )}
                {t.stepType === "ReadPolicy" && (() => {
                  const cfg = (t.config ?? {}) as Record<string, unknown>;
                  const files = Array.isArray(cfg.files) ? (cfg.files as { url: string }[]) : [];
                  const acks = (cfg.acks ?? {}) as Record<string, unknown>;
                  const ackCount = files.filter((f) => acks[f.url]).length;
                  return (
                    <>
                      {files.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-sky-50 text-sky-700">
                          <BadgeCheck size={11} /> {ackCount}/{files.length} acknowledged
                        </span>
                      )}
                      {t.status !== "TaskCompleted" && (
                        <button onClick={() => ackRequestMut.mutate(t.id)} disabled={ackRequestMut.isPending || files.length === 0}
                          className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60",
                            cfg.requestSentAt ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700")}>
                          <Send size={11} /> {ackRequestMut.isPending ? "Sending…" : (cfg.requestSentAt ? "Resend request" : "Send acknowledgement request")}
                        </button>
                      )}
                    </>
                  );
                })()}
                {["CustomTask", "AssetAssignment", "ITProvisioning"].includes(t.stepType ?? "") && t.status !== "TaskCompleted" && (() => {
                  const cfg = (t.config ?? {}) as Record<string, unknown>;
                  const ids = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean)
                    : (cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : []);
                  if (ids.length === 0) return null;
                  return (
                    <button onClick={() => notifyAssigneesMut.mutate(t.id)} disabled={notifyAssigneesMut.isPending}
                      className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60",
                        cfg.requestSentAt ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-green-600 text-white hover:bg-green-700")}>
                      <Send size={11} /> {notifyAssigneesMut.isPending ? "Sending…" : (cfg.requestSentAt ? "Resend" : `Send to assignee${ids.length > 1 ? "s" : ""}`)}
                    </button>
                  );
                })()}
                {t.category === "Documentation" && t.status !== "TaskCompleted" && !isBankTask(t.title) && t.stepType !== "DocumentUpload" && (
                  <Tooltip content="Upload document">
                    <button onClick={() => openUpload(t)}
                      className="p-2 rounded-lg border border-[#bbf7d0] text-[#22c55e] hover:bg-[#dcfce7]">
                      <Upload size={12} />
                    </button>
                  </Tooltip>
                )}
                {isBankTask(t.title) && t.status !== "TaskCompleted" && (
                  <Tooltip content="Submit Bank Details">
                    <button onClick={() => openBank(t)}
                      className="p-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                      <Banknote size={12} />
                    </button>
                  </Tooltip>
                )}
                {!(t.category === "Documentation" || isBankTask(t.title)) && t.stepType !== "CompleteProfile" && t.stepType !== "ReadPolicy" && t.stepType !== "BGV" && (
                  <Tooltip content="Mark complete">
                    <button aria-label="Mark complete" onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskCompleted" })}
                      disabled={t.status === "TaskCompleted"}
                      className={clsx("p-2 rounded-lg border text-xs", t.status === "TaskCompleted" ? "bg-green-100 border-green-300 text-green-700" : "border-gray-300 text-gray-600 hover:bg-green-50")}>
                      <CheckCircle size={12} />
                    </button>
                  </Tooltip>
                )}
                {/* Complete Profile is mandatory and can ONLY be finished via its
                    form — no skip/block escape hatch. */}
                {t.stepType !== "CompleteProfile" && t.stepType !== "BGV" && (
                  <>
                    <Tooltip content="Skip task">
                      <button aria-label="Skip task" onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskSkipped" })}
                        className="p-2 rounded-lg border border-[var(--border)] text-gray-600 hover:bg-gray-50">
                        <SkipForward size={12} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Block task">
                      <button aria-label="Block task" onClick={() => updateMut.mutate({ taskId: t.id, status: "TaskBlocked" })}
                        className="p-2 rounded-lg border border-[var(--border)] text-gray-600 hover:bg-red-50">
                        <PauseCircle size={12} />
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 text-center">
            <div className="text-[13px] font-semibold text-gray-900 mb-3">Completion</div>
            <div className="relative inline-grid place-items-center">
              <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
                <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle cx="48" cy="48" r={R} fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={ringOffset} className="transition-all duration-500" />
              </svg>
              <span className="absolute text-lg font-bold text-gray-900 tabular-nums">{inst.progress}%</span>
            </div>
            <div className="mt-3 space-y-2 text-left">
              {[
                { label: "Completed", value: completed, dot: "bg-green-500" },
                { label: "Pending", value: pending, dot: "bg-amber-500" },
                { label: "Overdue", value: overdue, dot: "bg-red-500" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-gray-600"><span className={clsx("h-2 w-2 rounded-full", r.dot)} />{r.label}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="text-[13px] font-semibold text-gray-900 mb-3">Documents</div>
            <button onClick={() => window.open(withBasePath(`/api/v1/hrms/onboarding/${employeeId}/joining-letter`), "_blank", "noopener")}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50 transition-colors">
              <FileText size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs font-medium text-gray-700 flex-1 truncate">Joining Letter</span>
              <ChevronDown size={13} className="text-gray-300 flex-shrink-0 -rotate-90" />
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="text-[13px] font-semibold text-gray-900 mb-3">Employee Summary</div>
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "Name", value: employeeName },
                { label: "Employee ID", value: emp?.employeeCode ?? "—" },
                { label: "Designation", value: emp?.designation?.title ?? emp?.jobTitle ?? "—" },
                { label: "Department", value: emp?.department?.name ?? "—" },
                { label: "Manager", value: managerName },
                { label: "Start Date", value: fmtDate(inst.startDate) },
                { label: "Joining Date", value: fmtDate(emp?.dateOfJoining) },
                { label: "Phase", value: isPreOnboarding ? "Pre-Onboarding" : "Onboarding" },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-3">
                  <dt className="text-gray-500 flex-shrink-0">{r.label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>

      {/* HR document review */}
      {reviewTask && (() => {
        const rt = inst.tasks.find((t) => t.id === reviewTask.id) ?? reviewTask;
        const cfg = (rt.config ?? {}) as Record<string, unknown>;
        const docs = Array.isArray(cfg.documents) ? (cfg.documents as string[]).filter(Boolean) : [];
        const uploads = (cfg.uploads ?? {}) as Record<string, { url: string; fileName: string; review: string; rejectReason?: string }>;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setReviewTask(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <div><h3 className="text-sm font-bold text-gray-900">Review documents</h3><p className="text-[11px] text-gray-500">{rt.title}</p></div>
                <button onClick={() => setReviewTask(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
              </div>
              <div className="p-4 max-h-[70vh] overflow-y-auto space-y-2.5">
                {docs.map((doc) => {
                  const up = uploads[doc];
                  const review = up?.review ?? "missing";
                  return (
                    <div key={doc} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-gray-900 truncate">{doc}</div>
                          <div className="text-[11px] text-gray-400 truncate">{up ? up.fileName : "Not uploaded yet"}</div>
                        </div>
                        {up && (
                          <a href={withBasePath(up.url)} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] font-semibold text-green-700 hover:underline">View</a>
                        )}
                        <span className={clsx("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                          review === "approved" ? "bg-green-100 text-green-700" :
                          review === "rejected" ? "bg-red-100 text-red-700" :
                          review === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500")}>
                          {review === "missing" ? "Not uploaded" : review}
                        </span>
                      </div>
                      {up?.rejectReason && review === "rejected" && <div className="mt-1.5 text-[11px] text-red-600">Reason: {up.rejectReason}</div>}
                      {up && review !== "approved" && (
                        <div className="flex gap-2 mt-2.5">
                          <button onClick={() => docReviewMut.mutate({ taskId: rt.id, docName: doc, action: "approve" })} disabled={docReviewMut.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"><Check size={11} /> Approve</button>
                          <button onClick={() => { const reason = window.prompt("Reason for rejection (optional):") ?? undefined; docReviewMut.mutate({ taskId: rt.id, docName: doc, action: "reject", reason }); }} disabled={docReviewMut.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-60"><X size={11} /> Reject</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500">The task completes automatically once every document is approved.</div>
            </div>
          </div>
        );
      })()}

      {/* Complete Confirmation */}
      {confirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !completeMut.isPending && setConfirmComplete(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className={clsx("shrink-0 flex items-center justify-center w-12 h-12 rounded-full ring-4",
                  confirmComplete.force ? "bg-amber-50 ring-amber-50/60" : "bg-emerald-50 ring-emerald-50/60")}>
                  {confirmComplete.force
                    ? <AlertTriangle className="w-6 h-6 text-amber-600" />
                    : <Trophy className="w-6 h-6 text-emerald-600" />}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {confirmComplete.force ? "Force Complete Onboarding?" : "Complete Onboarding?"}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    {confirmComplete.force
                      ? <>There {confirmComplete.pending === 1 ? "is" : "are"} <span className="font-semibold text-amber-700">{confirmComplete.pending}</span> mandatory {confirmComplete.pending === 1 ? "task" : "tasks"} still pending.</>
                      : "All mandatory tasks are done. This will mark the employee as Active."}
                  </p>
                  {confirmComplete.force && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
                      Force completing will skip the remaining mandatory tasks. Use with caution.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button type="button" onClick={() => setConfirmComplete(null)} disabled={completeMut.isPending}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
                Not Now
              </button>
              <button type="button"
                onClick={() => completeMut.mutate(confirmComplete.force)}
                disabled={completeMut.isPending}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 transition text-white",
                  confirmComplete.force
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                    : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700")}>
                {completeMut.isPending
                  ? "Working..."
                  : confirmComplete.force ? "Yes, Force Complete" : "Complete Onboarding"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document */}
      {uploadTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !uploadMut.isPending && setUploadTask(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-[#dcfce7] ring-4 ring-[#dcfce7]/60">
                  <Paperclip className="w-6 h-6 text-[#22c55e]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Upload Document</h3>
                  <p className="mt-1 text-xs text-slate-500">For task: <span className="font-medium text-slate-700">{uploadTask.title}</span></p>
                </div>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); uploadMut.mutate(uploadTask.id); }} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                  <input required value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                </div>

                <div className="flex gap-1 border-b border-slate-200">
                  <button type="button" onClick={() => setUploadMode("local")}
                    className={clsx("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px",
                      uploadMode === "local" ? "border-[#22c55e] text-[#22c55e]" : "border-transparent text-slate-500 hover:text-slate-700")}>
                    From Device
                  </button>
                  <button type="button" onClick={() => setUploadMode("url")}
                    className={clsx("px-3 py-1.5 text-xs font-medium border-b-2 -mb-px",
                      uploadMode === "url" ? "border-[#22c55e] text-[#22c55e]" : "border-transparent text-slate-500 hover:text-slate-700")}>
                    Paste URL
                  </button>
                </div>

                {uploadMode === "local" ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Select File</label>
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg px-4 py-4 cursor-pointer hover:border-[#86efac] hover:bg-[#dcfce7]/40 transition">
                      <Upload size={20} className="text-slate-400" />
                      {selectedFile ? (
                        <div className="text-center">
                          <p className="text-xs font-medium text-slate-700">{selectedFile.name}</p>
                          <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type || "unknown"}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Click to choose a file (max 10MB)</p>
                      )}
                      <input type="file" className="hidden"
                        accept="application/pdf,image/png,image/jpeg,image/webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setSelectedFile(f);
                          if (f) setUploadForm((p) => ({ ...p, fileType: f.type || p.fileType, fileSize: f.size }));
                        }} />
                    </label>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">File URL</label>
                    <input required={uploadMode === "url"} type="url" placeholder="https://..." value={uploadForm.fileUrl}
                      onChange={(e) => setUploadForm({ ...uploadForm, fileUrl: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                    <p className="mt-1 text-xs text-slate-400">Paste a link to the uploaded file (S3, Drive, etc).</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <Select
                      value={uploadForm.category}
                      onChange={(v) => setUploadForm({ ...uploadForm, category: v as DocCategory })}
                      options={DOC_CATEGORIES.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">File Type</label>
                    <input value={uploadForm.fileType}
                      onChange={(e) => setUploadForm({ ...uploadForm, fileType: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs" />
                  </div>
                </div>

                {uploadError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">{uploadError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setUploadTask(null)} disabled={uploadMut.isPending}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={uploadMut.isPending || (uploadMode === "local" && !selectedFile)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                    {uploadMut.isPending ? "Uploading..." : <><Upload size={13} /> Upload & Complete</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bank Details Submit */}
      {bankTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !bankSubmitMut.isPending && setBankTask(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4">
              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 ring-4 ring-emerald-50/60">
                  <Banknote className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Submit Bank Details</h3>
                  <p className="mt-1 text-xs text-slate-500">For task: <span className="font-medium text-slate-700">{bankTask.title}</span></p>
                </div>
                <button onClick={() => setBankTask(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <BankDetailsFields
                value={bankForm}
                onChange={(patch) => setBankForm({ ...bankForm, ...patch })}
                inputCls="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]"
              />

              {bankError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5 mt-3">{bankError}</p>
              )}

              <div className="flex justify-end gap-2 pt-4 mt-3 border-t border-slate-100">
                <button type="button" onClick={() => setBankTask(null)} disabled={bankSubmitMut.isPending}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={() => bankSubmitMut.mutate(bankTask.id)} disabled={bankSubmitMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                  {bankSubmitMut.isPending ? "Saving..." : <><Banknote size={13} /> Save & Complete Task</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileTask && (
        <ProfileModal
          employeeId={employeeId}
          task={profileTask}
          onClose={() => setProfileTask(null)}
          onSaved={() => { setProfileTask(null); qc.invalidateQueries({ queryKey: ["onboarding", employeeId] }); toast.success("Profile saved", "The step is now complete."); }}
        />
      )}

      {/* Cancel Confirmation */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !cancelMut.isPending && setConfirmCancel(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 ring-4 ring-red-50/60">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Cancel Onboarding?</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    The candidate will not be activated. This action is hard to reverse.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason (optional)</label>
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2}
                  placeholder="e.g. Candidate declined offer"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button type="button" onClick={() => setConfirmCancel(false)} disabled={cancelMut.isPending}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
                Keep Going
              </button>
              <button type="button"
                onClick={() => cancelMut.mutate(cancelReason)}
                disabled={cancelMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-green-600 hover:from-red-700 hover:to-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 transition">
                {cancelMut.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Provisions Panel ────────────────────────────────────

type ProvStatus = "ProvPending" | "ProvInProgress" | "ProvDone" | "ProvBlocked" | "ProvNotRequired";
type ProvCategory = "ITAccount" | "Hardware" | "Access" | "Compliance" | "Facility" | "ProvOther";

interface EmployeeProvisionRow {
  id: string;
  employeeId: string;
  provisionItemId: string | null;
  name: string;
  category: ProvCategory;
  status: ProvStatus;
  assignedTo: string | null;
  notes: string | null;
  dueDate: string | null;
  provisionedAt: string | null;
  item: { id: string; name: string; category: ProvCategory } | null;
}

interface CatalogueItem {
  id: string;
  name: string;
  category: ProvCategory;
  isDefault: boolean;
  isActive: boolean;
  description: string | null;
}

const PROV_CATEGORIES: ProvCategory[] = ["ITAccount", "Hardware", "Access", "Compliance", "Facility", "ProvOther"];

const categoryColors: Record<ProvCategory, string> = {
  ITAccount: "bg-[#dcfce7] text-[#166534]",
  Hardware: "bg-purple-50 text-purple-700",
  Access: "bg-amber-50 text-amber-700",
  Compliance: "bg-emerald-50 text-emerald-700",
  Facility: "bg-cyan-50 text-cyan-700",
  ProvOther: "bg-gray-100 text-gray-700",
};

const statusColors: Record<ProvStatus, string> = {
  ProvPending: "bg-gray-100 text-gray-700 ring-gray-200",
  ProvInProgress: "bg-[#dcfce7] text-[#166534] ring-[#bbf7d0]",
  ProvDone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ProvBlocked: "bg-red-50 text-red-700 ring-red-200",
  ProvNotRequired: "bg-slate-50 text-slate-500 ring-slate-200",
};

function ProvisionsPanel({ employeeId }: { employeeId: string }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [form, setForm] = useState({ name: "", category: "ITAccount" as ProvCategory, notes: "", dueDate: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-provisions", employeeId],
    queryFn: () => api.get<EmployeeProvisionRow[]>(`/api/v1/hrms/onboarding/${employeeId}/provisions`),
  });
  const provisions = data?.data ?? [];

  const { data: catData } = useQuery({
    queryKey: ["provision-catalogue"],
    queryFn: () => api.get<CatalogueItem[]>("/api/v1/hrms/onboarding/provisions/catalogue"),
    enabled: showCatalogue,
  });
  const catalogue = catData?.data ?? [];

  const addMut = useMutation({
    mutationFn: (body: typeof form) =>
      api.post(`/api/v1/hrms/onboarding/${employeeId}/provisions`, {
        name: body.name, category: body.category,
        notes: body.notes || null,
        dueDate: body.dueDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-provisions", employeeId] });
      setShowAdd(false);
      setForm({ name: "", category: "ITAccount", notes: "", dueDate: "" });
      toast.success("Provision added");
    },
  });

  const applyCatalogueMut = useMutation({
    mutationFn: (itemIds?: string[]) =>
      api.put(`/api/v1/hrms/onboarding/${employeeId}/provisions`, itemIds?.length
        ? { onlyDefaults: false, itemIds }
        : { onlyDefaults: true }
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["onboarding-provisions", employeeId] });
      const payload = r.data as { added: number; skipped: number };
      toast.success(`Added ${payload.added} · skipped ${payload.skipped}`);
      setShowCatalogue(false);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProvStatus }) =>
      api.patch(`/api/v1/hrms/onboarding/${employeeId}/provisions/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-provisions", employeeId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/onboarding/${employeeId}/provisions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-provisions", employeeId] });
      toast.success("Provision removed");
    },
  });

  const byCategory = PROV_CATEGORIES.map((c) => ({ category: c, items: provisions.filter((p) => p.category === c) })).filter((g) => g.items.length > 0);
  const doneCount = provisions.filter((p) => p.status === "ProvDone").length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[#7c3aed]" />
          <h2 className="text-[13px] font-semibold text-gray-900">Provisions</h2>
          <span className="text-xs text-gray-500">{doneCount}/{provisions.length} provisioned</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => applyCatalogueMut.mutate(undefined)}
              disabled={applyCatalogueMut.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#7c3aed] to-[#16a34a] hover:from-[#6d28d9] hover:to-[#166534] text-white rounded-md text-xs font-medium shadow-sm disabled:opacity-60"
            >
              {applyCatalogueMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Auto-apply Defaults
            </button>
            <button
              onClick={() => setShowCatalogue(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-xs font-medium text-gray-700"
            >
              Browse Catalogue
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
            >
              <Plus size={12} /> Custom Item
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-4 text-xs text-gray-500">Loading…</div>
          ) : provisions.length === 0 ? (
            <div className="text-center py-5 border border-dashed border-gray-200 rounded-md">
              <Shield size={24} className="mx-auto text-gray-300 mb-1" />
              <p className="text-xs text-gray-500">No provisions yet. Auto-apply defaults or add custom items.</p>
            </div>
          ) : (
            byCategory.map((g) => (
              <div key={g.category}>
                <p className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide mb-1.5", categoryColors[g.category])}>
                  {g.category.replace(/([A-Z])/g, " $1").trim()}
                </p>
                <div className="space-y-1.5">
                  {g.items.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{p.name}</p>
                        {p.notes && <p className="text-[11px] text-gray-500 truncate">{p.notes}</p>}
                        {p.dueDate && <p className="text-[10px] text-gray-400">Due {new Date(p.dueDate).toLocaleDateString("en-IN")}</p>}
                      </div>
                      <Select
                        value={p.status}
                        onChange={(v) => statusMut.mutate({ id: p.id, status: v as ProvStatus })}
                        size="sm"
                        className="min-w-[130px]"
                        options={[
                          { value: "ProvPending", label: "Pending" },
                          { value: "ProvInProgress", label: "In Progress" },
                          { value: "ProvDone", label: "Provisioned" },
                          { value: "ProvBlocked", label: "Blocked" },
                          { value: "ProvNotRequired", label: "Not Required" },
                        ]}
                      />
                      <button
                        onClick={() => deleteMut.mutate(p.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add custom modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-4">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Add Custom Provision</h3>
            <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return toast.error("Name required"); addMut.mutate(form); }} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., MacBook Pro, Slack access"
                  className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <Select
                  value={form.category}
                  onChange={(v) => setForm({ ...form, category: v as ProvCategory })}
                  options={PROV_CATEGORIES.map((c) => ({ value: c, label: c.replace(/([A-Z])/g, " $1").trim() }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  min={todayInput()}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium">Cancel</button>
                <button type="submit" disabled={addMut.isPending} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium disabled:opacity-60">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Catalogue picker modal */}
      {showCatalogue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCatalogue(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-4 max-h-[85vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Provision Catalogue</h3>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {catalogue.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No catalogue items yet. Create some in onboarding settings.</p>
              ) : catalogue.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-gray-900">{c.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={clsx("px-1.5 py-0.5 rounded-full text-[10px] font-semibold", categoryColors[c.category])}>{c.category}</span>
                      {c.isDefault && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">Default</span>}
                    </div>
                    {c.description && <p className="text-[11px] text-gray-500 mt-0.5">{c.description}</p>}
                  </div>
                  <button
                    onClick={() => applyCatalogueMut.mutate([c.id])}
                    disabled={applyCatalogueMut.isPending}
                    className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium disabled:opacity-60"
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-3 border-t border-gray-100 mt-3">
              <button onClick={() => setShowCatalogue(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Complete Profile modal ──────────────────────────────
// Fills the mandatory employee fields the recruit → onboard path leaves blank
// (DOB, gender, address, emergency contact, PAN/Aadhaar, reporting manager),
// saves them to the employee, then marks the onboarding step complete.

const GENDERS = ["Male", "Female", "Transgender", "NonBinary", "PreferNotToSay"];
const PINPUT = "w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500";

interface EmpProfile {
  dateOfBirth?: string | null; gender?: string | null; personalPhone?: string | null;
  panNumber?: string | null; aadhaarNumber?: string | null; reportingManagerId?: string | null;
  currentAddress?: { line1?: string; city?: string; state?: string; country?: string; zipCode?: string } | null;
  emergencyContacts?: Array<{ name?: string; relationship?: string; phone?: string }> | null;
}

function ProfileModal({ employeeId, task, onClose, onSaved }: { employeeId: string; task: Task; onClose: () => void; onSaved: () => void }) {
  const api = useApiClient();

  const { data: empResp, isLoading } = useQuery({
    queryKey: ["employee-profile", employeeId],
    queryFn: () => api.get<EmpProfile>(`/api/v1/hrms/employees/${employeeId}`),
  });
  const { data: peopleResp } = useQuery({
    queryKey: ["org-chart"],
    queryFn: () => api.get<{ employees: { id: string; firstName: string; lastName: string }[] }>("/api/v1/hrms/org-chart"),
  });
  const managerOpts = (peopleResp?.data?.employees ?? [])
    .filter((e) => e.id !== employeeId)
    .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }));

  const [form, setForm] = useState({
    dateOfBirth: "", gender: "", personalPhone: "", panNumber: "", aadhaarNumber: "", reportingManagerId: "",
    line1: "", city: "", state: "", country: "", zipCode: "",
    ecName: "", ecRelationship: "", ecPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const e = empResp?.data;
    if (!e || ready) return;
    const a = e.currentAddress ?? {};
    const ec = (e.emergencyContacts ?? [])[0] ?? {};
    setForm((f) => ({
      ...f,
      dateOfBirth: e.dateOfBirth ? String(e.dateOfBirth).slice(0, 10) : "",
      gender: e.gender ?? "",
      personalPhone: e.personalPhone ?? "",
      panNumber: e.panNumber ?? "",
      aadhaarNumber: e.aadhaarNumber ?? "",
      reportingManagerId: e.reportingManagerId ?? "",
      line1: a.line1 ?? "", city: a.city ?? "", state: a.state ?? "", country: a.country ?? "", zipCode: a.zipCode ?? "",
      ecName: ec.name ?? "", ecRelationship: ec.relationship ?? "", ecPhone: ec.phone ?? "",
    }));
    setReady(true);
  }, [empResp?.data, ready]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.dateOfBirth) throw new Error("Date of birth is required");
      if (!form.reportingManagerId) throw new Error("Reporting manager is required");

      const addrFilled = [form.line1, form.city, form.state, form.country, form.zipCode].some((x) => x.trim());
      if (addrFilled && ![form.line1, form.city, form.state, form.country, form.zipCode].every((x) => x.trim())) {
        throw new Error("Fill the full current address (all fields) or leave it blank");
      }
      const ecFilled = [form.ecName, form.ecRelationship, form.ecPhone].some((x) => x.trim());
      if (ecFilled && ![form.ecName, form.ecRelationship, form.ecPhone].every((x) => x.trim())) {
        throw new Error("Fill the full emergency contact (name, relationship, phone) or leave it blank");
      }

      const payload: Record<string, unknown> = {
        dateOfBirth: form.dateOfBirth,
        reportingManagerId: form.reportingManagerId,
      };
      if (form.gender) payload.gender = form.gender;
      if (form.personalPhone.trim()) payload.personalPhone = form.personalPhone.trim();
      if (form.panNumber.trim()) payload.panNumber = form.panNumber.trim();
      if (form.aadhaarNumber.trim()) payload.aadhaarNumber = form.aadhaarNumber.trim();
      if (addrFilled) payload.currentAddress = { line1: form.line1.trim(), city: form.city.trim(), state: form.state.trim(), country: form.country.trim(), zipCode: form.zipCode.trim() };
      if (ecFilled) payload.emergencyContacts = [{ name: form.ecName.trim(), relationship: form.ecRelationship.trim(), phone: form.ecPhone.trim() }];

      await api.patch(`/api/v1/hrms/employees/${employeeId}`, payload);
      await api.put(`/api/v1/hrms/onboarding/tasks/${task.id}`, { status: "TaskCompleted" });
    },
    meta: { suppressGlobalError: true },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !saveMut.isPending && onClose()} />
      <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4 p-4 border-b border-slate-100">
          <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-violet-50 ring-4 ring-violet-50/60">
            <UserCog className="w-6 h-6 text-violet-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900">Complete Profile</h3>
            <p className="mt-1 text-xs text-slate-500">Fill the new hire&apos;s mandatory details. Saved to their employee record.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={20} /></div>
        ) : (
          <div className="p-4 max-h-[70vh] overflow-y-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Date of Birth <span className="text-red-500">*</span></label>
                <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={PINPUT} /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Gender</label>
                <Select size="sm" value={form.gender} onChange={(v) => set("gender", v)} options={[{ value: "", label: "Select…" }, ...GENDERS.map((g) => ({ value: g, label: g }))]} /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Personal Phone</label>
                <input value={form.personalPhone} onChange={(e) => set("personalPhone", e.target.value)} placeholder="+91…" className={PINPUT} /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Reporting Manager <span className="text-red-500">*</span></label>
                <Select size="sm" value={form.reportingManagerId} onChange={(v) => set("reportingManagerId", v)} searchable options={[{ value: "", label: "Select manager…" }, ...managerOpts]} /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">PAN Number</label>
                <input value={form.panNumber} onChange={(e) => set("panNumber", e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={PINPUT} /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Aadhaar Number</label>
                <input value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", e.target.value)} placeholder="12-digit" className={PINPUT} /></div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Current Address</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><input value={form.line1} onChange={(e) => set("line1", e.target.value)} placeholder="Address line" className={PINPUT} /></div>
                <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={PINPUT} />
                <input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="State" className={PINPUT} />
                <input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" className={PINPUT} />
                <input value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} placeholder="PIN / ZIP" className={PINPUT} />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Emergency Contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input value={form.ecName} onChange={(e) => set("ecName", e.target.value)} placeholder="Name" className={PINPUT} />
                <input value={form.ecRelationship} onChange={(e) => set("ecRelationship", e.target.value)} placeholder="Relationship" className={PINPUT} />
                <input value={form.ecPhone} onChange={(e) => set("ecPhone", e.target.value)} placeholder="Phone" className={PINPUT} />
              </div>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-white">
          <button type="button" onClick={onClose} disabled={saveMut.isPending}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button onClick={() => { setError(null); saveMut.mutate(); }} disabled={saveMut.isPending || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
            {saveMut.isPending ? "Saving…" : <><UserCog size={13} /> Save &amp; Complete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirmation Panel ──────────────────────────────────

function ConfirmationPanel({ employeeId, pendingMandatory }: { employeeId: string; pendingMandatory: number }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { employee: meEmp, hasPermission } = useDashboardConfig();
  const [showModal, setShowModal] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    confirmationDate: todayIso,
    notes: "",
    revisedCTC: null as number | null,
    revisedDesignation: "",
    nextReviewDate: "",
    sendEmail: true,
  });

  const { data: empData } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => api.get<{ id: string; firstName: string; lastName: string; workEmail: string; jobTitle: string | null; confirmationDate: string | null; probationEndDate: string | null; dateOfJoining: string; status: string }>(`/api/v1/hrms/employees/${employeeId}`),
  });
  const emp = empData?.data;

  // Pre-fill the form from what we already know once the employee loads:
  // Confirmation Date = probation end date, Revised Designation = current title,
  // Next Review Date = 6 months after confirmation. All stay editable.
  useEffect(() => {
    if (!emp) return;
    const conf = emp.probationEndDate ? emp.probationEndDate.slice(0, 10) : todayIso;
    const rev = new Date(`${conf}T00:00:00`);
    rev.setMonth(rev.getMonth() + 6);
    const revIso = new Date(rev.getTime() - rev.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setForm((f) => ({
      ...f,
      confirmationDate: emp.probationEndDate ? conf : f.confirmationDate,
      revisedDesignation: f.revisedDesignation || (emp.jobTitle ?? ""),
      nextReviewDate: f.nextReviewDate || revIso,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp?.id]);

  const router = useRouter();
  const confirmMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/employees/${employeeId}/confirm`, {
      confirmationDate: form.confirmationDate,
      notes: form.notes || null,
      revisedCTC: form.revisedCTC,
      revisedDesignation: form.revisedDesignation || null,
      nextReviewDate: form.nextReviewDate || null,
      sendEmail: form.sendEmail,
    }),
    onSuccess: (r) => {
      const payload = r.data as { emailSent: boolean; emailError: string | null };
      qc.invalidateQueries({ queryKey: ["employee", employeeId] });
      qc.invalidateQueries({ queryKey: ["employees", "me"] });
      const parts = ["Send their portal invite from the Users screen."];
      if (payload.emailSent) parts.push("Confirmation email sent.");
      else if (payload.emailError) parts.push(`Confirmation email failed: ${payload.emailError}`);
      toast.success("Employment confirmed", parts.join(" "));
      setShowModal(false);
      router.push("/settings/users");
    },
  });

  const alreadyConfirmed = Boolean(emp?.confirmationDate);
  const probationDue = emp?.probationEndDate ? new Date(emp.probationEndDate) : null;
  const daysToProbationEnd = probationDue ? Math.ceil((probationDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  // Hide for the employee viewing their own page — confirmation is an
  // HR-side action, not self-service. Also hide for users without
  // employee-write permission.
  const isSelfView = meEmp?.id === employeeId;
  const canConfirm = hasPermission("hrms.employee.write") || hasPermission("hrms.rbac.manage");
  if (isSelfView || !canConfirm) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 w-full">
      <div className="flex items-start justify-between gap-3 h-full">
        <div className="flex items-start gap-2.5">
          <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center",
            alreadyConfirmed ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
            <BadgeCheck size={18} />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-gray-900">Employment Confirmation</h2>
            {alreadyConfirmed ? (
              <p className="text-xs text-emerald-700 mt-0.5">
                Confirmed on {new Date(emp!.confirmationDate!).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            ) : (
              <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                <p>Probation status · awaiting confirmation</p>
                {probationDue && (
                  <p className={clsx(daysToProbationEnd !== null && daysToProbationEnd < 0 ? "text-red-600" : daysToProbationEnd !== null && daysToProbationEnd <= 14 ? "text-amber-600" : "text-gray-500")}>
                    Probation ends {probationDue.toLocaleDateString("en-IN")} ({daysToProbationEnd !== null && daysToProbationEnd >= 0 ? `${daysToProbationEnd} day${daysToProbationEnd === 1 ? "" : "s"} left` : `${Math.abs(daysToProbationEnd ?? 0)} days overdue`})
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        {!alreadyConfirmed && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => setShowModal(true)}
              disabled={pendingMandatory > 0}
              title={pendingMandatory > 0 ? `Complete ${pendingMandatory} required task${pendingMandatory === 1 ? "" : "s"} first` : undefined}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition",
                pendingMandatory > 0
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white",
              )}
            >
              <BadgeCheck size={13} /> Confirm Employment
            </button>
            {pendingMandatory > 0 && (
              <p className="text-[11px] text-amber-700">
                {pendingMandatory} required task{pendingMandatory === 1 ? "" : "s"} still pending. Confirming sends the activation email.
              </p>
            )}
            {pendingMandatory === 0 && (
              <p className="text-[11px] text-gray-500">Sends an activation email so they can set their password.</p>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !confirmMut.isPending && setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-100 bg-emerald-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BadgeCheck size={18} className="text-emerald-600" /> Confirm Employment
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">This will permanently confirm the employee, log the change, and optionally send a confirmation email.</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.confirmationDate) return toast.error("Confirmation date required");
                confirmMut.mutate();
              }}
              className="p-4 space-y-3 max-h-[70vh] overflow-y-auto"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Confirmation Date *</label>
                  <input
                    type="date"
                    required
                    value={form.confirmationDate}
                    onChange={(e) => setForm({ ...form, confirmationDate: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Next Review Date</label>
                  <input
                    type="date"
                    value={form.nextReviewDate}
                    min={todayInput()}
                    onChange={(e) => setForm({ ...form, nextReviewDate: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Revised Designation</label>
                  <input
                    type="text"
                    value={form.revisedDesignation}
                    onChange={(e) => setForm({ ...form, revisedDesignation: e.target.value })}
                    placeholder="e.g., Senior Engineer"
                    className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Revised CTC (₹)</label>
                  <NumberInput
                    min="0"
                    value={form.revisedCTC}
                    onChange={(v) => setForm({ ...form, revisedCTC: v })}
                    placeholder="e.g., 1250000"
                    className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Performance remarks, special mention, etc."
                  className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-700 pt-1">
                <input
                  type="checkbox"
                  checked={form.sendEmail}
                  onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
                  className="rounded border-gray-300 text-[#22c55e]"
                />
                Send confirmation email to <span className="font-mono text-xs text-gray-500">{emp?.workEmail ?? "—"}</span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} disabled={confirmMut.isPending} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium disabled:opacity-50">Cancel</button>
                <button
                  type="submit"
                  disabled={confirmMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-md text-xs font-medium shadow-sm disabled:opacity-60"
                >
                  {confirmMut.isPending ? <><Loader2 size={12} className="animate-spin" /> Confirming…</> : <><BadgeCheck size={13} /> Confirm</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
