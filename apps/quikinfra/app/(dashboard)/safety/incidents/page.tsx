"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useMenuActions } from "@/hooks/use-permissions";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Open", label: "Open" },
  { key: "Investigating", label: "Investigating" },
  { key: "Closed", label: "Closed" },
];

const PROJECT_OPTIONS: { value: string; label: string }[] = [];

const TYPE_OPTIONS = [
  { value: "Near Miss", label: "Near Miss" },
  { value: "First Aid", label: "First Aid" },
  { value: "Lost Time", label: "Lost Time" },
  { value: "Fatal", label: "Fatal" },
];

const SEVERITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "Investigating", label: "Investigating" },
  { value: "Closed", label: "Closed" },
];

interface IncidentRow {
  id: string; status?: string; severity?: string; injuredPerson?: string;
  [key: string]: unknown;
}

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/safety/incidents");

  const { data: result, isLoading } = useQuery({
    queryKey: ["safety-incidents"],
    queryFn: () => fetch(`/api/safety/incidents`).then(r => r.json()),
  });

  const allData = (result?.data ?? []) as IncidentRow[];
  const data = activeTab === "all" ? allData : allData.filter((r) => r.status === activeTab);

  const config = {
    title: "Report Incident",
    subtitle: "Log a safety incident, near miss, or observation",
    apiEndpoint: "/api/safety/incidents",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safety-incidents"] }),
    fields: [
      { key: "date", label: "Incident Date", type: "date" as const, required: true },
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "type", label: "Incident Type", type: "select" as const, required: true, options: TYPE_OPTIONS, placeholder: "Select type" },
      { key: "severity", label: "Severity", type: "select" as const, required: true, options: SEVERITY_OPTIONS, placeholder: "Select severity" },
      { key: "description", label: "Description", type: "textarea" as const, required: true, placeholder: "Describe what happened...", span: 2 as const },
      { key: "injuredPerson", label: "Injured Person", type: "text" as const, placeholder: "Name (if applicable)" },
      { key: "status", label: "Status", type: "select" as const, required: true, options: STATUS_OPTIONS, placeholder: "Select status" },
      { key: "capa", label: "CAPA (Corrective/Preventive Action)", type: "textarea" as const, placeholder: "Actions taken or recommended...", span: 2 as const },
    ],
  };

  const severityColor = (s: string) => {
    if (s === "Critical") return "bg-red-100 text-red-800";
    if (s === "High") return "bg-orange-100 text-orange-800";
    if (s === "Medium") return "bg-amber-100 text-amber-800";
    return "bg-green-100 text-green-800";
  };

  const columns: ColDef<IncidentRow>[] = [
    { key: "incidentNo", label: "Incident No", sortable: true, searchable: true },
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    {
      key: "type", label: "Type", type: "select",
      options: ["Near Miss", "First Aid", "Lost Time", "Fatal"],
      sortable: true,
    },
    { key: "description", label: "Description", searchable: true },
    { key: "injuredPerson", label: "Injured Person", render: (row) => row.injuredPerson || "—" },
    {
      key: "severity", label: "Severity", type: "select",
      options: ["Low", "Medium", "High", "Critical"],
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${severityColor(row.severity ?? "")}`}>{row.severity}</span>
      ),
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["Open", "Investigating", "Closed"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Incident Register"
        subtitle="Safety incident reporting and CAPA tracking"
        breadcrumbs={[{ label: "Safety", href: "/safety" }, { label: "Incidents" }]}
      />
      <TabBar tabs={STATUS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="safety-incidents"
          columns={columns}
          data={data}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="Report Incident"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
