"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import { Plus, Search, User, Briefcase, MapPin, Link2, FileText, IndianRupee,
  Globe, Users as UsersIcon, Landmark, GraduationCap, Rocket, Inbox, Check, ChevronDown, Sparkles,
  Ban, Archive, ArchiveRestore, Clock, ShieldX, MoreVertical, RotateCcw, X, Flame, AlertCircle, Building2 } from "lucide-react";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Select } from "@/components/hrms/select";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { SkeletonTable, SkeletonLine } from "@/components/hrms/skeleton";

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
  expectedCTC: string | null;
  source: string;
  status: string;
  rating: string | null;
  location: string | null;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  blacklistedAt: string | null;
  blacklistedUntil: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  archivedAt: string | null;
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
  New: "bg-[#dbeafe] text-[#2563eb]",
  InPipeline: "bg-yellow-100 text-yellow-700",
  Hired: "bg-green-100 text-green-700",
  CandRejected: "bg-red-100 text-red-700",
  CandOnHold: "bg-orange-100 text-orange-700",
  Withdrawn: "bg-gray-100 text-gray-500",
};

export default function CandidatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [viewScope, setViewScope] = useState<"active" | "blacklisted" | "archived">("active");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [showCreate, setShowCreate] = useState(false);
  const [blacklistTarget, setBlacklistTarget] = useState<CandidateItem | null>(null);
  const [blacklistForm, setBlacklistForm] = useState({ reason: "", duration: "permanent" as "permanent" | "30" | "90" | "180" | "365" | "custom", customDays: 90 });
  const [archiveTarget, setArchiveTarget] = useState<CandidateItem | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
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

  const validate = () => {
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
    if (form.currentCTC != null && form.currentCTC < 0) e.currentCTC = "Cannot be negative";
    if (form.expectedCTC != null && form.expectedCTC < 0) e.expectedCTC = "Cannot be negative";

    if (form.linkedinUrl && !/^https?:\/\//.test(form.linkedinUrl)) e.linkedinUrl = "Must start with http(s)://";
    if (form.resumeUrl && !/^(https?:\/\/|\/)/.test(form.resumeUrl)) e.resumeUrl = "Invalid resume link";

    if (!form.requisitionId) e.requisitionId = "Select a requisition for this candidate";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["candidates", search, viewScope, page],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (search) qs.set("search", search);
      if (viewScope === "blacklisted") { qs.set("blacklisted", "1"); qs.set("includeArchived", "1"); }
      else if (viewScope === "archived") qs.set("archived", "1");
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
      toast.success("Candidate unarchived");
    },
  });

  const { data: reqsData } = useQuery({
    queryKey: ["requisitions-open"],
    queryFn: () => api.get<Requisition[]>("/api/v1/hrms/recruit/requisitions?limit=200&status=ReqOpen"),
  });
  const openReqs = reqsData?.data ?? [];

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
      if (body.requisitionId && created.data?.id) {
        await api.post("/api/v1/hrms/recruit/applications", {
          candidateId: created.data.id,
          requisitionId: body.requisitionId,
        });
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate added", form.requisitionId ? "Linked to requisition." : undefined);
      setShowCreate(false);
    },
  });

  const candidates = data?.data ?? [];

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Candidates</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { setForm(emptyForm); setErrors({}); setShowCreate(true); }}
            className="flex items-center gap-2 btn btn-primary">
            <Plus size={16} /> Add Candidate
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
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition",
                  viewScope === v.k ? "bg-white text-[#16243A] shadow-sm" : "text-gray-500 hover:text-gray-800")}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <FilterDivider />
          <FilterSearch value={search} onChange={setSearch} placeholder="Search candidates..." />
        </FilterBar>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-2"><SkeletonTable rows={8} cols={7} /></div> : candidates.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><User size={32} className="mx-auto mb-2 text-gray-300" />No candidates</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Current</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Experience</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Apps</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const blUntil = c.blacklistedUntil ? new Date(c.blacklistedUntil) : null;
                const blExpired = blUntil ? blUntil.getTime() < Date.now() : false;
                return (
                <tr key={c.id} className={clsx("row-stagger border-b border-gray-100 hover:bg-gray-50",
                  c.isBlacklisted && !blExpired && "bg-red-50/40",
                  c.isArchived && "opacity-70")} style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-gray-500">{c.email}</p>
                      </div>
                      {c.isBlacklisted && !blExpired && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 ring-1 ring-red-200" title={c.blacklistReason ?? ""}>
                          <Ban size={9} /> BLACKLISTED
                        </span>
                      )}
                      {c.isBlacklisted && blExpired && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                          <Clock size={9} /> EXPIRED
                        </span>
                      )}
                      {c.isArchived && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                          <Archive size={9} /> ARCHIVED
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
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {c.currentDesignation && <p>{c.currentDesignation}</p>}
                    {c.currentCompany && <p className="text-xs text-gray-500">{c.currentCompany}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {c.totalExperience ? `${Math.floor(c.totalExperience / 12)}y ${c.totalExperience % 12}m` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.source.replace("Cand", "")}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">{c._count.applications}</td>
                  <td className="px-4 py-3">
                    <StatusCell status={c.status} stage={c.applications[0]?.currentStage ?? null} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setTimelineTarget(c)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 rounded text-[11px] font-semibold"
                        title="View timeline">
                        <Clock size={11} /> Timeline
                      </button>
                      {c.isBlacklisted ? (
                        <button onClick={() => unblacklistMut.mutate(c.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 rounded text-[11px] font-semibold"
                          title="Lift blacklist">
                          <RotateCcw size={11} /> Unblock
                        </button>
                      ) : (
                        <button onClick={() => { setBlacklistForm({ reason: "", duration: "permanent", customDays: 90 }); setBlacklistTarget(c); }}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 rounded text-[11px] font-semibold"
                          title="Blacklist candidate">
                          <ShieldX size={11} /> Blacklist
                        </button>
                      )}
                      {c.isArchived ? (
                        <button onClick={() => unarchiveMut.mutate(c.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 rounded text-[11px] font-semibold"
                          title="Restore from archive">
                          <ArchiveRestore size={11} /> Restore
                        </button>
                      ) : (
                        <button onClick={() => { setArchiveReason(""); setArchiveTarget(c); }}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 rounded text-[11px] font-semibold"
                          title="Archive candidate">
                          <Archive size={11} /> Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Candidate" size="3xl" subtitle="Add candidate details and apply to requisitions." headerIcon={<User size={18} />} bodyClassName="flex">
        <CandidateWizard
          form={form}
          setForm={setForm}
          errors={errors}
          isIndiaLocation={isIndiaLocation}
          openReqs={openReqs}
          submitting={createMut.isPending}
          onCancel={() => setShowCreate(false)}
          onSubmit={() => { if (validate()) createMut.mutate(form); }}
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
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
                  { k: "30", label: "30 days" },
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
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={blacklistMut.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
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
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
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
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={archiveMut.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                <Archive size={13} /> {archiveMut.isPending ? "Archiving..." : "Archive"}
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
  CandidateCreated:      { cls: "bg-[#dbeafe] text-[#2563eb]", dot: "bg-[#3b82f6]", icon: <User size={11} /> },
  CandidateUpdated:      { cls: "bg-slate-100 text-slate-700", dot: "bg-slate-500", icon: <User size={11} /> },
  ApplicationCreated:    { cls: "bg-[#dbeafe] text-[#2563eb]", dot: "bg-[#3b82f6]", icon: <FileText size={11} /> },
  StageChanged:          { cls: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500", icon: <ChevronDown size={11} /> },
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
            <p className="text-sm font-semibold text-slate-700">No activity yet</p>
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
                        <p className="text-sm font-semibold text-slate-900">{e.title}</p>
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
            className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}

const STAGE_STYLE: Record<string, { dot: string; text: string; bg: string; ring: string }> = {
  Applied:     { dot: "bg-slate-400",   text: "text-slate-700",   bg: "bg-slate-50",   ring: "ring-slate-200" },
  Screening:   { dot: "bg-[#dbeafe]0",    text: "text-[#2563eb]",    bg: "bg-[#dbeafe]",    ring: "ring-[#bfdbfe]" },
  Shortlisted: { dot: "bg-cyan-500",    text: "text-cyan-700",    bg: "bg-cyan-50",    ring: "ring-cyan-200" },
  Interview:   { dot: "bg-[#dbeafe]0",  text: "text-[#2563eb]",  bg: "bg-[#dbeafe]",  ring: "ring-[#3b82f6]" },
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

function StatusCell({ status, stage }: { status: string; stage: string | null }) {
  const cleanStatus = status.replace("Cand", "");
  const s = stageStyle(stage);
  return (
    <div className="flex flex-col gap-1.5">
      {stage ? (
        <span className={clsx("inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md text-xs font-semibold ring-1", s.bg, s.text, s.ring)}>
          <span className={clsx("w-1.5 h-1.5 rounded-full", s.dot)} />
          {stage}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md text-xs font-semibold ring-1 bg-slate-50 text-slate-500 ring-slate-200">
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

const inputClass = "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-[#16243A]";
const errInput = "border-red-400 focus:ring-red-400 focus:border-red-400";

function inp(hasError: boolean) {
  return clsx(inputClass, hasError && errInput);
}

function Field({
  label, required, icon, children, error,
}: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-sm font-semibold text-gray-800 mb-1.5">
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
  { value: "CandDirect",     label: "Direct",       desc: "Walked in / approached",    icon: <User size={14} />,          color: "text-slate-600 bg-slate-100" },
  { value: "CandLinkedIn",   label: "LinkedIn",     desc: "LinkedIn profile/outreach", icon: <Link2 size={14} />,         color: "text-sky-700 bg-sky-100" },
  { value: "CandJobPortal",  label: "Job Portal",   desc: "Naukri, Indeed, etc.",      icon: <Globe size={14} />,         color: "text-emerald-700 bg-emerald-100" },
  { value: "CandReferral",   label: "Referral",     desc: "Employee referral",         icon: <UsersIcon size={14} />,     color: "text-amber-700 bg-amber-100" },
  { value: "CandAgency",     label: "Agency",       desc: "Recruitment agency",        icon: <Landmark size={14} />,      color: "text-violet-700 bg-violet-100" },
  { value: "CandCareerPage", label: "Career Page",  desc: "Company careers site",      icon: <Rocket size={14} />,        color: "text-[#2563eb] bg-[#dbeafe]" },
  { value: "CandCampus",     label: "Campus",       desc: "College placement drive",   icon: <GraduationCap size={14} />, color: "text-blue-700 bg-blue-100" },
  { value: "CandInbound",    label: "Inbound",      desc: "Cold email / application",  icon: <Inbox size={14} />,         color: "text-cyan-700 bg-cyan-100" },
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
        className="w-full flex items-center justify-between gap-2 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white hover:border-[#16243A]/30 focus:outline-none focus:ring-1 focus:ring-[#16243A] transition"
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
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 max-h-72 overflow-auto animate-in fade-in zoom-in-95 duration-150">
          {SOURCE_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition",
                  active ? "bg-[#dbeafe]" : "hover:bg-gray-50",
                )}
              >
                <span className={clsx("inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0", opt.color)}>
                  {opt.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={clsx("block text-sm font-medium truncate", active ? "text-[#2563eb]" : "text-gray-800")}>
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">{opt.desc}</span>
                </span>
                {active && <Check size={14} className="text-[#3b82f6] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Rich Requisition Picker ─────────────────────────────

const priorityStyle: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  Urgent: { bg: "bg-red-50 text-red-700 ring-red-200", text: "Urgent", icon: <Flame size={10} /> },
  High: { bg: "bg-orange-50 text-orange-700 ring-orange-200", text: "High", icon: <AlertCircle size={10} /> },
  Medium: { bg: "bg-[#dbeafe] text-[#2563eb] ring-[#bfdbfe]", text: "Medium", icon: null },
  Low: { bg: "bg-slate-50 text-slate-600 ring-slate-200", text: "Low", icon: null },
};

const deptTint: Record<string, string> = {
  engineering: "from-[#93c5fd] to-[#2563eb]",
  design: "from-pink-400 to-purple-500",
  sales: "from-amber-400 to-orange-500",
  marketing: "from-purple-400 to-indigo-500",
  finance: "from-emerald-400 to-green-500",
  "human resources": "from-sky-400 to-blue-500",
  hr: "from-sky-400 to-blue-500",
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

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

  // Group by department
  const groups = new Map<string, Requisition[]>();
  for (const r of filtered) {
    const key = r.department?.name ?? "Other";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
          "focus:outline-none focus:ring-1 focus:ring-[#16243A]/30 focus:border-[#16243A]",
          open && "border-[#3b82f6] ring-2 ring-[#3b82f6]/20",
          error ? "border-red-300" : "border-gray-300 hover:border-gray-400",
        )}
      >
        {selected ? (
          <>
            <div className={clsx("w-1 self-stretch rounded-full bg-gradient-to-b", tintFor(selected.department?.name))} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">{selected.title}</p>
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
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#dbeafe] to-[#bfdbfe] flex items-center justify-center">
              <Briefcase size={14} className="text-[#2563eb]" />
            </div>
            <span className="flex-1 text-sm text-gray-400">Select a requisition to apply to…</span>
          </>
        )}
        <ChevronDown size={16} className={clsx("text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1.5 z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-gray-100 bg-gray-50 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, req #, department…"
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-[#16243A]"
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
                        ? "bg-[#3b82f6] border-[#3b82f6] text-white"
                        : "bg-white border-gray-200 text-gray-600 hover:border-[#bfdbfe]",
                    )}
                  >
                    {p && priorityStyle[p]?.icon}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center">
                <Briefcase size={22} className="mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-400">No matching open requisitions</p>
              </div>
            ) : (
              Array.from(groups.entries()).map(([deptName, reqs]) => (
                <div key={deptName}>
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                    <Building2 size={11} className="text-gray-400" />
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{deptName}</p>
                    <span className="text-[10px] text-gray-400">· {reqs.length}</span>
                  </div>
                  {reqs.map((r) => {
                    const isSelected = r.id === value;
                    const full = r.filledPositions >= r.positions;
                    const tint = tintFor(r.department?.name);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { onChange(r.id); setOpen(false); }}
                        className={clsx(
                          "w-full flex items-stretch gap-2.5 px-3 py-2.5 text-left transition border-b border-gray-50 last:border-b-0",
                          isSelected ? "bg-[#eff6ff]" : "hover:bg-gray-50",
                        )}
                      >
                        <div className={clsx("w-1 rounded-full bg-gradient-to-b", tint)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={clsx("text-sm font-semibold truncate", isSelected ? "text-[#1e40af]" : "text-gray-900")}>{r.title}</p>
                              {priorityStyle[r.priority] && (
                                <span className={clsx("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ring-1 whitespace-nowrap", priorityStyle[r.priority].bg)}>
                                  {priorityStyle[r.priority].icon}
                                  {priorityStyle[r.priority].text}
                                </span>
                              )}
                            </div>
                            {isSelected && <Check size={14} className="text-[#2563eb] shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                            <span className="font-mono text-gray-400">{r.requisitionNumber}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <UsersIcon size={10} />
                              <span className={clsx(full && "text-red-600 font-semibold")}>{r.filledPositions}/{r.positions}</span>
                            </span>
                            <span>·</span>
                            <span>{r.employmentType}</span>
                            <span>·</span>
                            <span>{r.workLocation}</span>
                            {r._count?.applications !== undefined && (
                              <>
                                <span>·</span>
                                <span className="text-[#2563eb]">{r._count.applications} applied</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-[10px] text-gray-500">
            <span>{filtered.length} of {requisitions.length} open</span>
            <span className="text-gray-400">Only <strong className="text-gray-600">Open</strong> requisitions shown</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Candidate Wizard ───────────────────────────────

interface WizardProps {
  form: CandFormShape;
  setForm: Dispatch<SetStateAction<CandFormShape>>;
  errors: CandFormErrors;
  isIndiaLocation: boolean;
  openReqs: Requisition[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

const WIZARD_STEPS = [
  { id: "personal",       num: 1, title: "Personal Details",     subtitle: "Basic contact information",  icon: <User size={16} /> },
  { id: "professional",   num: 2, title: "Professional Details", subtitle: "Work experience & skills",   icon: <Briefcase size={16} /> },
  { id: "links",          num: 3, title: "Links & Resume",       subtitle: "Links to profiles & resume", icon: <Link2 size={16} /> },
  { id: "requisition",    num: 4, title: "Apply to Requisition", subtitle: "Select job to apply",        icon: <Building2 size={16} /> },
] as const;

function CandidateWizard({ form, setForm, errors, isIndiaLocation, openReqs, submitting, onCancel, onSubmit }: WizardProps) {
  const [activeStep, setActiveStep] = useState<typeof WIZARD_STEPS[number]["id"]>("personal");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.stepId;
          if (id) setActiveStep(id as typeof activeStep);
        }
      },
      { root, rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollToStep = (id: string) => {
    const el = sectionRefs.current[id];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
      setActiveStep(id as typeof activeStep);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <aside className="w-64 shrink-0 border-r border-gray-100 bg-[#faf4ef]/40 flex flex-col">
        <nav className="flex-1 p-4 space-y-1.5">
          {WIZARD_STEPS.map((s) => {
            const active = activeStep === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToStep(s.id)}
                className={clsx(
                  "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition",
                  active ? "bg-white shadow-sm" : "hover:bg-white/60",
                )}
              >
                <div className={clsx(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition",
                  active ? "bg-[#16243A] text-white" : "border-2 border-gray-300 text-gray-500 bg-white",
                )}>
                  {s.num}
                </div>
                <div className="min-w-0">
                  <p className={clsx("text-sm font-semibold leading-tight", active ? "text-[#16243A]" : "text-gray-700")}>
                    {s.title}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{s.subtitle}</p>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="m-4 p-3 rounded-xl bg-[#16243A]/5 border border-[#16243A]/10">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={13} className="text-[#16243A]" />
            <span className="text-xs font-bold text-[#16243A]">Tip</span>
          </div>
          <p className="text-[11px] text-gray-600 leading-snug">
            Adding complete details helps you manage candidates better.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="flex-1 flex flex-col min-h-0"
          noValidate
        >
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
            <section data-step-id="personal" ref={(el) => { sectionRefs.current.personal = el; }}>
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
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    placeholder="9876543210"
                    value={form.phone}
                    // Strip non-digits AND hard-cap at 10 so paste/type can't exceed.
                    onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className={inp(!!errors.phone)}
                  />
                </Field>
                <Field label="Location" icon={<MapPin size={12} />}>
                  <input type="text" placeholder="Bengaluru" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Source">
                  <SourceSelect value={form.source} onChange={(v) => setForm({ ...form, source: v })} />
                </Field>
              </div>
            </section>

            <section data-step-id="professional" ref={(el) => { sectionRefs.current.professional = el; }}>
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
                <Field label="Current CTC (LPA)" icon={<IndianRupee size={12} />}>
                  <NumberInput min={0} value={form.currentCTC} onChange={(v) => setForm({ ...form, currentCTC: v })} className={inputClass} />
                </Field>
                <Field label="Expected CTC (LPA)" icon={<IndianRupee size={12} />}>
                  <NumberInput min={0} value={form.expectedCTC} onChange={(v) => setForm({ ...form, expectedCTC: v })} className={inputClass} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Skills (comma separated)">
                  <input type="text" placeholder="React, Node.js, AWS, Leadership, etc." value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className={inputClass} />
                </Field>
              </div>
            </section>

            <section data-step-id="links" ref={(el) => { sectionRefs.current.links = el; }}>
              <SectionHeader icon={<Link2 size={18} />} title="Links & Resume" subtitle="Professional links and resume upload." />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="LinkedIn URL" icon={<Link2 size={12} />} error={errors.linkedinUrl}>
                  <input type="url" placeholder="https://linkedin.com/in/username" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} className={inp(!!errors.linkedinUrl)} />
                </Field>
                <Field label="Resume" required error={errors.resumeUrl}>
                  <FileUploadInput
                    value={form.resumeUrl}
                    onChange={(url) => setForm({ ...form, resumeUrl: url })}
                    accept="application/pdf,.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    label=""
                    placeholder="Upload resume (PDF / DOCX, max 5MB)"
                  />
                </Field>
              </div>
            </section>

            <section data-step-id="requisition" ref={(el) => { sectionRefs.current.requisition = el; }}>
              <SectionHeader icon={<Building2 size={18} />} title="Apply to Requisition" subtitle="Choose a job requisition to apply this candidate." />
              <div className="mt-3">
                <RequisitionPicker
                  value={form.requisitionId}
                  onChange={(v) => setForm({ ...form, requisitionId: v })}
                  requisitions={openReqs}
                  error={!!errors.requisitionId}
                />
                {errors.requisitionId
                  ? <p className="mt-1.5 text-[11px] text-red-600">{errors.requisitionId}</p>
                  : form.requisitionId
                    ? <p className="mt-1.5 text-[11px] text-[#16243A]">Candidate will enter pipeline at first stage.</p>
                    : <p className="mt-1.5 text-[11px] text-gray-400">No open requisitions? Create one under Recruit → Requisitions.</p>}
              </div>
            </section>
          </div>

          <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end gap-2 bg-white">
            <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              <Check size={14} /> {submitting ? "Saving..." : "Save Candidate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[#16243A]">
        <span className="inline-flex items-center justify-center">{icon}</span>
        <h3 className="text-base font-bold">{title}</h3>
      </div>
      <p className="text-xs text-gray-500 mt-1 ml-6">{subtitle}</p>
    </div>
  );
}
