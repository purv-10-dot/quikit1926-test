"use client";

import { useEffect, useState } from "react";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { DoorOpen } from "lucide-react";

interface Gp { id: string; gatePassNumber: string; type: string; vehicleNo: string | null; gatePassDate: string; status: string; project: { name: string } | null; location: { name: string } | null }
interface Opt { id: string; name: string }

export default function GatePassPage() {
  const [projects, setProjects] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  useEffect(() => {
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/locations").then(r => r.json()).then(j => j.success && setLocations(j.data));
  }, []);

  const columns: ColumnConfig<Gp>[] = [
    { key: "gatePassNumber", label: "Pass #", className: "font-mono text-xs" },
    { key: "type", label: "Type", render: (r) => <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">{r.type.replace("_", " ")}</span> },
    { key: "vehicleNo", label: "Vehicle", render: (r) => r.vehicleNo ?? "—" },
    { key: "location", label: "Location", render: (r) => r.location?.name ?? "—" },
    { key: "gatePassDate", label: "Date", render: (r) => new Date(r.gatePassDate).toISOString().slice(0, 10), className: "text-xs" },
  ];
  const fields: FieldConfig[] = [
    { name: "gatePassNumber", label: "Pass #", type: "text", required: true, width: "half", transform: "uppercase" },
    { name: "gatePassDate", label: "Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
    { name: "type", label: "Type", type: "select", required: true, width: "half", options: [
      { value: "inward", label: "Inward" }, { value: "outward", label: "Outward" },
      { value: "returnable", label: "Returnable" }, { value: "non_returnable", label: "Non-Returnable" },
    ] },
    { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
    { name: "locationId", label: "Location", type: "select", required: true, width: "half", options: locations.map(l => ({ value: l.id, label: l.name })) },
    { name: "vehicleNo", label: "Vehicle No", type: "text", width: "half" },
    { name: "driverName", label: "Driver Name", type: "text", width: "half" },
    { name: "driverPhone", label: "Driver Phone", type: "text", width: "half" },
    { name: "purpose", label: "Purpose", type: "textarea" },
    { name: "referenceType", label: "Reference Type", type: "select", width: "half", options: [
      { value: "", label: "None" }, { value: "grn", label: "GRN" }, { value: "issue", label: "Issue" },
      { value: "return", label: "Return" }, { value: "transfer", label: "Transfer" },
    ] },
    { name: "referenceNumber", label: "Reference #", type: "text", width: "half" },
  ];
  return <MasterListPage<Gp> title="Gate Passes" subtitle="Inward/outward register. Links to GRN/Issue/Return where relevant." icon={DoorOpen}
    endpoint="/api/store/gate-pass" columns={columns} fields={fields}
    newRecordDefault={{ type: "inward", gatePassDate: new Date().toISOString().slice(0, 10), gatePassNumber: `GP-${Date.now().toString().slice(-6)}` }}
    getId={(r) => r.id} getLabel={(r) => r.gatePassNumber} />;
}
