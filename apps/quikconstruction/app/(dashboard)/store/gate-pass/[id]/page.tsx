"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Gp {
  id: string; gatePassNumber: string; type: string; gatePassDate: string; status: string;
  vehicleNo: string | null; driverName: string | null; driverPhone: string | null; purpose: string | null;
  referenceType: string | null; referenceNumber: string | null;
  project: { name: string } | null; location: { name: string } | null;
}

export default function GatePassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [gp, setGp] = useState<Gp | null>(null);
  useEffect(() => {
    fetch(`/api/store/gate-pass/${id}`).then(r => r.json()).then(j => j.success && setGp(j.data));
  }, [id]);
  if (!gp) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const meta = [
    { label: "Type",        value: gp.type.replace("_", " ") },
    { label: "Status",      value: gp.status },
    { label: "Date",        value: new Date(gp.gatePassDate).toISOString().slice(0, 10) },
    { label: "Project",     value: gp.project?.name ?? "—" },
    { label: "Location",    value: gp.location?.name ?? "—" },
    { label: "Vehicle No",  value: gp.vehicleNo ?? "—" },
    { label: "Driver",      value: gp.driverName ?? "—" },
    { label: "Driver Phone", value: gp.driverPhone ?? "—" },
    { label: "Reference",   value: gp.referenceType && gp.referenceNumber ? `${gp.referenceType.toUpperCase()} — ${gp.referenceNumber}` : "—" },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/store/gate-pass" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Gate Passes
      </Link>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-lg font-semibold text-gray-900">{gp.gatePassNumber}</h1>
        <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-2 py-0.5 rounded">{gp.status}</span>
      </div>
      {gp.purpose && <p className="text-xs text-gray-600 mb-5">{gp.purpose}</p>}
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
