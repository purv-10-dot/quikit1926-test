"use client";

import { useState } from "react";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useDieselLogs } from "@/hooks/use-store";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useLocations, useMachinery } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";

export default function DieselLogPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useDieselLogs({});
  const data = result?.data ?? [];

  const { data: projectsData } = useProjects();
  const { data: locationsData } = useLocations();
  const { data: machineryData } = useMachinery();

  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const locationOptions = (locationsData?.data ?? []).map((l: any) => ({ value: l.id, label: l.name }));
  const machineryOptions = (machineryData?.data ?? []).map((m: any) => ({ value: m.id, label: m.name }));

  const config = {
    title: "New Diesel Log Entry",
    subtitle: "Record fuel consumption for a machine",
    apiEndpoint: "/api/store/diesel-logs",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["diesel-logs"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project" },
      { key: "locationId", label: "Location", type: "select" as const, options: locationOptions, placeholder: "Select location" },
      { key: "machineryId", label: "Machinery", type: "select" as const, required: true, options: machineryOptions, placeholder: "Select machinery" },
      { key: "logDate", label: "Log Date", type: "date" as const, required: true },
      { key: "openingReading", label: "Opening Reading", type: "number" as const, placeholder: "Opening meter" },
      { key: "closingReading", label: "Closing Reading", type: "number" as const, placeholder: "Closing meter" },
      { key: "quantityIssued", label: "Quantity Issued (L)", type: "number" as const, required: true, placeholder: "Litres" },
      { key: "unitRate", label: "Unit Rate", type: "number" as const, placeholder: "Rate per litre" },
      { key: "operatorName", label: "Operator Name", type: "text" as const, placeholder: "Operator name" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "logDate", label: "Date", type: "date", sortable: true },
    { key: "machineryName", label: "Machine", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "openingReading", label: "Opening", type: "number", render: (row) => row.openingReading ?? "—" },
    { key: "closingReading", label: "Closing", type: "number", render: (row) => row.closingReading ?? "—" },
    { key: "quantityIssued", label: "Qty (L)", type: "number", sortable: true },
    {
      key: "unitRate", label: "Rate", type: "number",
      render: (row) => row.unitRate ? `₹ ${Number(row.unitRate).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "totalCost", label: "Cost", type: "number", sortable: true,
      render: (row) => row.totalCost ? `₹ ${Number(row.totalCost).toLocaleString("en-IN")}` : "—",
    },
    { key: "operatorName", label: "Operator", render: (row) => row.operatorName ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title="Diesel / Fuel Log Book"
        subtitle="Machine-wise fuel consumption tracking"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Diesel Log" }]}
      />
      <PageContainer>
        <DataTable
          id="store-diesel-log"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Log Entry"
          defaultSort="logDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
