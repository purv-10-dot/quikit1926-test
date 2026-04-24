"use client";

import { useEffect, useState } from "react";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Fuel } from "lucide-react";

interface DL { id: string; logNumber: string; logDate: string; fuelQty: string; amount: string | null; vehicleNo: string | null; project: { name: string } | null; machinery: { code: string; name: string } | null; }
interface Opt { id: string; name: string; code?: string }

export default function DieselLogPage() {
  const [projects, setProjects] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [machinery, setMachinery] = useState<Opt[]>([]);
  useEffect(() => {
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/locations").then(r => r.json()).then(j => j.success && setLocations(j.data));
    fetch("/api/masters/machinery").then(r => r.json()).then(j => j.success && setMachinery(j.data));
  }, []);

  const columns: ColumnConfig<DL>[] = [
    { key: "logNumber", label: "Log #", className: "font-mono text-xs" },
    { key: "logDate", label: "Date", render: (r) => new Date(r.logDate).toISOString().slice(0, 10), className: "text-xs" },
    { key: "machinery", label: "Machinery", render: (r) => r.machinery ? `${r.machinery.code} — ${r.machinery.name}` : (r.vehicleNo ?? "—") },
    { key: "fuelQty", label: "Fuel Qty (L)", render: (r) => r.fuelQty, className: "text-right" },
    { key: "amount", label: "Amount ₹", render: (r) => r.amount ?? "—", className: "text-right" },
    { key: "project", label: "Project", render: (r) => r.project?.name ?? "—" },
  ];
  const fields: FieldConfig[] = [
    { name: "logNumber", label: "Log #", type: "text", required: true, width: "half", transform: "uppercase" },
    { name: "logDate", label: "Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
    { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
    { name: "locationId", label: "Location", type: "select", required: true, width: "half", options: locations.map(l => ({ value: l.id, label: l.name })) },
    { name: "machineryId", label: "Machinery", type: "select", width: "half", options: [{ value: "", label: "— None —" }, ...machinery.map(m => ({ value: m.id, label: `${m.code} — ${m.name}` }))] },
    { name: "vehicleNo", label: "Vehicle No", type: "text", width: "half", hint: "If not a tracked machine" },
    { name: "driverName", label: "Driver Name", type: "text" },
    { name: "fuelQty", label: "Fuel Qty (L)", type: "number", required: true, width: "third", min: 0 },
    { name: "unitRate", label: "Rate/L", type: "number", width: "third", min: 0 },
    { name: "amount", label: "Amount", type: "number", width: "third", min: 0, hint: "Auto = qty × rate" },
    { name: "openingReading", label: "Opening KM/Hrs", type: "number", width: "half" },
    { name: "closingReading", label: "Closing KM/Hrs", type: "number", width: "half" },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ];
  return <MasterListPage<DL> title="Diesel Log" subtitle="Fuel consumption per machine/vehicle/day." icon={Fuel}
    endpoint="/api/store/diesel-log" columns={columns} fields={fields}
    newRecordDefault={{ logDate: new Date().toISOString().slice(0, 10), logNumber: `DL-${Date.now().toString().slice(-6)}` }}
    getId={(r) => r.id} getLabel={(r) => r.logNumber} />;
}
