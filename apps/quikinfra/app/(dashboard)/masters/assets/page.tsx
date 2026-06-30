"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useLocations } from "@/hooks/use-masters";
import { useMenuActions } from "@/hooks/use-permissions";
import { validateCode, validateMinLength, validateNonNegativeNumber, validateDateISO } from "@/lib/validators";

interface AssetRow {
  id: string; assetCode?: string; name?: string; category?: string;
  projectName?: string; condition?: string; purchaseDate?: string;
  purchaseValue?: number | string; currentLocation?: string; status?: string;
  [key: string]: unknown;
}

export default function AssetsPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/masters/assets");

  const { data: result } = useQuery({
    queryKey: ["masters-assets"],
    queryFn: () => fetch("/api/masters/assets").then(r => r.json()),
  });
  const { data: projectsData } = useProjects();
  const { data: locData } = useLocations();

  const data = result?.data ?? [];
  const projects = projectsData?.data ?? [];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));
  const projectCityById = new Map(
    projects.map((p) => [String(p.id), String(p.city ?? "").trim()]),
  );
  const rawLocations = locData?.data ?? [];
  const locationOptions = rawLocations.filter((l) => l?.status === "active").map((l) => ({ value: l.id, label: l.name }));

  const columns: ColDef<AssetRow>[] = [
    { key: "assetCode", label: "Asset Code", sortable: true, searchable: true },
    { key: "name", label: "Name", sortable: true, searchable: true },
    { key: "category", label: "Category", type: "select", sortable: true,
      options: ["Scaffolding", "Shuttering", "Safety Equipment", "Survey", "Electrical", "Others"] },
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
        { value: "Others", label: "Others" },
      ]},
      {
        key: "projectId",
        label: "Assigned Project",
        type: "select" as const,
        options: projectOptions,
        placeholder: "Select project",
        onChange: (value: string, formData: Record<string, string>) => {
          // If the user switches projects, clear the location if it no longer
          // belongs to the selected project. Prevents mismatched project/location.
          const currentLocName = String(formData.currentLocation ?? "").trim();
          if (!value || !currentLocName) return;
          const stillValid = rawLocations.some(
            (l) =>
              (String(l.projectId ?? "") === value || !String(l.projectId ?? "").trim()) &&
              String(l.name ?? "").trim() === currentLocName,
          );
          if (!stillValid) return { currentLocation: "" };
        },
      },
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
      {
        key: "currentLocation",
        label: "Current Location",
        type: "select" as const,
        span: 2 as const,
        searchable: true,
        placeholder: "Select project first",
        disabled: (fd: Record<string, string>) => !String(fd.projectId ?? "").trim(),
        options: (fd: Record<string, string>) => {
          const pid = String(fd.projectId ?? "").trim();
          if (!pid) return [];
          const city = projectCityById.get(pid) ?? "";
          const citySuffix = city ? ` — ${city}` : "";
          return rawLocations
            // Mirror Locations scoping semantics used elsewhere:
            // project locations + global locations (no projectId).
            .filter(
              (l) =>
                String(l.projectId ?? "") === pid || !String(l.projectId ?? "").trim(),
            )
            .map((l) => ({
              value: String(l.name ?? "").trim(),
              label: `${l.name}${citySuffix}`,
            }));
        },
      },
      { key: "currentStock", label: "Current Stock", type: "number" as const, placeholder: "0", min: 0,
        validator: (v: string) => validateNonNegativeNumber(v, "Current stock") },
      { key: "minStockLevel", label: "Minimum Stock Level", type: "number" as const, placeholder: "0", min: 0,
        validator: (v: string) => validateNonNegativeNumber(v, "Minimum stock level") },
      { key: "reorderLevel", label: "Reorder Level", type: "number" as const, placeholder: "0", min: 0, span: 2 as const,
        validator: (v: string) => validateNonNegativeNumber(v, "Reorder level") },
    ],
  };

  return (
    <>
      <PageHeader title="Assets / Tool Register" subtitle="Track assets, tools, and equipment across projects"
        breadcrumbs={[{ label: "Masters", href: "/masters" }, { label: "Assets" }]} />
      <PageContainer>
        <DataTable id="master-assets" columns={columns} data={data as AssetRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined} addLabel="Register Asset" />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
