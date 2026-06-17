"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Plus, FileText, Search, AlertCircle, FolderLock, Pencil, Trash2, Sparkles, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import { DocumentSourcePicker } from "@/components/hrms/document-source-picker";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonTable } from "@/components/hrms/skeleton";

type Category = "OfferLetter" | "Policy" | "IdProof" | "Certificate" | "Contract" | "AppointmentLetter" | "ExperienceLetter" | "RelievingLetter" | "NDA" | "Other";
type Status = "Draft" | "Active" | "Archived" | "Expired";

interface DocItem {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  status: Status;
  expiryDate: string | null;
  tags: string[] | null;
  employeeId: string | null;
  createdAt: string;
  metadata: { extractedText?: string; extractedAt?: string } | null;
  _count: { acknowledgments: number; shares: number };
}

const CATEGORIES: Category[] = ["OfferLetter", "Policy", "IdProof", "Certificate", "Contract", "AppointmentLetter", "ExperienceLetter", "RelievingLetter", "NDA", "Other"];
const STATUSES: Status[] = ["Draft", "Active", "Archived", "Expired"];

const catColors: Record<string, string> = {
  OfferLetter: "bg-[#dbeafe] text-[#2563eb]",
  Policy: "bg-purple-100 text-purple-700",
  IdProof: "bg-gray-100 text-gray-700",
  Certificate: "bg-green-100 text-green-700",
  Contract: "bg-red-100 text-red-700",
  AppointmentLetter: "bg-[#dbeafe] text-[#2563eb]",
  ExperienceLetter: "bg-cyan-100 text-cyan-700",
  RelievingLetter: "bg-orange-100 text-orange-700",
  NDA: "bg-sky-100 text-sky-700",
  Other: "bg-gray-100 text-gray-600",
};

export default function DocumentLibraryPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [filters, setFilters] = useState({ category: "", status: "", search: "" });
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState<DocItem | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocItem | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", category: "Other" as Category, fileUrl: "", fileType: "application/pdf",
    fileSize: 0, status: "Active" as Status, expiryDate: "", employeeId: "", tags: "",
  });

  const qs = new URLSearchParams();
  qs.set("limit", "50");
  qs.set("isTemplate", "false");
  qs.set("companyOnly", "true");
  if (filters.category) qs.set("category", filters.category);
  if (filters.status) qs.set("status", filters.status);
  if (filters.search) qs.set("search", filters.search);

  const { data, isLoading } = useQuery({
    queryKey: ["documents", filters],
    queryFn: () => api.get<DocItem[]>(`/api/v1/hrms/documents?${qs.toString()}`),
    staleTime: 2 * 60_000,
  });

  const { data: expiring } = useQuery({
    queryKey: ["documents", "expiring"],
    queryFn: () => api.get<DocItem[]>("/api/v1/hrms/documents/expiring?days=30&companyOnly=true"),
  });

  const uploadMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/documents", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); setShowUpload(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.put(`/api/v1/hrms/documents/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); setEditDoc(null); toast.success("Document updated"); },
    onError: (e: Error) => toast.error("Update failed", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); setDeleteDoc(null); toast.success("Document deleted"); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [reindexDoc, setReindexDoc] = useState<DocItem | null>(null);
  const extractMut = useMutation({
    mutationFn: (id: string) => {
      setExtractingId(id);
      return api.post<{ extracted: boolean; length: number; fileUrl?: string; fileType?: string; diagnostics?: { ok: boolean; reason?: string; source?: string; mime?: string; bytes?: number } }>(`/api/v1/hrms/documents/${id}/extract`, {});
    },
    onSuccess: (res) => {
      if (res.data.extracted) {
        toast.success("AI text extracted", `${res.data.length} chars indexed (${res.data.diagnostics?.source ?? "?"})`);
      } else {
        const d = res.data.diagnostics;
        const reason = d?.reason ?? "Unknown reason";
        toast.warning("No text extracted", `${reason} · type=${res.data.fileType ?? "?"} · src=${d?.source ?? "?"}`);
        console.warn("Extract diagnostics:", res.data);
      }
    },
    onError: (e: Error) => toast.error("Extract failed", e.message),
    onSettled: () => setExtractingId(null),
  });

  const openEdit = (d: DocItem) => {
    setForm({
      title: d.title,
      description: d.description ?? "",
      category: d.category,
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      fileSize: d.fileSize,
      status: d.status,
      expiryDate: d.expiryDate ? d.expiryDate.slice(0, 10) : "",
      employeeId: d.employeeId ?? "",
      tags: (d.tags ?? []).join(", "),
    });
    setEditDoc(d);
  };

  const docs = (data?.data ?? []).filter((d) => !d.employeeId);
  const expiringCount = (expiring?.data ?? []).filter((d) => !d.employeeId).length;

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <FileText size={28} className="text-[#16243A] mt-1.5" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Document library</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/documents/my-vault" className="btn btn-secondary btn-sm">
            <FolderLock size={13} /> My Vault
          </Link>
          <button onClick={() => setShowUpload(true)} className="btn btn-primary">
            <Plus size={14} /> Upload
          </button>
        </div>
      </div>

      {expiringCount > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-sm text-yellow-800">
          <AlertCircle size={16} /> {expiringCount} document{expiringCount > 1 ? "s" : ""} expiring in 30 days
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input placeholder="Search documents..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
        </div>
        <Select
          value={filters.category}
          onChange={(v) => setFilters({ ...filters, category: v })}
          placeholder="All categories"
          options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          className="w-48"
        />
        <Select
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          placeholder="All statuses"
          options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
          className="w-40"
        />
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={5} /> : docs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <FileText size={32} className="mx-auto mb-2 text-gray-300" /> No documents
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map((d) => (
            <div key={d.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-[#bfdbfe] hover:shadow flex flex-col">
              <Link href={`/documents/${d.id}`} className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-gray-900 line-clamp-1">{d.title}</h3>
                  <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ml-2", catColors[d.category])}>{d.category}</span>
                </div>
                {d.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{d.description}</p>}
                <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                  <span>{new Date(d.createdAt).toLocaleDateString("en-IN")}</span>
                  <div className="flex items-center gap-2">
                    <span>{d._count.acknowledgments} ack</span>
                    <span>•</span>
                    <span>{d._count.shares} shared</span>
                  </div>
                </div>
                {d.expiryDate && (
                  <div className="text-xs text-orange-600 mt-1">Expires {new Date(d.expiryDate).toLocaleDateString("en-IN")}</div>
                )}
              </Link>
              <div className="flex items-center gap-1 pt-3 mt-3 border-t border-gray-100 flex-wrap">
                <button onClick={() => openEdit(d)} title="Edit" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:text-[#16243A] hover:bg-gray-50 border border-gray-200">
                  <Pencil size={11} /> Edit
                </button>
                {d.metadata?.extractedText ? (
                  <button
                    onClick={() => setReindexDoc(d)}
                    disabled={extractingId === d.id}
                    title={`Indexed ${d.metadata.extractedAt ? new Date(d.metadata.extractedAt).toLocaleDateString("en-IN") : ""} · click to re-index`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50"
                  >
                    <CheckCircle2 size={11} /> {extractingId === d.id ? "Re-indexing…" : "Indexed"}
                  </button>
                ) : (
                  <button
                    onClick={() => extractMut.mutate(d.id)}
                    disabled={extractingId === d.id}
                    title="Index for AI Copilot"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#2563eb] hover:bg-blue-50 border border-blue-200 disabled:opacity-50"
                  >
                    <Sparkles size={11} /> {extractingId === d.id ? "Indexing…" : "Index for AI"}
                  </button>
                )}
                <button onClick={() => setDeleteDoc(d)} title="Delete" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50 border border-red-200">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document">
        <form onSubmit={(e) => {
          e.preventDefault();
          uploadMut.mutate({
            title: form.title,
            description: form.description || undefined,
            category: form.category,
            fileUrl: form.fileUrl,
            fileType: form.fileType,
            fileSize: form.fileSize,
            status: form.status,
            expiryDate: form.expiryDate || undefined,
            employeeId: form.employeeId || undefined,
            tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
          });
        }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source <span className="text-red-500">*</span></label>
            <DocumentSourcePicker
              value={{ fileUrl: form.fileUrl, fileType: form.fileType, fileSize: form.fileSize }}
              onChange={(meta) => setForm({ ...form, ...meta })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v as Category })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as Status })}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
              <input value={form.fileType} onChange={(e) => setForm({ ...form, fileType: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">File Size (bytes)</label>
              <NumberInput allowDecimal={false} value={form.fileSize} onChange={(v) => setForm({ ...form, fileSize: v ?? 0 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <EmployeeSelect
              label="Employee"
              optional
              value={form.employeeId}
              onChange={(id) => setForm({ ...form, employeeId: id })}
            />
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date (optional)</label>
              <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" placeholder="legal, 2026, onboarding" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={uploadMut.isPending} className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50">Upload</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editDoc} onClose={() => setEditDoc(null)} title={editDoc ? `Edit: ${editDoc.title}` : ""}>
        {editDoc && (
          <form onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate({
              id: editDoc.id,
              body: {
                title: form.title,
                description: form.description || undefined,
                category: form.category,
                fileUrl: form.fileUrl,
                fileType: form.fileType,
                fileSize: form.fileSize,
                status: form.status,
                expiryDate: form.expiryDate || undefined,
                tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
              },
            });
          }} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select value={form.category} onChange={(v) => setForm({ ...form, category: v as Category })}
                  options={CATEGORIES.map((c) => ({ value: c, label: c }))} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as Status })}
                  options={STATUSES.map((s) => ({ value: s, label: s }))} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" placeholder="legal, 2026" /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={3} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditDoc(null)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={updateMut.isPending} className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50">
                {updateMut.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!reindexDoc} onClose={() => setReindexDoc(null)} title="Re-index Document?">
        {reindexDoc && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              <strong>{reindexDoc.title}</strong> is already indexed
              {reindexDoc.metadata?.extractedAt
                ? ` (${new Date(reindexDoc.metadata.extractedAt).toLocaleDateString("en-IN")})`
                : ""}.
              Re-indexing replaces the existing AI text. Continue?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReindexDoc(null)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
              <button
                type="button"
                onClick={() => { extractMut.mutate(reindexDoc.id); setReindexDoc(null); }}
                disabled={extractMut.isPending}
                className="px-4 py-2 bg-[#2563eb] text-white rounded-lg text-sm font-medium hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                Re-index
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!deleteDoc} onClose={() => setDeleteDoc(null)} title="Delete Document">
        {deleteDoc && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Delete <strong>{deleteDoc.title}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDeleteDoc(null)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
              <button type="button" onClick={() => deleteMut.mutate(deleteDoc.id)} disabled={deleteMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
