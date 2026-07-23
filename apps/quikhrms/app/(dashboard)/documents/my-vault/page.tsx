"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { FileText, Download, AlertCircle, FolderLock, Plus, Pencil, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { FormField, FormInput, FormTextarea, FormActions } from "@/components/hrms/form";
import { DocumentSourcePicker } from "@/components/hrms/document-source-picker";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { todayInput } from "@/lib/utils/date-input";
import { withBasePath } from "@/lib/utils/base-path";

/**
 * Internal uploads are served from an auth-guarded API path (/api/v1/hrms/...).
 * Opening them in a new tab needs the app's basePath prepended, or the tab
 * resolves to the wrong root and 404s. External links (google-drive / pasted
 * URLs) are absolute http(s) and pass through unchanged.
 */
function docHref(url: string): string {
  return url.startsWith("/") ? withBasePath(url) : url;
}

/**
 * Force a real download (not inline preview) for internal proxy files by adding
 * `?dl=1&name=<title.ext>` — the proxy then returns Content-Disposition: attachment.
 * External (absolute http) URLs can't be forced cross-origin, so open as-is.
 */
function downloadHref(d: DocItem): string {
  const base = docHref(d.fileUrl);
  if (!d.fileUrl.startsWith("/")) return base;
  const keyMatch = d.fileUrl.match(/[?&]key=([^&]+)/);
  const key = keyMatch ? decodeURIComponent(keyMatch[1]) : "";
  const ext = (key.split(".").pop() || "").toLowerCase();
  const safe = (d.title || "document").replace(/[^\w.-]+/g, "_");
  const name = ext && !safe.toLowerCase().endsWith(`.${ext}`) ? `${safe}.${ext}` : safe;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}dl=1&name=${encodeURIComponent(name)}`;
}

interface DocItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  fileType: string;
  status: string;
  expiryDate: string | null;
  createdAt: string;
  _count: { acknowledgments: number; shares: number };
}

const CATEGORIES = [
  { value: "IdProof", label: "ID Proof (Aadhaar, PAN, Passport)" },
  { value: "Certificate", label: "Certificate" },
  { value: "OfferLetter", label: "Offer Letter" },
  { value: "AppointmentLetter", label: "Appointment Letter" },
  { value: "ExperienceLetter", label: "Experience Letter" },
  { value: "RelievingLetter", label: "Relieving Letter" },
  { value: "Contract", label: "Contract" },
  { value: "NDA", label: "NDA" },
  { value: "Other", label: "Other" },
];

export default function MyVaultPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { employee } = useDashboardConfig();
  const myEmployeeId = employee?.id;
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState<DocItem | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocItem | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", category: "IdProof",
    fileUrl: "", fileType: "", fileSize: 0, expiryDate: "",
  });

  const { data: mine, isLoading } = useQuery({
    queryKey: ["documents", "my-vault", myEmployeeId],
    queryFn: () => api.get<DocItem[]>(`/api/v1/hrms/documents?employeeId=${myEmployeeId}&limit=100`),
    staleTime: 2 * 60_000,
    enabled: !!myEmployeeId,
  });

  const { data: expiring } = useQuery({
    queryKey: ["documents", "expiring", "self", myEmployeeId],
    queryFn: () => api.get<DocItem[]>(`/api/v1/hrms/documents/expiring?days=60&employeeId=${myEmployeeId}`),
    enabled: !!myEmployeeId,
  });

  const docs = mine?.data ?? [];
  const expiringDocs = expiring?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/documents", body),
    onSuccess: async () => {
      toast.success("Document uploaded");
      await qc.refetchQueries({ queryKey: ["documents"] });
      setShowUpload(false);
      setForm({ title: "", description: "", category: "IdProof", fileUrl: "", fileType: "", fileSize: 0, expiryDate: "" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.put(`/api/v1/hrms/documents/${id}`, body),
    onSuccess: async () => {
      toast.success("Document updated");
      await qc.refetchQueries({ queryKey: ["documents"] });
      setEditDoc(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/documents/${id}`),
    onSuccess: async () => {
      toast.success("Document deleted");
      await qc.refetchQueries({ queryKey: ["documents"] });
      setDeleteDoc(null);
    },
  });

  const openEdit = (d: DocItem) => {
    setForm({
      title: d.title,
      description: d.description ?? "",
      category: d.category,
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      fileSize: 0,
      expiryDate: d.expiryDate ? d.expiryDate.slice(0, 10) : "",
    });
    setEditDoc(d);
  };

  // Always open the upload modal on a CLEAN form — the same `form` state is
  // shared with the edit modal, so without this reset a previously
  // viewed/edited document's data would carry over into a new upload.
  const openUpload = () => {
    setForm({ title: "", description: "", category: "IdProof", fileUrl: "", fileType: "", fileSize: 0, expiryDate: "" });
    setShowUpload(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myEmployeeId) return toast.error("Still loading your profile", "Please try again in a moment.");
    if (!form.title.trim()) return toast.error("Title required");
    if (!form.fileUrl.trim()) return toast.error("Choose a file or paste a link");
    const isLinkLike = form.fileType === "link" || form.fileType === "google-drive";
    if (isLinkLike && !/^https?:\/\//i.test(form.fileUrl)) {
      return toast.error("Invalid link", "Must start with http:// or https://");
    }
    createMut.mutate({
      employeeId: myEmployeeId,
      title: form.title.trim(),
      description: form.description || undefined,
      category: form.category,
      fileUrl: form.fileUrl.trim(),
      fileType: form.fileType || "application/octet-stream",
      fileSize: form.fileSize,
      status: "Active",
      expiryDate: form.expiryDate || undefined,
    });
  };

  const byCategory = docs.reduce<Record<string, DocItem[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <FolderLock size={28} className="text-[#166534] mt-1.5" />
          <h1 className="text-page-title text-gray-900">My document vault</h1>
        </div>
        <button onClick={openUpload} className="btn btn-primary">
          <Plus size={14} /> Upload document
        </button>
      </div>

      {expiringDocs.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-yellow-800 font-medium mb-2">
            <AlertCircle size={16} /> Expiring Soon
          </div>
          <div className="space-y-1">
            {expiringDocs.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} className="block text-sm text-yellow-900 hover:underline">
                {d.title} — expires {new Date(d.expiryDate!).toLocaleDateString("en-IN")}
              </Link>
            ))}
          </div>
        </div>
      )}

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : docs.length === 0 ? (
        <div className="surface-card p-8 text-center text-gray-500">
          <FileText size={32} className="mx-auto mb-2 text-gray-300" />
          <p>No documents in your vault yet.</p>
          <button onClick={openUpload} className="btn btn-primary mt-3">
            <Plus size={14} /> Upload your first document
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byCategory).map(([cat, items]) => (
            <section key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-gray-500">{cat}</h2>
                <span className="px-2 py-0.5 rounded-full bg-[#166534]/10 text-[#166534] text-[10px] font-bold">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((d, i) => (
                  <div key={d.id} className="row-stagger surface-card p-4 flex items-start justify-between gap-3 hover:border-[#166534]/30 hover:shadow-md transition group" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <Link href={`/documents/${d.id}`} className="flex-1 min-w-0">
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#166534]/5 text-[#166534] flex items-center justify-center shrink-0">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900 text-sm truncate group-hover:text-[#166534]">{d.title}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                              d.status === "Active" ? "bg-green-100 text-green-700" :
                              d.status === "Expired" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600")}>
                              {d.status}
                            </span>
                            <span className="text-[11px] text-gray-500">{new Date(d.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                          </div>
                          {d.expiryDate && (
                            <p className="text-[11px] text-orange-600 mt-1 flex items-center gap-1">
                              <AlertCircle size={10} /> Expires {new Date(d.expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      {d.fileUrl && (
                        <a href={downloadHref(d)} download rel="noreferrer"
                          title="Download"
                          className="p-2 text-gray-400 hover:text-[#166534] hover:bg-[#166534]/5 rounded-lg transition">
                          <Download size={14} />
                        </a>
                      )}
                      <button onClick={() => openEdit(d)} title="Edit"
                        className="p-2 text-gray-400 hover:text-[#166534] hover:bg-[#166534]/5 rounded-lg transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteDoc(d)} title="Delete"
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload document" subtitle="Add a personal document to your vault.">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Title" required>
            <FormInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. PAN Card" required />
          </FormField>
          <FormField label="Category" required>
            <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} />
          </FormField>
          <FormField label="Source" required>
            <DocumentSourcePicker
              value={{ fileUrl: form.fileUrl, fileType: form.fileType, fileSize: form.fileSize }}
              onChange={(meta) => setForm({ ...form, ...meta })}
            />
          </FormField>
          <FormField label="Description">
            <FormTextarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional notes" />
          </FormField>
          <FormField label="Expiry Date">
            <FormInput type="date" min={todayInput()} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          </FormField>
          <FormActions>
            <button type="button" onClick={() => setShowUpload(false)} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="btn btn-primary">
              {createMut.isPending ? "Uploading..." : "Upload"}
            </button>
          </FormActions>
        </form>
      </Modal>

      <Modal open={!!editDoc} onClose={() => setEditDoc(null)} title={editDoc ? `Edit: ${editDoc.title}` : ""}>
        {editDoc && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMut.mutate({
                id: editDoc.id,
                body: {
                  title: form.title,
                  description: form.description || undefined,
                  category: form.category,
                  fileUrl: form.fileUrl,
                  fileType: form.fileType || "application/octet-stream",
                  expiryDate: form.expiryDate || undefined,
                },
              });
            }}
            className="space-y-4"
          >
            <FormField label="Title" required>
              <FormInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </FormField>
            <FormField label="Category" required>
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} />
            </FormField>
            <FormField label="Source" required>
              {/* Let the user replace the file / URL / Drive link on edit, not
                  just the metadata. Pre-seeded with the current source. */}
              <DocumentSourcePicker
                value={{ fileUrl: form.fileUrl, fileType: form.fileType, fileSize: form.fileSize }}
                onChange={(meta) => setForm({ ...form, ...meta })}
              />
            </FormField>
            <FormField label="Description">
              <FormTextarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </FormField>
            <FormField label="Expiry Date">
              <FormInput type="date" min={todayInput()} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </FormField>
            <FormActions>
              <button type="button" onClick={() => setEditDoc(null)} className="btn btn-ghost">Cancel</button>
              <button type="submit" disabled={updateMut.isPending} className="btn btn-primary">
                {updateMut.isPending ? "Saving…" : "Save Changes"}
              </button>
            </FormActions>
          </form>
        )}
      </Modal>

      <Modal open={!!deleteDoc} onClose={() => setDeleteDoc(null)} title="Delete Document">
        {deleteDoc && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Delete <strong>{deleteDoc.title}</strong>? This cannot be undone.
            </p>
            <FormActions>
              <button type="button" onClick={() => setDeleteDoc(null)} className="btn btn-ghost">Cancel</button>
              <button type="button" onClick={() => deleteMut.mutate(deleteDoc.id)} disabled={deleteMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </FormActions>
          </div>
        )}
      </Modal>
    </div>
  );
}
