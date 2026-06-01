"use client";

import { useState } from "react";
import { FolderKanban } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { ProjectFormDrawer } from "./ProjectFormDrawer";
import { useProjects, useUpdateProject, useCreateProject, useCompanies, useCustomers } from "@/hooks/use-masters";

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  clientName?: string;
  city?: string;
  state?: string;
  projectValue?: string;
  startDate?: string;
  status: string;
}

const columns: MasterColumnDef<ProjectRow>[] = [
  { key: "code", label: "Code", width: "100px" },
  {
    key: "name",
    label: "Project Name",
    render: (row) => (
      <div>
        <span className="font-medium text-gray-900">{row.name}</span>
        {row.city && <span className="text-xs text-gray-500 ml-1">({row.city})</span>}
      </div>
    ),
  },
  { key: "clientName", label: "Client" },
  {
    key: "projectValue",
    label: "Value",
    render: (row) =>
      row.projectValue ? `₹ ${Number(row.projectValue).toLocaleString("en-IN")}` : "—",
  },
  { key: "startDate", label: "Start Date" },
  { key: "status", label: "Status", type: "status" },
];

// Field definitions for the Import drawer. Order = mapping-screen order.
// The labels here also drive auto-mapping: if the user's spreadsheet
// header matches one of these labels (or the underlying key), the
// importer pre-selects that column without the user having to map it.
const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "Code", required: true, hint: "Unique project code (e.g. RES-PALM)" },
  { key: "name", label: "Project Name", required: true },
  { key: "clientName", label: "Client", hint: "Optional — must match an existing customer if provided" },
  { key: "projectType", label: "Project Type" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode" },
  { key: "siteGstin", label: "Site GSTIN" },
  { key: "startDate", label: "Start Date", hint: "YYYY-MM-DD" },
  { key: "expectedEndDate", label: "Expected End Date", hint: "YYYY-MM-DD" },
  { key: "projectValue", label: "Project Value" },
  { key: "budget", label: "Budget" },
  { key: "purchaseLimit", label: "Purchase Limit" },
  { key: "status", label: "Status", hint: "active | draft | on_hold | completed | cancelled" },
];

export default function ProjectsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProjectRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { data: result, isLoading } = useProjects();
  const { data: customersResp } = useCustomers();
  const updateMutation = useUpdateProject();
  const createMutation = useCreateProject();

  // Soft delete — projects have a multi-state `status` field
  // (active/draft/on_hold/completed/cancelled) but we use "inactive" as
  // the universal soft-delete marker so MasterListPage's filter works
  // the same as every other master. "inactive" is added to the Status
  // dropdown in ProjectFormDrawer so users can restore via Edit.
  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  // Resolve a free-text master name (Company / Client) from the import
  // file to its UUID by case-insensitive match against the existing
  // master rows. Importers can't realistically be expected to type
  // UUIDs, but we also can't auto-create companies from a Project
  // import — so unknown names fail the row with a clear message.
  // Lookup is forgiving about whitespace, casing, and stray trailing
  // punctuation (".", ",", ";", "!"). Real-world spreadsheets often
  // have those pasted in from PDFs or contracts — strip them so e.g.
  // "Commercial Synbags International." matches the master record
  // "Commercial Synbags International".
  const normalizeName = (s: string): string =>
    String(s ?? "").trim().replace(/[.,;!]+$/, "").trim().toLowerCase();
  const findIdByName = (rows: any[] | undefined, name: string): string | null => {
    const target = normalizeName(name);
    if (!target || !rows) return null;
    const match = rows.find((r) => normalizeName(r?.name) === target);
    return match?.id ?? null;
  };

  // Strip Indian-format thousands/lakhs separators ("26,48,40,784") and
  // currency prefixes so Prisma's Decimal parse succeeds. Returns
  // undefined for empty input so the field stays null on the row.
  const cleanDecimal = (raw: string | undefined): string | undefined => {
    const s = String(raw ?? "").trim().replace(/[₹,\s]/g, "");
    return s ? s : undefined;
  };

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.code?.trim()) return { ok: false as const, error: "Code is required" };
    if (!row.name?.trim()) return { ok: false as const, error: "Project Name is required" };

    const clientId = row.clientName?.trim()
      ? findIdByName(customersResp?.data, row.clientName)
      : null;
    if (row.clientName?.trim() && !clientId) {
      return {
        ok: false as const,
        error: `Customer "${row.clientName}" not found — add it to Masters → Customers first.`,
      };
    }

    try {
      await createMutation.mutateAsync({
        code: row.code.trim(),
        name: row.name.trim(),
        clientId,
        projectType: row.projectType || undefined,
        address: row.address || undefined,
        city: row.city || undefined,
        state: row.state || undefined,
        pincode: row.pincode || undefined,
        siteGstin: row.siteGstin || undefined,
        startDate: row.startDate || undefined,
        expectedEndDate: row.expectedEndDate || undefined,
        projectValue: cleanDecimal(row.projectValue),
        budget: cleanDecimal(row.budget),
        purchaseLimit: cleanDecimal(row.purchaseLimit),
        status: row.status?.trim() || "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Failed to create project" };
    }
  };

  return (
    <>
      <MasterListPage
        title="Projects"
        entityName="Project"
        permissionUrl="/masters/projects"
        columns={columns}
        data={result?.data ?? []}
        total={result?.total ?? 0}
        isLoading={isLoading}
        onAdd={() => { setEditItem(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setEditItem(item); setDrawerOpen(true); }}
        onDelete={handleDelete}
        onImport={() => setImportOpen(true)}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete project{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>
            {item.code ? <> (<span className="font-mono">{item.code}</span>)</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        canExport
        canImport
        historyEntityType="project"
        emptyIcon={<FolderKanban className="w-8 h-8" />}
        emptyDescription="Projects are the foundation of your construction operations. Add your first project to get started."
      />
      <ProjectFormDrawer
        key={editItem?.id ?? "new"}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditItem(null); }}
        editData={editItem}
      />
      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Project"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
