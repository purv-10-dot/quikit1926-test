"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { Mail, Save, Trash2, Plus, Info } from "lucide-react";
import { clsx } from "clsx";

type Channel = "Email" | "InApp";

interface Template {
  id: string;
  key: string;
  channel: Channel;
  subject: string;
  body: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

const PAYROLL_KEYS: { key: string; label: string; vars: string[] }[] = [
  { key: "payslip.released", label: "Payslip Released", vars: ["{{employeeName}}", "{{employeeCode}}", "{{period}}", "{{netPay}}", "{{payDate}}", "{{companyName}}"] },
  { key: "payrun.created", label: "Pay Run Created", vars: ["{{period}}", "{{employeeCount}}"] },
  { key: "payrun.approved", label: "Pay Run Approved", vars: ["{{period}}", "{{totalNet}}", "{{employeeCount}}"] },
  { key: "payrun.released", label: "Pay Run Released (admin)", vars: ["{{period}}", "{{totalNet}}", "{{employeeCount}}"] },
  { key: "salary.revised", label: "Salary Revised", vars: ["{{employeeName}}", "{{newCTC}}", "{{effectiveFrom}}"] },
  { key: "leave.approved", label: "Leave Approved", vars: ["{{employeeName}}", "{{leaveType}}", "{{startDate}}", "{{endDate}}"] },
  { key: "leave.rejected", label: "Leave Rejected", vars: ["{{employeeName}}", "{{leaveType}}", "{{rejectionReason}}"] },
];

export default function EmailTemplatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<Channel>("Email");

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "email-templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/settings/email-templates"),
  });
  const templates = data?.data ?? [];

  const tplMap = new Map(templates.map((t) => [`${t.key}::${t.channel}`, t]));

  const upsertMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Template>("/api/v1/hrms/settings/email-templates", body),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["settings", "email-templates"] });
    },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/email-templates/${id}`),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["settings", "email-templates"] });
    },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const editing = editingKey ? tplMap.get(`${editingKey}::${editingChannel}`) : null;
  const meta = PAYROLL_KEYS.find((k) => k.key === editingKey);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState("");

  const startEdit = (key: string, channel: Channel) => {
    setEditingKey(key);
    setEditingChannel(channel);
    const t = tplMap.get(`${key}::${channel}`);
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
    setEnabled(t?.enabled ?? true);
    setDescription(t?.description ?? "");
  };

  const inputCls =
    "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-[#16243A]";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Mail className="text-[#3b82f6]" />
        <div>
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-sm text-gray-500">Override default subject/body for system notifications. Empty = uses code default.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-700 uppercase">Templates</div>
          {isLoading ? (
            <div className="p-6 text-center text-sm text-gray-500">Loading…</div>
          ) : (
            <ul>
              {PAYROLL_KEYS.map((m) => {
                const channels: Channel[] = ["Email", "InApp"];
                return (
                  <li key={m.key} className="border-b border-gray-100 last:border-0">
                    <div className="px-4 py-2">
                      <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                      <p className="text-[11px] text-gray-500 font-mono">{m.key}</p>
                      <div className="mt-1.5 flex gap-1">
                        {channels.map((c) => {
                          const t = tplMap.get(`${m.key}::${c}`);
                          const active = editingKey === m.key && editingChannel === c;
                          return (
                            <button
                              key={c}
                              onClick={() => startEdit(m.key, c)}
                              className={clsx(
                                "px-2 py-0.5 text-[11px] rounded font-semibold",
                                active ? "bg-[#16243A] text-white" :
                                t ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" :
                                "bg-gray-100 text-gray-600 hover:bg-gray-200",
                              )}
                            >
                              {c} {t ? "✓" : "+"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="col-span-2 rounded-lg border border-gray-200 bg-white shadow-sm p-5">
          {!editingKey ? (
            <div className="text-center py-12 text-sm text-gray-500">
              <Plus size={28} className="mx-auto text-gray-300 mb-2" />
              Pick a template from the left to edit.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{meta?.label}</h3>
                  <p className="text-[11px] text-gray-500 font-mono">{editingKey} · {editingChannel}</p>
                </div>
                {editing && (
                  <button
                    onClick={() => {
                      if (window.confirm("Delete this override? Will fall back to code default.")) deleteMut.mutate(editing.id);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={12} /> Delete override
                  </button>
                )}
              </div>

              {meta?.vars && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  <div className="flex items-start gap-2">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Available variables:</p>
                      <p className="mt-1 font-mono">{meta.vars.join("  ")}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Subject *</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Body *</label>
                <textarea
                  rows={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className={inputCls + " font-mono text-xs"}
                  placeholder="HTML body. Use {{variable}} placeholders."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description (internal)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
                Enabled (uncheck to suppress this notification)
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => upsertMut.mutate({ key: editingKey, channel: editingChannel, subject, body, enabled, description: description || null })}
                  disabled={!subject || !body || upsertMut.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-md text-sm font-semibold"
                >
                  <Save size={14} /> {upsertMut.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
