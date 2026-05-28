"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Dl {
  id: string; logNumber: string; logDate: string;
  fuelQty: string; unitRate: string | null; amount: string | null;
  openingReading: string | null; closingReading: string | null;
  vehicleNo: string | null; driverName: string | null; remarks: string | null;
  project: { name: string } | null; location: { name: string } | null;
  machinery: { id: string; code: string; name: string } | null;
}

export default function DieselLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [dl, setDl] = useState<Dl | null>(null);
  useEffect(() => {
    fetch(`/api/store/diesel-log/${id}`).then(r => r.json()).then(j => j.success && setDl(j.data));
  }, [id]);
  if (!dl) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const kmsRun = dl.openingReading && dl.closingReading
    ? Number(dl.closingReading) - Number(dl.openingReading)
    : null;
  const efficiency = kmsRun && Number(dl.fuelQty) > 0 ? (kmsRun / Number(dl.fuelQty)).toFixed(2) : null;

  const meta = [
    { label: "Date",       value: new Date(dl.logDate).toISOString().slice(0, 10) },
    { label: "Project",    value: dl.project?.name ?? "—" },
    { label: "Location",   value: dl.location?.name ?? "—" },
    { label: "Machinery",  value: dl.machinery ? `${dl.machinery.code} — ${dl.machinery.name}` : "—" },
    { label: "Vehicle No", value: dl.vehicleNo ?? "—" },
    { label: "Driver",     value: dl.driverName ?? "—" },
    { label: "Fuel Qty (L)", value: dl.fuelQty },
    { label: "Unit Rate",  value: dl.unitRate ? `₹${dl.unitRate}` : "—" },
    { label: "Amount",     value: dl.amount ? `₹${dl.amount}` : "—" },
    { label: "Opening Km/Hr", value: dl.openingReading ?? "—" },
    { label: "Closing Km/Hr", value: dl.closingReading ?? "—" },
    { label: "Km/Hr Run",  value: kmsRun ?? "—" },
    { label: "Km/L",       value: efficiency ?? "—" },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/store/diesel-log" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Diesel Log
      </Link>
      <h1 className="text-lg font-semibold text-gray-900 mb-5">{dl.logNumber}</h1>
      {dl.remarks && <p className="text-xs text-gray-600 mb-5">{dl.remarks}</p>}
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
