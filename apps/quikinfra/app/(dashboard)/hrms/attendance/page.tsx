"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const PROJECT_OPTIONS: { value: string; label: string }[] = [];

const STATUS_OPTIONS = [
  { value: "Present", label: "Present" },
  { value: "Absent", label: "Absent" },
  { value: "Half Day", label: "Half Day" },
  { value: "Leave", label: "Leave" },
];

export default function AttendancePage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["hrms-attendance"],
    queryFn: () => fetch(`/api/hrms/attendance`).then(r => r.json()),
  });

  const data = result?.data ?? [];

  const config = {
    title: "Record Attendance",
    subtitle: "Mark daily attendance for site staff",
    apiEndpoint: "/api/hrms/attendance",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hrms-attendance"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "date", label: "Date", type: "date" as const, required: true },
      { key: "name", label: "Staff Name", type: "text" as const, required: true, placeholder: "Full name" },
      { key: "designation", label: "Designation", type: "text" as const, placeholder: "e.g. Site Engineer" },
      { key: "department", label: "Department", type: "text" as const, placeholder: "e.g. Civil, MEP, Store" },
      { key: "inTime", label: "In Time", type: "text" as const, placeholder: "08:00" },
      { key: "outTime", label: "Out Time", type: "text" as const, placeholder: "18:00" },
      { key: "status", label: "Status", type: "select" as const, required: true, options: STATUS_OPTIONS, placeholder: "Select status" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "name", label: "Staff Name", sortable: true, searchable: true },
    { key: "designation", label: "Designation", sortable: true },
    { key: "department", label: "Department", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "inTime", label: "In Time", render: (row) => row.inTime || "—" },
    { key: "outTime", label: "Out Time", render: (row) => row.outTime || "—" },
    {
      key: "status", label: "Status", type: "select",
      options: ["Present", "Absent", "Half Day", "Leave"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Attendance Register"
        subtitle="Daily attendance tracking for site staff"
        breadcrumbs={[{ label: "HRMS", href: "/hrms" }, { label: "Attendance" }]}
      />
      <PageContainer>
        <DataTable
          id="hrms-attendance"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Record Attendance"
          defaultSort="date"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
