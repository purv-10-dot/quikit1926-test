"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDateTimeIST } from "@/lib/format/datetime";

interface Hind {
  id: string; hindranceDate: string; category: string; title: string; description: string | null;
  startDate: string; endDate: string | null; daysImpacted: number | null; status: string;
  resolvedAt: string | null; resolvedBy: string | null;
  project: { id: string; name: string; code: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700", resolved: "bg-amber-100 text-amber-700", closed: "bg-green-100 text-green-700",
};

export default function HindranceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [h, setH] = useState<Hind | null>(null);
  useEffect(() => {
    fetch(`/api/projects/hindrance/${id}`).then(r => r.json()).then(j => j.success && setH(j.data));
  }, [id]);
  if (!h) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const meta = [
    { label: "Project",       value: h.project?.name ?? "—" },
    { label: "Category",      value: h.category.replace("_", " ") },
    { label: "Hindrance Date", value: new Date(h.hindranceDate).toISOString().slice(0, 10) },
    { label: "Start",         value: new Date(h.startDate).toISOString().slice(0, 10) },
    { label: "End",           value: h.endDate ? new Date(h.endDate).toISOString().slice(0, 10) : "— ongoing" },
    { label: "Days Impacted", value: h.daysImpacted ?? "—" },
    { label: "Resolved By",   value: h.resolvedBy ?? "—" },
    { label: "Resolved At",   value: formatDateTimeIST(h.resolvedAt) },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/projects/hindrance" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Hindrances</Link>
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-lg font-semibold text-gray-900">{h.title}</h1>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${STATUS_BADGE[h.status] ?? "bg-gray-100 text-gray-600"}`}>{h.status}</span>
      </div>
      {h.description && <p className="text-sm text-gray-700 mb-5">{h.description}</p>}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-gray-100">
          {meta.map((m, i) => (
            <div key={i} className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div>
              <div className="text-sm text-gray-900 mt-0.5 break-words">{m.value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
