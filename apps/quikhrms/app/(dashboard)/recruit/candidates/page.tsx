"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import { Plus, Search, User, Briefcase, MapPin, Link2, FileText, IndianRupee,
  Globe, Users as UsersIcon, Landmark, GraduationCap, Rocket, Inbox, Check, ChevronDown, ChevronRight, Sparkles,
  Ban, Archive, ArchiveRestore, Clock, ShieldX, MoreVertical, RotateCcw, X, Flame, AlertCircle, Building2,
  ArrowLeft, ArrowRight, Upload, Pencil, UserPlus } from "lucide-react";
import { CandidateBulkImport } from "../_components/candidate-bulk-import";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Select } from "@/components/hrms/select";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { SkeletonTable, SkeletonLine } from "@/components/hrms/skeleton";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";

// CTC fields are captured in LPA (lakhs per annum) — cap to a realistic ceiling
// so 5–6 digit nonsense values can't be entered.
const MAX_CTC_LPA = 999; // 3-digit cap (LPA)

interface Requisition {
  id: string;
  requisitionNumber: string;
  title: string;
  status: string;
  positions: number;
  filledPositions: number;
  priority: string;
  employmentType: string;
  workLocation: string;
  department: { id: string; name: string } | null;
  _count?: { applications: number };
}

interface CandidateItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  currentCompany: string | null;
  currentDesignation: string | null;
  totalExperience: number | null;
  currentCTC: string | null;
  expectedCTC: string | null;
  noticePeriod: number | null;
  source: string;
  status: string;
  rating: string | null;
  location: string | null;
  willingToRelocate: boolean | null;
  skills: string[] | null;
  education: Array<{ degree?: string; institution?: string; year?: number }> | null;
  tags: string[] | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  resumeUrl: string | null;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  blacklistedAt: string | null;
  blacklistedUntil: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  _count: { applications: number };
  applications: Array<{
    id: string;
    currentStage: string | null;
    status: string;
    requisition: { id: string; title: string; requisitionNumber: string } | null;
  }>;
}

interface CandFormShape {
  firstName: string; lastName: string; email: string; phone: string;
  currentCompany: string; currentDesignation: string; location: string;
  totalExperience: number | null; noticePeriod: number | null;
  currentCTC: number | null; expectedCTC: number | null;
  source: string;
  linkedinUrl: string; resumeUrl: string;
  skills: string;
  requisitionId: string;
}
type CandFormErrors = Partial<Record<keyof CandFormShape, string>>;

const statusColors: Record<string, string> = {
  New: "bg-[#dcfce7] text-[#16a34a]",
  InPipeline: "bg-yellow-100 text-yellow-700",
  Hired: "bg-green-100 text-green-700",
  CandRejected: "bg-red-100 text-red-700",
  CandOnHold: "bg-orange-100 text-orange-700",
  Withdrawn: "bg-gray-100 text-gray-500",
};

export default function CandidatesPage() {
  const api = useApiClient();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [viewScope, setViewScope] = useState<"active" | "blacklisted" | "archived">("active");
  // Default the Active view to candidates currently in the pipeline; the user
  // can switch to "All statuses" (or any other) from the filter.
  const [statusFilter, setStatusFilter] = useState("InPipeline");
  const [sourceFilter, setSourceFilter] = useState("");
  const [expFilter, setExpFilter] = useState(""); // "min-max" (e.g. "2-5", "10-")
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [blacklistTarget, setBlacklistTarget] = useState<CandidateItem | null>(null);
  const [blacklistForm, setBlacklistForm] = useState({ reason: "", duration: "permanent" as "permanent" | "30" | "90" | "180" | "365" | "custom", customDays: 90 });
  const [archiveTarget, setArchiveTarget] = useState<CandidateItem | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [applyTarget, setApplyTarget] = useState<CandidateItem | null>(null);
  const [applyReqId, setApplyReqId] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<CandidateItem | null>(null);
  const [resumeCtx, setResumeCtx] = useState<{ requisitionTitle: string; heldStage: string; stages: string[] } | null>(null);
  const [resumeStage, setResumeStage] = useState("");
  const [timelineTarget, setTimelineTarget] = useState<CandidateItem | null>(null);
  const emptyForm: CandFormShape = {
    firstName: "", lastName: "", email: "", phone: "",
    currentCompany: "", currentDesignation: "", location: "",
    totalExperience: null, noticePeriod: null,
    currentCTC: null, expectedCTC: null,
    source: "CandDirect",
    linkedinUrl: "", resumeUrl: "",
    skills: "",
    requisitionId: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof emptyForm, string>>>({});

  const isIndiaLocation = /\bindia\b|bengaluru|bangalore|mumbai|delhi|chennai|hyderabad|pune|kolkata|noida|gurgaon|gurugram|ahmedabad|indore|bhopal|jaipur|lucknow|kanpur|surat|kochi/i
    .test(form.location);

  const validate = (requireReq = true) => {
    const e: typeof errors = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    else if (!/^[a-zA-Z. ]{2,}$/.test(form.firstName.trim())) e.firstName = "Letters only, min 2";

    if (!form.lastName.trim()) e.lastName = "Last name is required";
    else if (!/^[a-zA-Z. ]{1,}$/.test(form.lastName.trim())) e.lastName = "Letters only";

    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Invalid email format";

    // Phone — strictly 10 digits. Input is hard-capped at 10 so this catches
    // the "fewer than 10" and "missing" cases.
    if (!form.phone.trim()) {
      e.phone = "Phone is required";
    } else {
      const digits = form.phone.replace(/\D/g, "");
      if (digits.length !== 10) {
        e.phone = "Phone must be exactly 10 digits";
      } else if ((isIndiaLocation || form.location === "") && !/^[6-9]/.test(digits)) {
        e.phone = "Indian mobile must start with 6, 7, 8, or 9";
      }
    }

    if (form.totalExperience != null && form.totalExperience < 0) e.totalExperience = "Cannot be negative";
    if (form.noticePeriod != null && form.noticePeriod < 0) e.noticePeriod = "Cannot be negative";
    // CTC is in LPA (lakhs/yr). Reject negatives and unrealistic 5–6 digit values.
    if (form.currentCTC != null && form.currentCTC < 0) e.currentCTC = "Cannot be negative";
    else if (form.currentCTC != null && form.currentCTC > MAX_CTC_LPA) e.currentCTC = `Enter a realistic value in LPA (max ${MAX_CTC_LPA})`;
    if (form.expectedCTC != null && form.expectedCTC < 0) e.expectedCTC = "Cannot be negative";
    else if (form.expectedCTC != null && form.expectedCTC > MAX_CTC_LPA) e.expectedCTC = `Enter a realistic value in LPA (max ${MAX_CTC_LPA})`;

    if (form.linkedinUrl && !/^https?:\/\//.test(form.linkedinUrl)) e.linkedinUrl = "Must start with http(s)://";
    if (form.resumeUrl && !/^(https?:\/\/|\/)/.test(form.resumeUrl)) e.resumeUrl = "Invalid resume link";

    if (requireReq && !form.requisitionId) e.requisitionId = "Select a requisition for this candidate";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["candidates", search, viewScope, page, statusFilter, sourceFilter, expFilter],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      // When searching, span ALL tabs (Active + Blacklisted + Archived) — the
      // search is not tab-dependent. Tab/status scoping only applies otherwise.
      if (search.trim()) {
        qs.set("search", search);
        qs.set("searchAll", "1");
      } else {
        if (viewScope === "blacklisted") { qs.set("blacklisted", "1"); qs.set("includeArchived", "1"); }
        else if (viewScope === "archived") qs.set("archived", "1");
        // Active view defaults to candidates still in the pipeline — hides Hired
        // and Rejected. An explicit status filter (e.g. "Rejected") overrides this.
        else if (!statusFilter) { qs.set("excludeStatus", "Hired,CandRejected"); qs.set("excludeStage", "Hired"); }
        // Candidate-level status (single value per candidate — unaffected by how
        // many pipelines/applications they're in).
        if (statusFilter && viewScope === "active") qs.set("status", statusFilter);
      }
      if (sourceFilter) qs.set("source", sourceFilter);
      if (expFilter) {
        const [mn, mx] = expFilter.split("-");
        if (mn) qs.set("expMin", mn);
        if (mx) qs.set("expMax", mx);
      }
      return api.get<CandidateItem[]>(`/api/v1/hrms/recruit/candidates?${qs.toString()}`);
    },
  });

  const blacklistMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reason: string; durationDays: number | null } }) =>
      api.post(`/api/v1/hrms/recruit/candidates/${id}/blacklist`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate blacklisted");
      setBlacklistTarget(null);
      setBlacklistForm({ reason: "", duration: "permanent", customDays: 90 });
    },
  });

  const unblacklistMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/recruit/candidates/${id}/blacklist`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate unblacklisted");
    },
  });

  const archiveMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/hrms/recruit/candidates/${id}/archive`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate archived");
      setArchiveTarget(null);
      setArchiveReason("");
    },
  });

  const unarchiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/recruit/candidates/${id}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Restored", "Candidate is back in the pipeline at their previous stage.");
    },
  });

  // Re-engage an archived candidate on a NEW role: un-archive, then apply.
  // Backend enforces the same-role cooling block and returns a soft warning
  // when they were recently rejected for a different role.
  const applyFromArchiveMut = useMutation({
    mutationFn: async ({ id, requisitionId }: { id: string; requisitionId: string }) => {
      await api.delete(`/api/v1/hrms/recruit/candidates/${id}/archive`);
      const res = await api.post<{ warning?: string }>("/api/v1/hrms/recruit/applications", { candidateId: id, requisitionId });
      return res.data?.warning;
    },
    meta: { suppressGlobalError: true },
    onSuccess: (warning) => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Applied to role", "Candidate restored and added to the requisition.");
      if (warning) toast.warning("Recently rejected", warning);
      setApplyTarget(null);
      setApplyReqId("");
    },
    onError: (e: Error) => toast.error("Couldn't apply", e.message),
  });

  // Resume an ON-HOLD candidate at a chosen stage (shows the stage they were held at).
  const openResume = async (c: CandidateItem) => {
    setResumeTarget(c); setResumeCtx(null); setResumeStage("");
    try {
      const res = await api.get<{ requisitionTitle: string; heldStage: string; stages: string[] }>(`/api/v1/hrms/recruit/candidates/${c.id}/resume`);
      if (res.data) { setResumeCtx(res.data); setResumeStage(res.data.heldStage); }
    } catch { /* dialog still opens; stage input falls back to free entry */ }
  };
  const resumeMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.post(`/api/v1/hrms/recruit/candidates/${id}/resume`, { stage }),
    meta: { suppressGlobalError: true },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate resumed", `Back in the pipeline at "${vars.stage}".`);
      setResumeTarget(null); setResumeCtx(null);
    },
    onError: (e: Error) => toast.error("Couldn't resume", e.message),
  });

  const { data: reqsData } = useQuery({
    queryKey: ["requisitions-open"],
    // Fetch all then keep the assignable ones — a requisition is open for
    // candidates once it's ReqApproved or ReqOpen (the route filters a single
    // status, so we filter client-side to include both).
    queryFn: () => api.get<Requisition[]>("/api/v1/hrms/recruit/requisitions?limit=200"),
  });
  const openReqs = (reqsData?.data ?? []).filter((r) => r.status === "ReqOpen" || r.status === "ReqApproved");

  const createMut = useMutation({
    mutationFn: async (body: typeof form) => {
      const payload = {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || undefined,
        currentCompany: body.currentCompany || undefined,
        currentDesignation: body.currentDesignation || undefined,
        location: body.location || undefined,
        totalExperience: body.totalExperience || undefined,
        noticePeriod: body.noticePeriod || undefined,
        currentCTC: body.currentCTC || undefined,
        expectedCTC: body.expectedCTC || undefined,
        source: body.source,
        linkedinUrl: body.linkedinUrl || undefined,
        resumeUrl: body.resumeUrl || undefined,
        skills: body.skills ? body.skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      };
      const created = await api.post<{ id: string }>("/api/v1/hrms/recruit/candidates", payload);
      let warning: string | undefined;
      if (body.requisitionId && created.data?.id) {
        const appRes = await api.post<{ warning?: string }>("/api/v1/hrms/recruit/applications", {
          candidateId: created.data.id,
          requisitionId: body.requisitionId,
        });
        warning = appRes.data?.warning;
      }
      return { warning };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate added", form.requisitionId ? "Linked to requisition." : undefined);
      if (res?.warning) toast.warning("Recently rejected", res.warning);
      setShowCreate(false);
    },
  });

  // Open the same wizard in edit mode, pre-filled from the full candidate record
  // (the list row doesn't carry every field, so fetch the detail).
  const openEdit = async (c: CandidateItem) => {
    setErrors({});
    setEditId(c.id);
    setForm(emptyForm);
    setShowCreate(true);
    try {
      const res = await api.get<{
        firstName: string; lastName: string; email: string; phone: string | null;
        currentCompany: string | null; currentDesignation: string | null; location: string | null;
        totalExperience: number | null; noticePeriod: number | null;
        currentCTC: string | number | null; expectedCTC: string | number | null;
        source: string | null; linkedinUrl: string | null; resumeUrl: string | null;
        skills: unknown;
      }>(`/api/v1/hrms/recruit/candidates/${c.id}`);
      const d = res.data;
      if (!d) return;
      setForm({
        firstName: d.firstName ?? "", lastName: d.lastName ?? "", email: d.email ?? "", phone: d.phone ?? "",
        currentCompany: d.currentCompany ?? "", currentDesignation: d.currentDesignation ?? "", location: d.location ?? "",
        totalExperience: d.totalExperience ?? null, noticePeriod: d.noticePeriod ?? null,
        currentCTC: d.currentCTC != null ? Number(d.currentCTC) : null,
        expectedCTC: d.expectedCTC != null ? Number(d.expectedCTC) : null,
        source: d.source ?? "CandDirect",
        linkedinUrl: d.linkedinUrl ?? "", resumeUrl: d.resumeUrl ?? "",
        skills: Array.isArray(d.skills) ? (d.skills as string[]).join(", ") : "",
        requisitionId: "",
      });
    } catch {
      toast.error("Couldn't load candidate", "Please try again.");
      setShowCreate(false);
      setEditId(null);
    }
  };

  const updateMut = useMutation({
    mutationFn: (body: typeof form) =>
      api.patch(`/api/v1/hrms/recruit/candidates/${editId}`, {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || undefined,
        currentCompany: body.currentCompany || undefined,
        currentDesignation: body.currentDesignation || undefined,
        location: body.location || undefined,
        totalExperience: body.totalExperience ?? undefined,
        noticePeriod: body.noticePeriod ?? undefined,
        currentCTC: body.currentCTC ?? undefined,
        expectedCTC: body.expectedCTC ?? undefined,
        source: body.source,
        linkedinUrl: body.linkedinUrl || undefined,
        resumeUrl: body.resumeUrl || undefined,
        skills: body.skills ? body.skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate updated");
      setShowCreate(false);
      setEditId(null);
    },
  });

  const candidates = data?.data ?? [];

  // Export = the full detail captured on Add Candidate (for the current
  // filtered/searched rows), not just the visible table columns.
  const exportColumns = [
    { header: "First Name", key: "firstName", width: 16 },
    { header: "Last Name", key: "lastName", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Current Designation", key: "designation", width: 20 },
    { header: "Current Company", key: "company", width: 20 },
    { header: "Location", key: "location", width: 18 },
    { header: "Willing to Relocate", key: "relocate", width: 14 },
    { header: "Experience", key: "experience", width: 12 },
    { header: "Current CTC (LPA)", key: "currentCTC", width: 14 },
    { header: "Expected CTC (LPA)", key: "expectedCTC", width: 14 },
    { header: "Notice Period (days)", key: "noticePeriod", width: 14 },
    { header: "Skills", key: "skills", width: 30 },
    { header: "Education", key: "education", width: 34 },
    { header: "Tags", key: "tags", width: 20 },
    { header: "Source", key: "source", width: 14 },
    { header: "LinkedIn", key: "linkedin", width: 28 },
    { header: "Portfolio", key: "portfolio", width: 28 },
    { header: "Resume", key: "resume", width: 28 },
    { header: "Rating", key: "rating", width: 8 },
    { header: "Applied Role", key: "appliedRole", width: 24 },
    { header: "Stage", key: "stage", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Added On", key: "addedOn", width: 14 },
  ];
  const statusLabels: Record<string, string> = {
    New: "New",
    InPipeline: "In Pipeline",
    Hired: "Hired",
    CandRejected: "Rejected",
    CandOnHold: "On Hold",
    Withdrawn: "Withdrawn",
  };
  const exportRows = candidates.map((c) => ({
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    designation: c.currentDesignation ?? "",
    company: c.currentCompany ?? "",
    location: c.location ?? "",
    relocate: c.willingToRelocate ? "Yes" : "No",
    experience: c.totalExperience != null
      ? `${Math.floor(c.totalExperience / 12)}y ${c.totalExperience % 12}m`
      : "",
    currentCTC: c.currentCTC ?? "",
    expectedCTC: c.expectedCTC ?? "",
    noticePeriod: c.noticePeriod ?? "",
    skills: Array.isArray(c.skills) ? c.skills.join(", ") : "",
    education: Array.isArray(c.education)
      ? c.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(" · ")).join("; ")
      : "",
    tags: Array.isArray(c.tags) ? c.tags.join(", ") : "",
    source: c.source ? c.source.replace("Cand", "") : "",
    linkedin: c.linkedinUrl ?? "",
    portfolio: c.portfolioUrl ?? "",
    resume: c.resumeUrl ?? "",
    rating: c.rating != null ? `${c.rating}/5` : "",
    appliedRole: c.applications[0]?.requisition?.title ?? "",
    stage: c.applications[0]?.currentStage ?? "",
    status: statusLabels[c.status] ?? c.status.replace("Cand", ""),
    addedOn: c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "",
  }));

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-page-title text-gray-900">Candidates</h1>
        <div className="flex items-center gap-2">
          <ExcelExportButton filename="candidates" columns={exportColumns} rows={exportRows} />
          <button onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 btn bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50">
            <Upload size={13} /> Bulk Add
          </button>
          <button onClick={() => { setForm(emptyForm); setErrors({}); setShowCreate(true); }}
            className="flex items-center gap-2 btn bg-green-600 hover:bg-green-700 text-white">
            <Plus size={13} /> Add Candidate
          </button>
        </div>
      </div>

      <div className="mb-4">
        <FilterBar>
          <div className="inline-flex items-center bg-gray-100 rounded-md p-0.5">
            {([
              { k: "active", label: "Active", icon: <User size={13} /> },
              { k: "blacklisted", label: "Blacklisted", icon: <Ban size={13} /> },
              { k: "archived", label: "Archived", icon: <Archive size={13} /> },
            ] as const).map((v) => (
              <button key={v.k}
                onClick={() => setViewScope(v.k)}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded transition",
                  viewScope === v.k ? "bg-white text-green-700 shadow-sm" : "text-gray-500 hover:text-gray-800")}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <FilterDivider />
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            size="sm"
            className="w-40"
            placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              { value: "New", label: "New" },
              { value: "InPipeline", label: "In Pipeline" },
              { value: "Hired", label: "Hired" },
              { value: "CandOnHold", label: "On Hold" },
              { value: "CandRejected", label: "Rejected" },
              { value: "Withdrawn", label: "Withdrawn" },
            ]}
          />
          <Select
            value={sourceFilter}
            onChange={(v) => { setSourceFilter(v); setPage(1); }}
            size="sm"
            className="w-40"
            placeholder="All sources"
            options={[
              { value: "", label: "All sources" },
              { value: "CandJobPortal", label: "Job Portal" },
              { value: "CandLinkedIn", label: "LinkedIn" },
              { value: "CandNaukri", label: "Naukri" },
              { value: "CandIndeed", label: "Indeed" },
              { value: "CandReferral", label: "Referral" },
              { value: "CandAgency", label: "Agency" },
              { value: "CandCareerPage", label: "Career Page" },
              { value: "CandCampus", label: "Campus" },
              { value: "CandDirect", label: "Direct" },
              { value: "CandInbound", label: "Inbound" },
            ]}
          />
          <Select
            value={expFilter}
            onChange={(v) => { setExpFilter(v); setPage(1); }}
            size="sm"
            className="w-40"
            placeholder="Any experience"
            options={[
              { value: "", label: "Any experience" },
              { value: "0-2", label: "0–2 yrs" },
              { value: "2-5", label: "2–5 yrs" },
              { value: "5-10", label: "5–10 yrs" },
              { value: "10-", label: "10+ yrs" },
            ]}
          />
          {(statusFilter || sourceFilter || expFilter) && (
            <button
              type="button"
              onClick={() => { setStatusFilter(""); setSourceFilter(""); setExpFilter(""); setPage(1); }}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md hover:bg-gray-100"
            >
              <X size={12} /> Clear
            </button>
          )}
          <FilterDivider />
          <FilterSearch value={search} onChange={setSearch} placeholder="Search candidates..." />
        </FilterBar>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-2"><SkeletonTable rows={8} cols={7} /></div> : candidates.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><User size={32} className="mx-auto mb-2 text-gray-300" />No candidates</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Candidate</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Current</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Experience</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Source</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Status</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const blUntil = c.blacklistedUntil ? new Date(c.blacklistedUntil) : null;
                const blExpired = blUntil ? blUntil.getTime() < Date.now() : false;
                return (
                <tr key={c.id} onClick={() => router.push(`/recruit/candidates/${c.id}`)} className={clsx("row-stagger border-b border-gray-100 hover:bg-gray-50 cursor-pointer",
                  c.isBlacklisted && !blExpired && "bg-red-50/40",
                  c.isArchived && "opacity-70")} style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className={clsx("shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold", avatarColor(c.id))}>
                        {`${c.firstName?.[0] ?? ""}${c.lastName?.[0] ?? ""}`.toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/recruit/candidates/${c.id}`} className="text-[13px] font-semibold text-gray-900 hover:text-green-700 hover:underline">
                          {c.firstName} {c.lastName}
                        </Link>
                        <p className="text-[11px] text-gray-500 truncate">{c.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {c.isBlacklisted && !blExpired && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 text-red-600 ring-1 ring-red-200" title={c.blacklistReason ?? ""}>
                              <Ban size={11} /> Blacklisted
                            </span>
                          )}
                          {c.isBlacklisted && blExpired && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                              <Clock size={11} /> Expired
                            </span>
                          )}
                          {c.isArchived && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                              <Archive size={11} /> Archived
                            </span>
                          )}
                        </div>
                        {c.isBlacklisted && c.blacklistReason && (
                          <p className="text-[10px] text-red-600 mt-0.5 italic">
                            {c.blacklistReason}
                            {blUntil && !blExpired && (
                              <> · until {blUntil.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
                            )}
                            {!blUntil && c.isBlacklisted && <> · permanent</>}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {c.currentDesignation && <p className="font-semibold text-gray-900">{c.currentDesignation}</p>}
                    {c.currentCompany && <p className="text-[11px] text-gray-500">{c.currentCompany}</p>}
                    {!c.currentDesignation && !c.currentCompany && "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {c.totalExperience ? `${Math.floor(c.totalExperience / 12)}y ${c.totalExperience % 12}m` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                      {/linkedin/i.test(c.source)
                        ? <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-[3px] bg-[#0a66c2] text-white text-[9px] font-bold leading-none">in</span>
                        : <Globe size={14} className="text-gray-400" />}
                      {c.source.replace("Cand", "")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusCell status={c.status} stage={c.applications[0]?.currentStage ?? null} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <div className="inline-flex items-center rounded-xl ring-1 ring-gray-200 bg-white divide-x divide-gray-100 overflow-hidden">
                        <ActionBtn icon={<Clock size={15} />} label="Timeline" color="text-green-600" onClick={() => setTimelineTarget(c)} title="View timeline" />
                        {/* Only active candidates are editable — blacklisted/archived are read-only. */}
                        {!c.isBlacklisted && !c.isArchived && (
                          <ActionBtn icon={<Pencil size={15} />} label="Edit" color="text-blue-600" onClick={() => openEdit(c)} title="Edit candidate" />
                        )}
                        {c.isBlacklisted ? (
                          <ActionBtn icon={<RotateCcw size={15} />} label="Unblock" color="text-emerald-600" onClick={() => unblacklistMut.mutate(c.id)} title="Lift blacklist" />
                        ) : (
                          <ActionBtn icon={<Ban size={15} />} label="Blacklist" color="text-red-600" onClick={() => { setBlacklistForm({ reason: "", duration: "permanent", customDays: 90 }); setBlacklistTarget(c); }} title="Blacklist candidate" />
                        )}
                        {c.isArchived ? (
                          <>
                            {c.status === "CandOnHold" ? (
                              <ActionBtn icon={<RotateCcw size={15} />} label="Resume" color="text-amber-600" onClick={() => openResume(c)} title="Resume from hold — pick a stage" />
                            ) : (
                              <ActionBtn icon={<ArchiveRestore size={15} />} label="Restore" color="text-slate-600" onClick={() => unarchiveMut.mutate(c.id)} title="Restore to the same stage" />
                            )}
                            <ActionBtn icon={<UserPlus size={15} />} label="Apply to role" color="text-green-600" onClick={() => { setApplyReqId(""); setApplyTarget(c); }} title="Restore and apply to a role" />
                          </>
                        ) : (
                          <ActionBtn icon={<Archive size={15} />} label="Archive" color="text-slate-600" onClick={() => { setArchiveReason(""); setArchiveTarget(c); }} title="Archive candidate" />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CandidateBulkImport
        open={showBulk}
        onClose={() => setShowBulk(false)}
        requisitions={openReqs}
        onDone={() => qc.invalidateQueries({ queryKey: ["candidates"] })}
      />

      <Modal open={!!resumeTarget} onClose={() => setResumeTarget(null)} title="Resume from hold" size="md">
        {resumeTarget && (
          <form onSubmit={(e) => { e.preventDefault(); if (resumeStage) resumeMut.mutate({ id: resumeTarget.id, stage: resumeStage }); }} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
              <p className="font-semibold text-amber-900">{resumeTarget.firstName} {resumeTarget.lastName}</p>
              {resumeCtx ? (
                <p className="text-amber-800 mt-1">On hold for <strong>{resumeCtx.requisitionTitle}</strong> · was at stage <strong>{resumeCtx.heldStage}</strong>.</p>
              ) : (
                <p className="text-amber-800 mt-1">Loading their held application…</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Move to stage <span className="text-red-500">*</span></label>
              <Select value={resumeStage} onChange={setResumeStage}
                placeholder="Select a stage"
                options={(resumeCtx?.stages ?? []).map((s) => ({ value: s, label: s === resumeCtx?.heldStage ? `${s} (was here)` : s }))} />
              <p className="mt-1 text-[11px] text-gray-400">Defaults to the stage they were held at. You can move them to any stage.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setResumeTarget(null)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={!resumeStage || resumeMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                <RotateCcw size={13} /> {resumeMut.isPending ? "Resuming..." : "Resume to pipeline"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }}
        title={editId ? "Edit Candidate" : "Add Candidate"} size="3xl"
        subtitle={editId ? "Update candidate details." : "Add candidate details and apply to requisitions."}
        headerIcon={<User size={18} />}>
        <CandidateWizard
          form={form}
          setForm={setForm}
          errors={errors}
          isIndiaLocation={isIndiaLocation}
          openReqs={openReqs}
          editMode={!!editId}
          submitting={editId ? updateMut.isPending : createMut.isPending}
          onCancel={() => { setShowCreate(false); setEditId(null); }}
          onSubmit={() => { if (validate(!editId)) (editId ? updateMut : createMut).mutate(form); }}
        />
      </Modal>

      <Modal open={!!blacklistTarget} onClose={() => setBlacklistTarget(null)} title="Blacklist Candidate" size="md">
        {blacklistTarget && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const reason = blacklistForm.reason.trim();
            if (!reason) { toast.error("Reason required"); return; }
            const days = blacklistForm.duration === "permanent" ? null
              : blacklistForm.duration === "custom" ? Math.max(1, Number(blacklistForm.customDays) || 0)
              : Number(blacklistForm.duration);
            blacklistMut.mutate({ id: blacklistTarget.id, body: { reason, durationDays: days } });
          }} className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <ShieldX size={14} className="text-red-600" />
                <span className="font-semibold text-red-900">{blacklistTarget.firstName} {blacklistTarget.lastName}</span>
              </div>
              <p className="text-xs text-red-700">
                Blacklisted candidates are hidden from active searches, marked <code>doNotContact</code>, and cannot be applied to any requisition.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea rows={3} value={blacklistForm.reason}
                onChange={(e) => setBlacklistForm({ ...blacklistForm, reason: e.target.value })}
                placeholder="e.g. Fake credentials, no-show for multiple interviews..."
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Duration</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { k: "30", label: "1 month" },
                  { k: "90", label: "3 months" },
                  { k: "180", label: "6 months" },
                  { k: "365", label: "1 year" },
                  { k: "custom", label: "Custom" },
                  { k: "permanent", label: "Permanent" },
                ] as const).map((o) => (
                  <button key={o.k} type="button"
                    onClick={() => setBlacklistForm({ ...blacklistForm, duration: o.k })}
                    className={clsx("px-3 py-2 rounded-lg text-xs font-semibold border transition",
                      blacklistForm.duration === o.k
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-red-300")}>
                    {o.label}
                  </button>
                ))}
              </div>
              {blacklistForm.duration === "custom" && (
                <div className="mt-2 flex items-center gap-2">
                  <NumberInput allowDecimal={false} min={1} value={blacklistForm.customDays}
                    onChange={(v) => setBlacklistForm({ ...blacklistForm, customDays: Math.max(1, v ?? 1) })}
                    className="w-24 border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                  <span className="text-xs text-gray-600">days</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setBlacklistTarget(null)}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={blacklistMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                <Ban size={13} /> {blacklistMut.isPending ? "Blacklisting..." : "Blacklist"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Candidate" size="md">
        {archiveTarget && (
          <form onSubmit={(e) => {
            e.preventDefault();
            archiveMut.mutate({ id: archiveTarget.id, reason: archiveReason.trim() });
          }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Archive size={14} className="text-slate-600" />
                <span className="font-semibold text-slate-900">{archiveTarget.firstName} {archiveTarget.lastName}</span>
              </div>
              <p className="text-xs text-slate-600">
                Archived candidates are hidden from default views but can be restored anytime.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={3} value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Position closed, candidate ghosted, not a fit right now..."
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setArchiveTarget(null)}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={archiveMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                <Archive size={13} /> {archiveMut.isPending ? "Archiving..." : "Archive"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!applyTarget} onClose={() => setApplyTarget(null)} title="Apply to a role" size="md">
        {applyTarget && (
          <form onSubmit={(e) => { e.preventDefault(); if (applyReqId) applyFromArchiveMut.mutate({ id: applyTarget.id, requisitionId: applyReqId }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <span className="font-semibold text-slate-900">{applyTarget.firstName} {applyTarget.lastName}</span>
              <p className="text-slate-600 mt-1">This restores the candidate from archive and applies them to the selected role.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Requisition <span className="text-red-500">*</span></label>
              <RequisitionPicker value={applyReqId} onChange={setApplyReqId} requisitions={openReqs} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setApplyTarget(null)}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={!applyReqId || applyFromArchiveMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                <Briefcase size={13} /> {applyFromArchiveMut.isPending ? "Applying..." : "Apply to role"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {timelineTarget && (
        <CandidateTimelineModal candidate={timelineTarget} onClose={() => setTimelineTarget(null)} />
      )}
    </div>
  );
}

interface TimelineResponse {
  candidate: {
    id: string; name: string; email: string; status: string;
    isBlacklisted: boolean; blacklistReason: string | null;
    blacklistedAt: string | null; blacklistedUntil: string | null;
    isArchived: boolean; archivedAt: string | null; createdAt: string;
  };
  entries: Array<{
    id: string;
    kind: string;
    title: string;
    description?: string | null;
    actor?: { id: string; name: string; jobTitle?: string | null } | null;
    at: string;
  }>;
}

const KIND_META: Record<string, { cls: string; dot: string; icon: React.ReactNode }> = {
  CandidateCreated:      { cls: "bg-[#dcfce7] text-[#16a34a]", dot: "bg-[#22c55e]", icon: <User size={11} /> },
  CandidateUpdated:      { cls: "bg-slate-100 text-slate-700", dot: "bg-slate-500", icon: <User size={11} /> },
  ApplicationCreated:    { cls: "bg-[#dcfce7] text-[#16a34a]", dot: "bg-[#22c55e]", icon: <FileText size={11} /> },
  StageChanged:          { cls: "bg-green-50 text-green-700", dot: "bg-green-500", icon: <ChevronDown size={11} /> },
  InterviewScheduled:    { cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500", icon: <Briefcase size={11} /> },
  InterviewCompleted:    { cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500", icon: <Check size={11} /> },
  FeedbackSubmitted:     { cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: <Check size={11} /> },
  OfferCreated:          { cls: "bg-purple-50 text-purple-700", dot: "bg-purple-500", icon: <FileText size={11} /> },
  OfferSent:             { cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500", icon: <FileText size={11} /> },
  ApplicationRejected:   { cls: "bg-red-50 text-red-700", dot: "bg-red-500", icon: <ShieldX size={11} /> },
  ApplicationHired:      { cls: "bg-green-50 text-green-700", dot: "bg-green-500", icon: <Rocket size={11} /> },
  Blacklisted:           { cls: "bg-red-50 text-red-700", dot: "bg-red-600", icon: <Ban size={11} /> },
  Unblacklisted:         { cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: <RotateCcw size={11} /> },
  Archived:              { cls: "bg-slate-50 text-slate-700", dot: "bg-slate-500", icon: <Archive size={11} /> },
  Unarchived:            { cls: "bg-slate-50 text-slate-700", dot: "bg-slate-500", icon: <ArchiveRestore size={11} /> },
};

function CandidateTimelineModal({ candidate, onClose }: { candidate: CandidateItem; onClose: () => void }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["candidate-timeline", candidate.id],
    queryFn: () => api.get<TimelineResponse>(`/api/v1/hrms/recruit/candidates/${candidate.id}/timeline`),
  });
  const res = data?.data;
  const blUntil = res?.candidate.blacklistedUntil ? new Date(res.candidate.blacklistedUntil) : null;
  const blDays = res?.candidate.blacklistedAt && blUntil
    ? Math.max(0, Math.ceil((blUntil.getTime() - new Date(res.candidate.blacklistedAt).getTime()) / 86400_000))
    : null;
  const blRemaining = blUntil ? Math.max(0, Math.ceil((blUntil.getTime() - Date.now()) / 86400_000)) : null;

  return (
    <Modal open={true} onClose={onClose} title="Candidate Timeline" size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-slate-900">{candidate.firstName} {candidate.lastName}</p>
              <p className="text-xs text-slate-500">{candidate.email}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {res?.candidate.isBlacklisted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 ring-1 ring-red-200">
                  <Ban size={10} /> Blacklisted
                  {blDays !== null && <> · {blDays}d {blRemaining !== null && blRemaining > 0 ? `(${blRemaining}d left)` : "(expired)"}</>}
                  {blDays === null && <> · permanent</>}
                </span>
              )}
              {res?.candidate.isArchived && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                  <Archive size={10} /> Archived
                </span>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shimmer rounded-full w-6 h-6 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonLine w="60%" h={10} />
                  <SkeletonLine w="85%" h={8} />
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
          <div className="relative max-h-[55vh] overflow-y-auto pr-2">
            <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-200" />
            <ul className="space-y-3">
              {res.entries.map((e) => {
                const meta = KIND_META[e.kind] ?? KIND_META.CandidateUpdated;
                return (
                  <li key={e.id} className="relative pl-9">
                    <span className={clsx("absolute left-0 top-1 w-7 h-7 rounded-full ring-4 ring-white flex items-center justify-center text-white shadow-sm", meta.dot)}>
                      {meta.icon}
                    </span>
                    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-slate-900">{e.title}</p>
                        <span className="text-[11px] text-slate-400">
                          {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                      {e.description && (
                        <p className="text-xs text-slate-600 mt-1">{e.description}</p>
                      )}
                      {e.actor && (
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          by <span className="font-medium text-slate-700">{e.actor.name}</span>
                          {e.actor.jobTitle && <> · {e.actor.jobTitle}</>}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}

const STAGE_STYLE: Record<string, { dot: string; text: string; bg: string; ring: string }> = {
  Applied:     { dot: "bg-slate-400",   text: "text-slate-700",   bg: "bg-slate-50",   ring: "ring-slate-200" },
  Screening:   { dot: "bg-[#dcfce7]0",    text: "text-[#16a34a]",    bg: "bg-[#dcfce7]",    ring: "ring-[#bbf7d0]" },
  Shortlisted: { dot: "bg-cyan-500",    text: "text-cyan-700",    bg: "bg-cyan-50",    ring: "ring-cyan-200" },
  Interview:   { dot: "bg-[#dcfce7]0",  text: "text-[#16a34a]",  bg: "bg-[#dcfce7]",  ring: "ring-[#22c55e]" },
  Assessment:  { dot: "bg-violet-500",  text: "text-violet-700",  bg: "bg-violet-50",  ring: "ring-violet-200" },
  Offer:       { dot: "bg-amber-500",   text: "text-amber-800",   bg: "bg-amber-50",   ring: "ring-amber-200" },
  Hired:       { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  Rejected:    { dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50",     ring: "ring-red-200" },
  OnHold:      { dot: "bg-orange-500",  text: "text-orange-700",  bg: "bg-orange-50",  ring: "ring-orange-200" },
};

function stageStyle(stage: string | null) {
  if (!stage) return STAGE_STYLE.Applied;
  const key = Object.keys(STAGE_STYLE).find((k) => stage.toLowerCase().includes(k.toLowerCase()));
  return STAGE_STYLE[key ?? "Applied"];
}

// Deterministic avatar colour per candidate so the same person keeps their hue.
const AVATAR_COLORS = [
  "bg-purple-100 text-purple-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-pink-100 text-pink-700", "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700", "bg-rose-100 text-rose-700",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// One button in the grouped row-action bar: icon on top, coloured label below.
function ActionBtn({ icon, label, color, onClick, title }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="flex flex-col items-center justify-center gap-1 w-[72px] py-2 hover:bg-gray-50 transition">
      <span className={color}>{icon}</span>
      <span className={clsx("text-[11px] font-medium leading-none", color)}>{label}</span>
    </button>
  );
}

function StatusCell({ status, stage }: { status: string; stage: string | null }) {
  const cleanStatus = status.replace("Cand", "");
  const s = stageStyle(stage);
  return (
    <div className="flex flex-col gap-1.5">
      {stage ? (
        <span className={clsx("inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md text-[11px] font-medium ring-1", s.bg, s.text, s.ring)}>
          <span className={clsx("w-1.5 h-1.5 rounded-full", s.dot)} />
          {stage}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md text-[11px] font-medium ring-1 bg-slate-50 text-slate-500 ring-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
          Not applied
        </span>
      )}
      <span className={clsx("inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide", statusColors[status])}>
        {cleanStatus}
      </span>
    </div>
  );
}

const inputClass = "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500";
const errInput = "border-red-400 focus:ring-red-400 focus:border-red-400";

function inp(hasError: boolean) {
  return clsx(inputClass, hasError && errInput);
}

function Field({
  label, required, icon, children, error,
}: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-xs font-medium text-gray-800 mb-1.5">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

interface SourceOption {
  value: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  { value: "CandDirect",     label: "Walked In",    desc: "Walked in / in person",     icon: <User size={14} />,          color: "text-slate-600 bg-slate-100" },
  { value: "CandNaukri",     label: "Naukri",       desc: "Naukri.com",                icon: <Globe size={14} />,         color: "text-green-700 bg-green-100" },
  { value: "CandIndeed",     label: "Indeed",       desc: "Indeed.com",                icon: <Globe size={14} />,         color: "text-green-700 bg-green-100" },
  { value: "CandLinkedIn",   label: "LinkedIn",     desc: "LinkedIn profile/outreach", icon: <Link2 size={14} />,         color: "text-sky-700 bg-sky-100" },
  { value: "CandJobPortal",  label: "Job Portal",   desc: "Other job portal",          icon: <Globe size={14} />,         color: "text-emerald-700 bg-emerald-100" },
  { value: "CandReferral",   label: "Referral",     desc: "Employee referral",         icon: <UsersIcon size={14} />,     color: "text-amber-700 bg-amber-100" },
  { value: "CandAgency",     label: "Agency",       desc: "Recruitment agency",        icon: <Landmark size={14} />,      color: "text-violet-700 bg-violet-100" },
  { value: "CandCareerPage", label: "Career Page",  desc: "Company careers site",      icon: <Rocket size={14} />,        color: "text-[#16a34a] bg-[#dcfce7]" },
  { value: "CandCampus",     label: "Campus",       desc: "College placement drive",   icon: <GraduationCap size={14} />, color: "text-green-700 bg-green-100" },
];

function SourceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = SOURCE_OPTIONS.find((o) => o.value === value) ?? SOURCE_OPTIONS[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-[var(--border)] rounded-lg px-3 py-2 text-xs bg-white hover:border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-500 transition"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={clsx("inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0", selected.color)}>
            {selected.icon}
          </span>
          <span className="font-medium text-gray-800 truncate">{selected.label}</span>
        </span>
        <ChevronDown size={14} className={clsx("text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 max-h-72 overflow-auto animate-in fade-in zoom-in-95 duration-150">
          {SOURCE_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition",
                  active ? "bg-[#dcfce7]" : "hover:bg-gray-50",
                )}
              >
                <span className={clsx("inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0", opt.color)}>
                  {opt.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={clsx("block text-xs font-medium truncate", active ? "text-[#16a34a]" : "text-gray-800")}>
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">{opt.desc}</span>
                </span>
                {active && <Check size={14} className="text-[#22c55e] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Rich Requisition Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const priorityStyle: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  Urgent: { bg: "bg-red-50 text-red-700 ring-red-200", text: "Urgent", icon: <Flame size={10} /> },
  High: { bg: "bg-orange-50 text-orange-700 ring-orange-200", text: "High", icon: <AlertCircle size={10} /> },
  Medium: { bg: "bg-[#dcfce7] text-[#16a34a] ring-[#bbf7d0]", text: "Medium", icon: null },
  Low: { bg: "bg-slate-50 text-slate-600 ring-slate-200", text: "Low", icon: null },
};

const deptTint: Record<string, string> = {
  engineering: "from-[#86efac] to-[#16a34a]",
  design: "from-pink-400 to-purple-500",
  sales: "from-amber-400 to-orange-500",
  marketing: "from-purple-400 to-green-500",
  finance: "from-emerald-400 to-green-500",
  "human resources": "from-sky-400 to-green-500",
  hr: "from-sky-400 to-green-500",
  operations: "from-cyan-400 to-sky-500",
  default: "from-gray-300 to-gray-400",
};

function tintFor(dept?: string | null): string {
  if (!dept) return deptTint.default;
  return deptTint[dept.toLowerCase()] ?? deptTint.default;
}

function RequisitionPicker({
  value, onChange, requisitions, error,
}: { value: string; onChange: (id: string) => void; requisitions: Requisition[]; error?: boolean }) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  const selected = requisitions.find((r) => r.id === value) ?? null;

  const filtered = requisitions.filter((r) => {
    if (priorityFilter && r.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.title} ${r.requisitionNumber} ${r.department?.name ?? ""} ${r.employmentType}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
          "focus:outline-none focus:ring-1 focus:ring-green-500/30 focus:border-green-500",
          open && "border-[#22c55e] ring-2 ring-[#22c55e]/20",
          error ? "border-red-300" : "border-gray-300 hover:border-gray-400",
        )}
      >
        {selected ? (
          <>
            <div className={clsx("w-1 self-stretch rounded-full bg-gradient-to-b", tintFor(selected.department?.name))} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{selected.title}</p>
                {priorityStyle[selected.priority] && (
                  <span className={clsx("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1", priorityStyle[selected.priority].bg)}>
                    {priorityStyle[selected.priority].icon}
                    {priorityStyle[selected.priority].text}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                <span className="font-mono">{selected.requisitionNumber}</span>
                {selected.department && <><span>·</span><span>{selected.department.name}</span></>}
                <span>·</span>
                <span>{selected.filledPositions}/{selected.positions} filled</span>
                <span>·</span>
                <span>{selected.employmentType}</span>
              </div>
            </div>
            {/* Clear: rendered as a <span> (not <button>) so we don't nest
                button-in-button — invalid HTML that triggers a hydration error. */}
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear requisition"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="inline-flex p-1 text-gray-400 hover:text-gray-700 rounded cursor-pointer"
            >
              <X size={14} />
            </span>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#dcfce7] to-[#bbf7d0] flex items-center justify-center">
              <Briefcase size={14} className="text-[#16a34a]" />
            </div>
            <span className="flex-1 text-xs text-gray-400">Select a requisition to apply to…</span>
          </>
        )}
        <ChevronDown size={16} className={clsx("text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, req #, department…"
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-1">Priority</span>
              {["", "Urgent", "High", "Medium", "Low"].map((p) => {
                const active = priorityFilter === p;
                const label = p || "All";
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPriorityFilter(p)}
                    className={clsx(
                      "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium border transition",
                      active
                        ? "bg-[#22c55e] border-[#22c55e] text-white"
                        : "bg-white border-gray-200 text-gray-600 hover:border-[#bbf7d0]",
                    )}
                  >
                    {p && priorityStyle[p]?.icon}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-10 text-center">
                <Briefcase size={22} className="mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-400">No matching open requisitions</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-accent-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Requisition</th>
                    <th className="px-4 py-2.5 font-semibold">Department</th>
                    <th className="px-4 py-2.5 font-semibold">Employment Type</th>
                    <th className="px-4 py-2.5 font-semibold">Openings</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => {
                    const isSelected = r.id === value;
                    const full = r.filledPositions >= r.positions;
                    const tint = tintFor(r.department?.name);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => { onChange(r.id); setOpen(false); }}
                        className={clsx("cursor-pointer transition", isSelected ? "bg-[#f0fdf4]" : "hover:bg-gray-50")}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-stretch gap-2.5">
                            <div className={clsx("w-1 rounded-full bg-gradient-to-b shrink-0", tint)} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={clsx("text-[13px] font-semibold truncate", isSelected ? "text-[#166534]" : "text-gray-900")}>{r.title}</span>
                                {priorityStyle[r.priority] && (
                                  <span className={clsx("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 whitespace-nowrap", priorityStyle[r.priority].bg)}>
                                    {priorityStyle[r.priority].icon}
                                    {priorityStyle[r.priority].text}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                                <span className="font-mono text-gray-400">{r.requisitionNumber}</span>
                                <span>·</span>
                                <span>{r.workLocation}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-600">{r.department?.name ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-[11px] font-semibold">{r.employmentType}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={clsx("text-[13px] font-semibold", (r._count?.applications ?? 0) > 0 ? "text-amber-600" : "text-[#16a34a]")}>{r._count?.applications ?? 0} applied</span>
                          <span className={clsx("block text-[11px]", full ? "text-red-600 font-semibold" : "text-gray-400")}>{r.filledPositions}/{r.positions} filled</span>
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {isSelected ? <Check size={16} className="text-[#16a34a] inline" /> : <ChevronRight size={15} className="text-gray-300 inline" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-[11px] text-gray-500">
            <span>{filtered.length} of {requisitions.length} open</span>
            <span className="text-gray-400">Only <strong className="text-gray-600">Open</strong> requisitions shown</span>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Add Candidate Wizard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface WizardProps {
  form: CandFormShape;
  setForm: Dispatch<SetStateAction<CandFormShape>>;
  errors: CandFormErrors;
  isIndiaLocation: boolean;
  openReqs: Requisition[];
  submitting: boolean;
  editMode?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

const WIZARD_STEPS = [
  { id: "personal",       num: 1, title: "Personal Details",     subtitle: "Basic contact information",  icon: <User size={16} /> },
  { id: "professional",   num: 2, title: "Professional Details", subtitle: "Work experience & skills",   icon: <Briefcase size={16} /> },
  { id: "links",          num: 3, title: "Links & Resume",       subtitle: "Links to profiles & resume", icon: <Link2 size={16} /> },
  { id: "requisition",    num: 4, title: "Apply to Requisition", subtitle: "Select job to apply",        icon: <Building2 size={16} /> },
] as const;

function CandidateWizard({ form, setForm, errors, isIndiaLocation, openReqs, submitting, editMode, onCancel, onSubmit }: WizardProps) {
  const [step, setStep] = useState(0);
  // Editing an existing candidate doesn't re-apply to a requisition, so drop
  // that last step in edit mode.
  const steps = editMode ? WIZARD_STEPS.slice(0, 3) : WIZARD_STEPS;

  // After the parent runs validate() on Save, jump to the earliest step with an error.
  useEffect(() => {
    const map: Record<string, number> = {
      firstName: 0, lastName: 0, email: 0, phone: 0,
      totalExperience: 1, noticePeriod: 1, currentCTC: 1, expectedCTC: 1,
      linkedinUrl: 2, resumeUrl: 2, requisitionId: 3,
    };
    const idxs = Object.keys(errors).map((k) => map[k]).filter((n) => n !== undefined) as number[];
    if (idxs.length) setStep(Math.min(...idxs));
  }, [errors]);

  const canPersonal = !!(form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim());
  const canAdvance = step === 0 ? canPersonal : true;
  const canSave = canPersonal && (editMode || !!form.requisitionId);
  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="w-full">
      {/* Stepper */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const done = i < step; const active = i === step;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => setStep(i)} className="flex items-center gap-2">
                <span className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition shrink-0",
                  done ? "bg-green-600 text-white" : active ? "bg-green-600 text-white ring-4 ring-green-100" : "bg-gray-200 text-gray-500")}>
                  {done ? <Check size={13} /> : s.num}
                </span>
                <span className={clsx("text-sm font-medium whitespace-nowrap", active ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400")}>{s.title}</span>
              </button>
              {i < steps.length - 1 && <span className={clsx("w-8 h-px mx-1", done ? "bg-green-500" : "bg-gray-200")} />}
            </div>
          );
        })}
      </div>

      <div className="min-h-[280px]">
        {step === 0 && (
          <section>
            <SectionHeader icon={<User size={18} />} title="Personal Details" subtitle="Basic contact information of the candidate." />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="First Name" required error={errors.firstName}>
                <input type="text" placeholder="Enter first name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inp(!!errors.firstName)} />
              </Field>
              <Field label="Last Name" required error={errors.lastName}>
                <input type="text" placeholder="Enter last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inp(!!errors.lastName)} />
              </Field>
              <Field label="Email" required error={errors.email}>
                <input type="email" placeholder="Enter email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp(!!errors.email)} />
              </Field>
              <Field label="Phone (10-digit)" required error={errors.phone}>
                <input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="9876543210" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className={inp(!!errors.phone)} />
              </Field>
              <Field label="Location" icon={<MapPin size={12} />}>
                <input type="text" placeholder="Bengaluru" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Source">
                <SourceSelect value={form.source} onChange={(v) => setForm({ ...form, source: v })} />
              </Field>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <SectionHeader icon={<Briefcase size={18} />} title="Professional Details" subtitle="Professional information and experience." />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Current Company">
                <input type="text" placeholder="Enter current company" value={form.currentCompany} onChange={(e) => setForm({ ...form, currentCompany: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Current Designation">
                <input type="text" placeholder="Enter current designation" value={form.currentDesignation} onChange={(e) => setForm({ ...form, currentDesignation: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Experience (months)">
                <NumberInput min={0} allowDecimal={false} value={form.totalExperience} onChange={(v) => setForm({ ...form, totalExperience: v })} className={inputClass} />
              </Field>
              <Field label="Notice Period (days)">
                <NumberInput min={0} allowDecimal={false} value={form.noticePeriod} onChange={(v) => setForm({ ...form, noticePeriod: v })} className={inputClass} />
              </Field>
              <Field label="Current CTC (LPA)" icon={<IndianRupee size={12} />} error={errors.currentCTC}>
                <NumberInput clamp min={0} max={MAX_CTC_LPA} value={form.currentCTC}
                  onChange={(v) => setForm({ ...form, currentCTC: v })}
                  className={inputClass} />
              </Field>
              <Field label="Expected CTC (LPA)" icon={<IndianRupee size={12} />} error={errors.expectedCTC}>
                <NumberInput clamp min={0} max={MAX_CTC_LPA} value={form.expectedCTC}
                  onChange={(v) => setForm({ ...form, expectedCTC: v })}
                  className={inputClass} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Skills (comma separated)">
                <input type="text" placeholder="React, Node.js, AWS, Leadership, etc." value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className={inputClass} />
              </Field>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <SectionHeader icon={<Link2 size={18} />} title="Links & Resume" subtitle="Professional links and resume upload." />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="LinkedIn URL" icon={<Link2 size={12} />} error={errors.linkedinUrl}>
                <input type="url" placeholder="https://linkedin.com/in/username" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} className={inp(!!errors.linkedinUrl)} />
              </Field>
              <Field label="Resume" required error={errors.resumeUrl}>
                <FileUploadInput value={form.resumeUrl} onChange={(url) => setForm({ ...form, resumeUrl: url })}
                  accept="application/pdf,.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  label="" placeholder="Upload resume (PDF / DOCX, max 5MB)" />
              </Field>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <SectionHeader icon={<Building2 size={18} />} title="Apply to Requisition" subtitle="Choose a job requisition to apply this candidate." />
            <div className="mt-3">
              <RequisitionPicker value={form.requisitionId} onChange={(v) => setForm({ ...form, requisitionId: v })} requisitions={openReqs} error={!!errors.requisitionId} />
              {errors.requisitionId
                ? <p className="mt-1.5 text-[11px] text-red-600">{errors.requisitionId}</p>
                : form.requisitionId
                  ? <p className="mt-1.5 text-[11px] text-green-700">Candidate will enter pipeline at first stage.</p>
                  : <p className="mt-1.5 text-[11px] text-gray-400">No open requisitions? Create one under Recruit &rarr; Requisitions.</p>}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="inline-flex items-center h-10 px-3 rounded-[14px] border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={back} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[14px] border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <ArrowLeft size={13} /> Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button type="button" onClick={next} disabled={!canAdvance}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[14px] bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
              Next <ArrowRight size={13} />
            </button>
          ) : (
            <button type="button" onClick={onSubmit} disabled={submitting || !canSave}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[14px] bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
              <Check size={13} /> {submitting ? "Saving..." : editMode ? "Save Changes" : "Save Candidate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-green-700">
        <span className="inline-flex items-center justify-center">{icon}</span>
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-gray-500 mt-1 ml-6">{subtitle}</p>
    </div>
  );
}
