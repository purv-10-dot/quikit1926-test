"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useRouter } from "next/navigation";
import { Briefcase, Send, Building2, Users, CheckCircle2 } from "lucide-react";
import { NumberInput } from "@/components/hrms/ui/number-input";

interface DeptOption { id: string; name: string }

export default function RaiseRequisitionPage() {
  const api = useApiClient();
  const toast = useToast();
  const router = useRouter();

  const { data: deptsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=100"),
  });
  const departments = deptsData?.data ?? [];

  const [form, setForm] = useState({
    title: "",
    departmentId: "",
    positions: 1,
    type: "NewPosition" as "NewPosition" | "Replacement" | "Expansion",
    employmentType: "FullTime" as "FullTime" | "PartTime" | "Contract" | "Intern" | "Consultant",
    workLocation: "Office" as "Office" | "Remote" | "Hybrid",
    experienceMin: null as number | null,
    experienceMax: null as number | null,
    salaryMin: null as number | null,
    salaryMax: null as number | null,
    priority: "Medium" as "Low" | "Medium" | "High" | "Urgent",
    justification: "",
    jobDescription: "",
  });

  const raiseMut = useMutation({
    mutationFn: () => api.post<{ requisition: { id: string; requisitionNumber: string }; approvers: { deptHead: { name: string }; hr: { name: string } } }>(
      "/api/v1/hrms/recruit/requisitions/raise",
      {
        ...form,
        experienceMin: form.experienceMin ?? undefined,
        experienceMax: form.experienceMax ?? undefined,
        salaryMin: form.salaryMin ?? undefined,
        salaryMax: form.salaryMax ?? undefined,
        departmentId: form.departmentId,
      },
    ),
    onSuccess: (res) => {
      const d = res.data;
      toast.success("Requisition raised", `Sent to ${d?.approvers.deptHead.name} for first approval`);
      setTimeout(() => router.push("/recruit/requisitions"), 800);
    },
    onError: (e: Error) => toast.error("Failed to raise", e.message),
  });

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-start gap-3 mb-5">
        <Briefcase size={28} className="text-[#3b82f6] mt-1.5" />
        <div>
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900 leading-tight">Raise a requisition</h1>
          <p className="text-sm text-gray-500 mt-1">Submit a hiring request. Flow: Department Head → HR → Open.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) return toast.error("Role title required");
          if (!form.justification.trim() || form.justification.trim().length < 10) return toast.error("Business justification required (min 10 chars)");
          raiseMut.mutate();
        }}
        className="surface-card p-6 space-y-5 w-full"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Role Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Senior Backend Engineer"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              Department <span className="text-red-500">*</span>
            </label>
            <select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A]"
            >
              <option value="">— Select department —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Positions *</label>
            <NumberInput
              required allowDecimal={false} min={1}
              value={form.positions}
              onChange={(v) => setForm({ ...form, positions: v ?? 1 })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white">
              <option value="NewPosition">New Position</option>
              <option value="Replacement">Replacement</option>
              <option value="Expansion">Expansion</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Employment</label>
            <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value as typeof form.employmentType })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white">
              <option value="FullTime">Full-time</option>
              <option value="PartTime">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Intern">Intern</option>
              <option value="Consultant">Consultant</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Location</label>
            <select value={form.workLocation} onChange={(e) => setForm({ ...form, workLocation: e.target.value as typeof form.workLocation })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white">
              <option value="Office">Office</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Exp Min (yrs)</label>
            <NumberInput min={0}
              value={form.experienceMin}
              onChange={(v) => setForm({ ...form, experienceMin: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Exp Max (yrs)</label>
            <NumberInput min={0}
              value={form.experienceMax}
              onChange={(v) => setForm({ ...form, experienceMax: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Salary Min (₹)</label>
            <NumberInput min={0}
              value={form.salaryMin}
              onChange={(v) => setForm({ ...form, salaryMin: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Salary Max (₹)</label>
            <NumberInput min={0}
              value={form.salaryMax}
              onChange={(v) => setForm({ ...form, salaryMax: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">Priority</label>
          <div className="flex gap-2">
            {(["Low", "Medium", "High", "Urgent"] as const).map((p) => {
              const on = form.priority === p;
              const cls = p === "Low" ? "slate" : p === "Medium" ? "blue" : p === "High" ? "amber" : "red";
              const styleOn = {
                slate: "bg-[#16243A] text-white ring-[#16243A]",
                blue: "bg-[#16243A] text-white ring-[#16243A]",
                amber: "bg-amber-600 text-white ring-amber-600",
                red: "bg-red-600 text-white ring-red-600",
              }[cls];
              const styleOff = "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50";
              return (
                <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ring-1 transition ${on ? styleOn : styleOff}`}>
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">Business Justification *</label>
          <textarea
            required rows={4}
            value={form.justification}
            onChange={(e) => setForm({ ...form, justification: e.target.value })}
            placeholder="Why do you need this role? Include business impact, workload data, expected outcomes, budget alignment…"
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
          />
          <p className="text-[11px] text-slate-400 mt-1">Approvers will see this as the primary reason to approve.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">Job Description (optional)</label>
          <textarea
            rows={5}
            value={form.jobDescription}
            onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
            placeholder="Responsibilities, must-haves, nice-to-haves. HR/recruiter can refine after approval."
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-800 space-y-1">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={12} /> Approval flow</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1"><Users size={11} /> Department Head</span>
            <span>→</span>
            <span className="inline-flex items-center gap-1"><Building2 size={11} /> HR</span>
            <span>→</span>
            <span className="inline-flex items-center gap-1">Opens for hiring</span>
          </div>
          <p className="text-[11px] text-blue-700 mt-1">Once submitted, you cannot edit — read-only until approved or rejected.</p>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={() => router.back()} disabled={raiseMut.isPending}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={raiseMut.isPending}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-md text-sm font-semibold shadow-sm disabled:opacity-50">
            <Send size={14} /> {raiseMut.isPending ? "Submitting…" : "Submit for Approval"}
          </button>
        </div>
      </form>
    </div>
  );
}
