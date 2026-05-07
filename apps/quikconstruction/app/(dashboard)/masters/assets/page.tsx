"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useLocations } from "@/hooks/use-masters";
import { validateCode, validateMinLength, validateNonNegativeNumber, validateDateISO } from "@/lib/validators";

export default function AssetsPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result } = useQuery({
    queryKey: ["masters-assets"],
    queryFn: () => fetch("/api/masters/assets").then(r => r.json()),
  });
  const { data: projectsData } = useProjects();
  const { data: locData } = useLocations();

  const data = result?.data ?? [];
  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const locationOptions = (locData?.data ?? []).map((l: any) => ({ value: l.id, label: l.name }));

  const columns: ColDef<any>[] = [
    { key: "assetCode", label: "Asset Code", sortable: true, searchable: true },
    { key: "name", label: "Name", sortable: true, searchable: true },
    { key: "category", label: "Category", type: "select", sortable: true,
      options: ["Scaffolding", "Shuttering", "Safety Equipment", "Survey", "Electrical"] },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "condition", label: "Condition", type: "select", sortable: true,
      options: ["Good", "Needs Repair", "Condemned"],
      render: (row) => {
        const c = row.condition ?? "";
        const color = c === "Good" ? "bg-green-50 text-green-700" : c === "Needs Repair" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{c}</span>;
      },
    },
    { key: "purchaseDate", label: "Purchase Date", type: "date", sortable: true },
    { key: "purchaseValue", label: "Value (₹)", type: "number", sortable: true,
      render: (row) => row.purchaseValue ? `₹ ${Number(row.purchaseValue).toLocaleString("en-IN")}` : "—" },
    { key: "currentLocation", label: "Location", sortable: true, searchable: true },
    { key: "status", label: "Status", type: "select", sortable: true,
      options: ["In Use", "Under Maintenance", "Available", "Disposed"],
      render: (row) => <StatusChip status={row.status ?? ""} /> },
  ];

  const config = {
    title: "Register Asset", subtitle: "Add a new asset or tool",
    apiEndpoint: "/api/masters/assets",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["masters-assets"] }),
    fields: [
      { key: "assetCode", label: "Asset Code", type: "text" as const, required: true, placeholder: "AST-001",
        transform: (v: string) => v.toUpperCase(), validator: (v: string) => validateCode(v, "Asset code") },
      { key: "name", label: "Asset Name", type: "text" as const, required: true, placeholder: "e.g. Cuplock Scaffolding Set",
        validator: (v: string) => validateMinLength(v, 2, "Asset name") },
      { key: "category", label: "Category", type: "select" as const, required: true, options: [
        { value: "Scaffolding", label: "Scaffolding" }, { value: "Shuttering", label: "Shuttering" },
        { value: "Safety Equipment", label: "Safety Equipment" }, { value: "Survey", label: "Survey" }, { value: "Electrical", label: "Electrical" },
      ]},
      { key: "projectId", label: "Assigned Project", type: "select" as const, options: projectOptions, placeholder: "Select project" },
      { key: "condition", label: "Condition", type: "select" as const, required: true, options: [
        { value: "Good", label: "Good" }, { value: "Needs Repair", label: "Needs Repair" }, { value: "Condemned", label: "Condemned" },
      ]},
      { key: "status", label: "Status", type: "select" as const, required: true, options: [
        { value: "In Use", label: "In Use" }, { value: "Under Maintenance", label: "Under Maintenance" },
        { value: "Available", label: "Available" }, { value: "Disposed", label: "Disposed" },
      ]},
      { key: "purchaseDate", label: "Purchase Date", type: "date" as const,
        validator: (v: string) => validateDateISO(v, "Purchase date") },
      { key: "purchaseValue", label: "Purchase Value (₹)", type: "number" as const, placeholder: "0", min: 0,
        validator: (v: string) => validateNonNegativeNumber(v, "Purchase value") },
      { key: "currentLocation", label: "Current Location", type: "text" as const, placeholder: "e.g. Site Store", span: 2 as const },
    ],
  };

  return (
    <>
      <PageHeader title="Assets / Tool Register" subtitle="Track assets, tools, and equipment across projects"
        breadcrumbs={[{ label: "Masters", href: "/masters" }, { label: "Assets" }]} />
      <PageContainer>
        <DataTable id="master-assets" columns={columns} data={data}
          onAdd={() => setDrawerOpen(true)} addLabel="Register Asset" />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
