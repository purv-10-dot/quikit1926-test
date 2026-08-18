"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { Plus, ShieldCheck, AlertCircle, X, Upload } from "lucide-react";
import { InsuranceBulkImport } from "@/components/hrms/insurance-bulk-import";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import { DocumentSourcePicker } from "@/components/hrms/document-source-picker";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { todayInput } from "@/lib/utils/date-input";

interface DocItem {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  status: string;
  expiryDate: string | null;
  createdAt: string;
  metadata: { notifyDaysBefore?: number; startDate?: string; vendorName?: string; notifyEmployeeIds?: string[] } | null;
}

export default function InsuranceDocumentsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const emptyForm = {
    title: "", description: "", fileUrl: "", fileType: "application/pdf", fileSize: 0,
    startDate: "", expiryDate: "", notifyDaysBefore: 30, vendorName: "",
    notifyEmployeeIds: [] as string[],
  };
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["documents", "insurance"],
    queryFn: () => api.get<DocItem[]>("/api/v1/hrms/documents?category=Insurance&limit=100"),
    staleTime: 2 * 60_000,
  });

  // Active employees, for the "Notify (multiple)" recipient picker below.
  const { data: empData } = useQuery({
    queryKey: ["employees-active-list"],
    queryFn: () => api.get<{ id: string; firstName: string; lastName: string }[]>("/api/v1/hrms/employees?status=Active&limit=200&picker=1"),
    staleTime: 5 * 60_000,
  });
  const employees = empData?.data ?? [];

  const docs = data?.data ?? [];
  const expiringSoon = docs.filter((d) => {
    if (!d.expiryDate) return false;
    const days = (new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000;
    return days >= 0 && days <= 30;
  });

  const uploadMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/documents", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Insurance policy added"); setShowUpload(false); setForm(emptyForm); },
  });

  const openUpload = () => { setForm(emptyForm); setShowUpload(true); };

  return (
    <div className="w-full px-5 py-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck size={28} className="text-[#166534] mt-1.5" />
          <h1 className="text-page-title text-gray-900">Insurance</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulkImport(true)} className="btn bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50">
            <Upload size={14} /> Bulk Add
          </button>
          <button onClick={openUpload} className="btn btn-primary">
            <Plus size={14} /> Add Insurance Policy
          </button>
        </div>
      </div>

      <InsuranceBulkImport
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onDone={() => qc.invalidateQueries({ queryKey: ["documents", "insurance"] })}
      />

      {expiringSoon.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-sm text-yellow-800">
          <AlertCircle size={16} /> {expiringSoon.length} polic{expiringSoon.length > 1 ? "ies" : "y"} expiring in 30 days
        </div>
      )}

      {isLoading ? <SkeletonTable rows={6} cols={4} /> : docs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <ShieldCheck size={32} className="mx-auto mb-2 text-gray-300" /> No insurance policies yet
          <div className="mt-3">
            <button onClick={openUpload} className="btn btn-primary"><Plus size={14} /> Add Insurance Policy</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map((d) => {
            const days = d.expiryDate ? Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <Link key={d.id} href={`/documents/insurance/${d.id}`}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-[#bbf7d0] hover:shadow flex flex-col">
                <h3 className="font-medium text-gray-900 line-clamp-1 mb-2">{d.title}</h3>
                {d.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{d.description}</p>}
                {d.expiryDate && (
                  <div className={clsx("text-xs mt-1", days !== null && days <= 30 ? "text-orange-600" : "text-gray-500")}>
                    Expires {new Date(d.expiryDate).toLocaleDateString("en-IN")}
                    {days !== null && days >= 0 && ` (${days} day${days === 1 ? "" : "s"} left)`}
                  </div>
                )}
                {d.metadata?.notifyDaysBefore && (
                  <div className="text-[11px] text-gray-400 mt-1">Notifies {d.metadata.notifyDaysBefore} days before expiry</div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Add Insurance Policy" size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          uploadMut.mutate({
            title: form.title,
            description: form.description || undefined,
            category: "Insurance",
            fileUrl: form.fileUrl,
            fileType: form.fileType,
            fileSize: form.fileSize,
            status: "Active",
            expiryDate: form.expiryDate || undefined,
            metadata: {
              notifyDaysBefore: form.notifyDaysBefore,
              startDate: form.startDate || undefined,
              vendorName: form.vendorName || undefined,
              notifyEmployeeIds: form.notifyEmployeeIds.length ? form.notifyEmployeeIds : undefined,
            },
          });
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Group Health Insurance 2026"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
              <input value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                placeholder="e.g. HDFC ERGO"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Document <span className="text-red-500">*</span></label>
            <DocumentSourcePicker
              value={{ fileUrl: form.fileUrl, fileType: form.fileType, fileSize: form.fileSize }}
              onChange={(meta) => setForm({ ...form, ...meta })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date <span className="text-red-500">*</span></label>
              <input required type="date" min={todayInput()} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notify Before (days)</label>
              <NumberInput allowDecimal={false} value={form.notifyDaysBefore} onChange={(v) => setForm({ ...form, notifyDaysBefore: v ?? 30 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notify (in addition to the policy owner)</label>
            <Select
              value=""
              onChange={(v) => { if (v && !form.notifyEmployeeIds.includes(v)) setForm({ ...form, notifyEmployeeIds: [...form.notifyEmployeeIds, v] }); }}
              options={[{ value: "", label: "Add a person to notify…" },
                ...employees
                  .filter((e) => !form.notifyEmployeeIds.includes(e.id))
                  .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() })),
              ]}
            />
            {form.notifyEmployeeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.notifyEmployeeIds.map((id) => {
                  const emp = employees.find((e) => e.id === id);
                  const name = emp ? `${emp.firstName} ${emp.lastName}`.trim() : id;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 text-xs font-medium pl-2.5 pr-1 py-1 ring-1 ring-green-200">
                      {name}
                      <button type="button" onClick={() => setForm({ ...form, notifyEmployeeIds: form.notifyEmployeeIds.filter((x) => x !== id) })}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-green-500 hover:bg-green-100">
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Optional notes" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={uploadMut.isPending} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {uploadMut.isPending ? "Saving…" : "Add Policy"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
