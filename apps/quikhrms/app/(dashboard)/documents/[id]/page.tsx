"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { FileText, ArrowLeft, Check, X, Share2, Download, Calendar } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";

interface Ack { id: string; employeeId: string; status: string; acknowledgedAt: string | null; signature: string | null; }
interface Share { id: string; sharedWith: string; sharedBy: string; accessLevel: string; expiresAt: string | null; }
interface DocDetail {
  id: string; title: string; description: string | null; category: string; status: string;
  fileUrl: string; fileType: string; fileSize: number; version: number;
  expiryDate: string | null; tags: string[] | null; metadata: Record<string, unknown> | null;
  employeeId: string | null; uploadedBy: string; createdAt: string;
  acknowledgments: Ack[]; shares: Share[];
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApiClient();
  const qc = useQueryClient();
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ sharedWith: "", accessLevel: "View" as "View" | "Download", expiresAt: "" });
  const [showAck, setShowAck] = useState(false);
  const [signature, setSignature] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.get<DocDetail>(`/api/v1/hrms/documents/${id}`),
  });

  const shareMut = useMutation({
    mutationFn: (body: { sharedWith: string[]; accessLevel: string; expiresAt?: string }) =>
      api.post(`/api/v1/hrms/documents/${id}/share`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document", id] }); setShowShare(false); },
  });

  const ackMut = useMutation({
    mutationFn: (body: { action: string; signature?: string }) => api.post(`/api/v1/hrms/documents/${id}/acknowledge`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document", id] }); setShowAck(false); setSignature(""); },
  });

  if (isLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="80%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );
  const d = data?.data;
  if (!d) return <div className="p-8 text-center text-gray-500">Document not found</div>;

  const metadataContent = d.metadata && typeof d.metadata === "object" && "content" in d.metadata ? (d.metadata as { content?: string }).content : null;

  return (
    <div className="max-w-5xl">
      <Link href="/documents" className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-[13px] font-semibold text-[#16243A] bg-[#16243A]/10 hover:bg-[#16243A] hover:text-white rounded-full transition-colors">
        <ArrowLeft size={14} /> Back to library
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <FileText className="text-[#3b82f6] mt-1" />
            <div>
              <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">{d.title}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span className="px-2 py-0.5 bg-[#dbeafe] text-[#2563eb] rounded-full text-xs font-medium">{d.category}</span>
                <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", d.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")}>{d.status}</span>
                <span>v{d.version}</span>
                <span>•</span>
                <span>{d.fileType}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAck(true)} className="flex items-center gap-1 border border-green-500 text-green-600 px-3 py-1.5 rounded-lg text-sm hover:bg-green-50">
              <Check size={14} /> Acknowledge
            </button>
            <button onClick={() => setShowShare(true)} className="flex items-center gap-1 border border-[var(--border)] px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
              <Share2 size={14} /> Share
            </button>
            {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-[#16243A] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#2563eb]">
              <Download size={14} /> Open
            </a>}
          </div>
        </div>

        {d.description && <p className="text-sm text-gray-700 mb-3">{d.description}</p>}
        {d.tags && d.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {d.tags.map((t) => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t}</span>)}
          </div>
        )}
        {d.expiryDate && (
          <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">
            <Calendar size={14} /> Expires {new Date(d.expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        )}
      </div>

      {metadataContent && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Generated Content</h2>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">{metadataContent}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Acknowledgments ({d.acknowledgments.length})</h2>
          {d.acknowledgments.length === 0 ? <p className="text-sm text-gray-500">None yet</p> : (
            <div className="space-y-2">
              {d.acknowledgments.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                  <span className="font-mono text-xs text-gray-600">{a.employeeId}</span>
                  <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium",
                    a.status === "Acknowledged" ? "bg-green-100 text-green-700" :
                    a.status === "Declined" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700")}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Shares ({d.shares.length})</h2>
          {d.shares.length === 0 ? <p className="text-sm text-gray-500">Not shared</p> : (
            <div className="space-y-2">
              {d.shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                  <span className="font-mono text-xs text-gray-600">{s.sharedWith}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#dbeafe] text-[#2563eb] rounded-full text-xs">{s.accessLevel}</span>
                    {s.expiresAt && <span className="text-xs text-gray-400">→ {new Date(s.expiresAt).toLocaleDateString("en-IN")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showShare} onClose={() => setShowShare(false)} title="Share Document">
        <form onSubmit={(e) => {
          e.preventDefault();
          shareMut.mutate({
            sharedWith: shareForm.sharedWith.split(",").map((s) => s.trim()).filter(Boolean),
            accessLevel: shareForm.accessLevel,
            expiresAt: shareForm.expiresAt || undefined,
          });
        }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Recipient Employee IDs (comma-separated)</label>
            <input required value={shareForm.sharedWith} onChange={(e) => setShareForm({ ...shareForm, sharedWith: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Access Level</label>
            <Select
              value={shareForm.accessLevel}
              onChange={(v) => setShareForm({ ...shareForm, accessLevel: v as "View" | "Download" })}
              options={[
                { value: "View", label: "View" },
                { value: "Download", label: "Download" },
              ]}
            /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Expires At (optional)</label>
            <input type="date" value={shareForm.expiresAt} onChange={(e) => setShareForm({ ...shareForm, expiresAt: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowShare(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">Share</button>
          </div>
        </form>
      </Modal>

      <Modal open={showAck} onClose={() => setShowAck(false)} title="Acknowledge Document">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">I acknowledge I have read and understood the document <b>{d.title}</b>.</p>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Your signature (type name)</label>
            <input value={signature} onChange={(e) => setSignature(e.target.value)}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" placeholder="John Doe" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => ackMut.mutate({ action: "Declined" })} className="flex items-center gap-1 border border-red-300 text-red-600 px-3 py-2 rounded-lg text-sm hover:bg-red-50">
              <X size={14} /> Decline
            </button>
            <button type="button" onClick={() => ackMut.mutate({ action: "Acknowledged", signature })}
              disabled={!signature}
              className="flex items-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              <Check size={14} /> Acknowledge
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
