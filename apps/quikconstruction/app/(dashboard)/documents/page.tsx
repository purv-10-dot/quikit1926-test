"use client";

import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { EmptyState } from "@quikit/ui";

interface Doc { id: string; fileName: string; refType: string; refId: string; mimeType: string; sizeBytes: number; createdAt: string; uploadedBy: string }

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export default function DocsBrowse() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  useEffect(() => { fetch("/api/documents").then(r => r.json()).then(j => j.success && setDocs(j.data)); }, []);
  if (!docs) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Documents</h1>
      <p className="text-sm text-gray-500 mb-6">All files attached to records across the system.</p>
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" message="Upload files from any invoice, bill, project, or incident detail page." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">File</th>
              <th className="text-left px-3 py-2">Attached to</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-right px-3 py-2">Size</th>
              <th className="text-left px-3 py-2">Uploaded</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>{docs.map(d => (
              <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">{d.fileName}</td>
                <td className="px-3 py-2 text-xs font-mono"><span className="uppercase">{d.refType}</span> <span className="text-gray-400">{d.refId.slice(0, 8)}…</span></td>
                <td className="px-3 py-2 text-xs text-gray-500">{d.mimeType}</td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">{fmtBytes(d.sizeBytes)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(d.createdAt).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-right"><a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Download className="h-3.5 w-3.5" /></a></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
