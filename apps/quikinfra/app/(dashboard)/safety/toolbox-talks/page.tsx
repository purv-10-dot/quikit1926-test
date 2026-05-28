"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useMenuActions } from "@/hooks/use-permissions";

const PROJECT_OPTIONS: { value: string; label: string }[] = [];

export default function ToolboxTalksPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/safety/toolbox-talks");

  const { data: result, isLoading } = useQuery({
    queryKey: ["safety-toolbox-talks"],
    queryFn: () => fetch(`/api/safety/toolbox-talks`).then(r => r.json()),
  });

  const data = result?.data ?? [];

  const config = {
    title: "Record Toolbox Talk",
    subtitle: "Log a daily toolbox talk / safety briefing",
    apiEndpoint: "/api/safety/toolbox-talks",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safety-toolbox-talks"] }),
    fields: [
      { key: "date", label: "Date", type: "date" as const, required: true },
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "topic", label: "Topic", type: "text" as const, required: true, placeholder: "e.g. Working at Height — Harness Usage", span: 2 as const },
      { key: "conductedBy", label: "Conducted By", type: "text" as const, required: true, placeholder: "Safety officer name" },
      { key: "attendeesCount", label: "Attendees Count", type: "number" as const, required: true, placeholder: "Number of attendees" },
      { key: "photoAttached", label: "Photo Attached", type: "select" as const, options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }], placeholder: "Select" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "topic", label: "Topic", sortable: true, searchable: true },
    { key: "conductedBy", label: "Conducted By", sortable: true, searchable: true },
    { key: "attendeesCount", label: "Attendees", type: "number", sortable: true },
    {
      key: "photoAttached", label: "Photo", type: "boolean",
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.photoAttached ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
          {row.photoAttached ? "Yes" : "No"}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Toolbox Talks"
        subtitle="Daily safety briefings and toolbox talk records"
        breadcrumbs={[{ label: "Safety", href: "/safety" }, { label: "Toolbox Talks" }]}
      />
      <PageContainer>
        <DataTable
          id="safety-toolbox-talks"
          columns={columns}
          data={data}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="Record Talk"
          defaultSort="date"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
