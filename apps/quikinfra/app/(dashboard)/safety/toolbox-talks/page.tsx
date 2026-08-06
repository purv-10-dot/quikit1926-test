"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageFrame, PageHeader, PageContainer } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useMenuActions } from "@/hooks/use-permissions";
import { useProjects } from "@/hooks/use-masters";

interface ToolboxTalkRow {
  id?: string; photoAttached?: boolean;
  [key: string]: unknown;
}

export default function ToolboxTalksPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/safety/toolbox-talks");
  const { data: projectsResult } = useProjects();
  const projectOptions = (projectsResult?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

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
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project" },
      { key: "topic", label: "Topic", type: "text" as const, required: true, placeholder: "e.g. Working at Height — Harness Usage", span: 2 as const },
      { key: "conductedBy", label: "Conducted By", type: "text" as const, required: true, placeholder: "Safety officer name" },
      { key: "attendeesCount", label: "Attendees Count", type: "number" as const, required: true, placeholder: "Number of attendees" },
      { key: "photoAttached", label: "Photo Attached", type: "select" as const, options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }], placeholder: "Select" },
    ],
  };

  const columns: ColDef<ToolboxTalkRow>[] = [
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
      <PageFrame>
      <PageHeader
        title="Toolbox Talks"
        subtitle="Daily safety briefings and toolbox talk records"
        breadcrumbs={[{ label: "Safety", href: "/safety" }, { label: "Toolbox Talks" }]}
      />
      <PageContainer fill>
        <DataTable
          id="safety-toolbox-talks"
          columns={columns}
          data={data as unknown as ToolboxTalkRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="Record Talk"
        />
      </PageContainer>
      </PageFrame>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
