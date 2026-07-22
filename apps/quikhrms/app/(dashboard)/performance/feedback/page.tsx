"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { clsx } from "clsx";
import { Plus, User, MessageSquare, Award, Star, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";

interface FeedbackItem {
  id: string;
  type: string;
  category: string;
  message: string;
  isPublic: boolean;
  badges: string[] | null;
  createdAt: string;
  fromEmployee: { id: string; firstName: string; lastName: string; profilePhoto: string | null };
  toEmployee: { id: string; firstName: string; lastName: string; profilePhoto: string | null };
}

const typeIcons: Record<string, React.ReactNode> = {
  Praise: <Star size={14} className="text-yellow-500" />,
  Constructive: <MessageSquare size={14} className="text-[#22c55e]" />,
  Suggestion: <MessageSquare size={14} className="text-purple-500" />,
  Recognition: <Award size={14} className="text-green-500" />,
};

const typeColors: Record<string, string> = {
  Praise: "bg-yellow-50 border-yellow-200",
  Constructive: "bg-[#dcfce7] border-[#bbf7d0]",
  Suggestion: "bg-purple-50 border-purple-200",
  Recognition: "bg-green-50 border-green-200",
};

export default function FeedbackPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/performance/feedback/${id}`),
    onSuccess: () => {
      toast.success("Feedback deleted");
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
  const confirmDelete = async (fb: FeedbackItem) => {
    const ok = await dialog.confirm({
      title: "Delete this feedback?",
      description: "This will be permanently removed and cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(fb.id);
  };
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    toEmployeeId: "", type: "Praise" as string, category: "Teamwork" as string,
    message: "", isPublic: true,
  });

  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [toEmployeeFilter, setToEmployeeFilter] = useState("");
  const [fromEmployeeFilter, setFromEmployeeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", typeFilter, categoryFilter, toEmployeeFilter, fromEmployeeFilter],
    queryFn: () => {
      const p = new URLSearchParams({ isPublic: "true", limit: "50" });
      if (typeFilter) p.set("type", typeFilter);
      if (categoryFilter) p.set("category", categoryFilter);
      if (toEmployeeFilter) p.set("toEmployeeId", toEmployeeFilter);
      if (fromEmployeeFilter) p.set("fromEmployeeId", fromEmployeeFilter);
      return api.get<FeedbackItem[]>(`/api/v1/hrms/performance/feedback?${p.toString()}`);
    },
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/performance/feedback", body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["feedback"] });
      if (vars.isPublic && (vars.type === "Praise" || vars.type === "Recognition")) {
        qc.invalidateQueries({ queryKey: ["home", "feed", "recognition"] });
        qc.invalidateQueries({ queryKey: ["home", "feed", "posts"] });
      }
      setShowCreate(false);
    },
  });

  const feedbacks = data?.data ?? [];

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-page-title text-gray-900">Continuous feedback</h1>
        <button onClick={() => { setForm({ toEmployeeId: "", type: "Praise", category: "Teamwork", message: "", isPublic: true }); setShowCreate(true); }}
          className="btn btn-primary">
          <Plus size={13} /> Give feedback
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-40"
          options={[
            { value: "", label: "All types" },
            { value: "Praise", label: "Praise" },
            { value: "Constructive", label: "Constructive" },
            { value: "Suggestion", label: "Suggestion" },
            { value: "Recognition", label: "Recognition" },
          ]}
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          className="w-44"
          options={[
            { value: "", label: "All categories" },
            { value: "Teamwork", label: "Teamwork" },
            { value: "Leadership", label: "Leadership" },
            { value: "Innovation", label: "Innovation" },
            { value: "Communication", label: "Communication" },
            { value: "Quality", label: "Quality" },
            { value: "Other", label: "Other" },
          ]}
        />
        <div className="w-56">
          <EmployeeSelect value={toEmployeeFilter} onChange={setToEmployeeFilter} placeholder="To employee" />
        </div>
        <div className="w-56">
          <EmployeeSelect value={fromEmployeeFilter} onChange={setFromEmployeeFilter} placeholder="From employee" />
        </div>
        {(typeFilter || categoryFilter || toEmployeeFilter || fromEmployeeFilter) && (
          <button
            type="button"
            onClick={() => { setTypeFilter(""); setCategoryFilter(""); setToEmployeeFilter(""); setFromEmployeeFilter(""); }}
            className="text-xs text-[#22c55e] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <SkeletonCards count={4} />
      ) : feedbacks.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((fb, i) => (
            <div key={fb.id} className={clsx("row-stagger rounded-lg border p-4", typeColors[fb.type] ?? "bg-white border-gray-200")} style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mt-0.5">
                  <User size={14} className="text-gray-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-semibold text-gray-900">{fb.fromEmployee.firstName} {fb.fromEmployee.lastName}</span>
                    {typeIcons[fb.type]}
                    <span className="text-xs text-gray-500">{fb.type} &middot; {fb.category}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(fb.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </span>
                    <button
                      type="button"
                      onClick={() => confirmDelete(fb)}
                      title="Delete feedback"
                      className="p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">
                    To: <span className="font-medium">{fb.toEmployee.firstName} {fb.toEmployee.lastName}</span>
                  </p>
                  <p className="text-xs text-gray-700">{fb.message}</p>
                  {fb.badges && fb.badges.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {(fb.badges as string[]).map((b, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white/70 rounded-full text-[11px] font-medium text-gray-600 border">{b}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Give Feedback">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
          <EmployeeSelect
            label="To"
            required
            value={form.toEmployeeId}
            onChange={(id) => setForm({ ...form, toEmployeeId: id })}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={["Praise", "Constructive", "Suggestion", "Recognition"].map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={["Teamwork", "Leadership", "Technical", "Communication", "Innovation", "CustomerFocus"].map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required rows={4}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} className="rounded border-gray-300" />
            Visible on social wall
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Submit</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
