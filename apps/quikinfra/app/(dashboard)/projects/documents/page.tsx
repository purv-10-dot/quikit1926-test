"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  X,
  ExternalLink,
} from "lucide-react";
import { PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects } from "@/hooks/use-masters";
import { useMenuActions, usePermissions } from "@/hooks/use-permissions";
import { PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES } from "@/lib/storage/validation";

const MAX_MB = PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024);

const CATEGORY_OPTIONS = [
  { value: "Drawing", label: "Drawing" },
  { value: "Contract", label: "Contract" },
  { value: "NOC", label: "NOC" },
  { value: "RERA", label: "RERA" },
  { value: "Environmental", label: "Environmental" },
  { value: "Inspection", label: "Inspection" },
  { value: "Other", label: "Other" },
];

type DocumentRow = {
  id: string;
  documentName: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string | null;
  category: string;
  projectName?: string;
  version?: string | null;
  uploadedBy?: string;
  uploadDate?: string;
  status?: string;
};

function fileIconFor(row: DocumentRow) {
  const mime = (row.mimeType ?? "").toLowerCase();
  const name = (row.fileName ?? row.documentName ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    return FileImage;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    /\.(xls|xlsx|csv)$/i.test(name)
  ) {
    return FileSpreadsheet;
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
    return FileText;
  }
  return File;
}

function canPreviewInline(row: DocumentRow): boolean {
  const mime = (row.mimeType ?? "").toLowerCase();
  const name = (row.fileName ?? "").toLowerCase();
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    /\.(png|jpe?g|webp|gif|pdf)$/i.test(name)
  );
}

function DocumentPreviewModal({
  row,
  onClose,
}: {
  row: DocumentRow;
  onClose: () => void;
}) {
  const url = row.fileUrl ?? "";
  const inline = canPreviewInline(row);
  const label = row.fileName ?? row.documentName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 pr-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">
              Document Preview
            </div>
            <div className="text-sm font-semibold text-gray-900 truncate">{label}</div>
            {row.documentName !== label && (
              <div className="text-xs text-gray-500 truncate">{row.documentName}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-gray-50">
          {!url ? (
            <p className="text-sm text-gray-500 text-center py-12">No file attached.</p>
          ) : inline &&
            ((row.mimeType ?? "").startsWith("image/") ||
              /\.(png|jpe?g|webp|gif)$/i.test(row.fileName ?? "")) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={label}
              className="max-w-full max-h-[70vh] mx-auto rounded-lg border border-gray-200 shadow-sm object-contain"
            />
          ) : inline ? (
            <iframe
              src={url}
              title={label}
              className="w-full h-[70vh] rounded-lg border border-gray-200 bg-white"
            />
          ) : (
            <div className="text-center py-12 space-y-3">
              <File className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-600">
                In-browser preview is not available for this file type.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
              >
                <ExternalLink className="w-4 h-4" />
                Download / open file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<DocumentRow | null>(null);
  const { me } = usePermissions();
  const { data: projectsData } = useProjects();
  const { canAdd } = useMenuActions("/projects/documents");
  const projects = projectsData?.data ?? [];
  const projectOptions = useMemo(
    () =>
      projects.map((p: { id: string; code?: string; name?: string }) => ({
        value: p.id,
        label: `${p.code ?? p.id} — ${p.name ?? ""}`.trim(),
      })),
    [projects],
  );

  const { data: result } = useQuery({
    queryKey: ["projects-documents"],
    queryFn: () => fetch(`/api/projects/documents`).then((r) => r.json()),
  });

  const data: DocumentRow[] = result?.data ?? [];

  const uploadConfig = useMemo(
    () => ({
      title: "Upload Document",
      subtitle: "Add a project document to the register",
      apiEndpoint: "/api/projects/documents",
      onSuccess: () => qc.invalidateQueries({ queryKey: ["projects-documents"] }),
      fields: [
        {
          key: "file",
          label: "File",
          type: "file" as const,
          required: true,
          accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.dwg,.dxf,.zip,.csv,.txt",
          span: 2 as const,
          uploadContext: "project_document",
          maxFileSizeBytes: PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES,
          hint: `PDF, Office, images, CAD — max ${MAX_MB} MB per file`,
          afterFileUpload: (
            files: Array<{ url: string; name: string; size: number; type: string }>,
          ) => {
            const f = files[0];
            if (!f) return;
            const base = f.name.replace(/\.[^.]+$/, "");
            return {
              documentName: base,
              fileName: f.name,
              mimeType: f.type,
              fileUrl: f.url,
              fileSizeBytes: String(f.size),
            };
          },
        },
        {
          key: "documentName",
          label: "Document Name",
          type: "text" as const,
          required: true,
          placeholder: "e.g. Structural Drawing — Pier P1",
          span: 2 as const,
        },
        {
          key: "category",
          label: "Category",
          type: "select" as const,
          required: true,
          options: CATEGORY_OPTIONS,
          placeholder: "Select category",
        },
        {
          key: "projectId",
          label: "Project",
          type: "select" as const,
          required: true,
          options: projectOptions,
          placeholder: "Select project",
          searchable: true,
        },
        { key: "version", label: "Version", type: "text" as const, placeholder: "Rev 1 / V1.0" },
        {
          key: "uploadedBy",
          label: "Uploaded By",
          type: "text" as const,
          defaultValue: me?.userName ?? "",
          disabled: true,
        },
        {
          key: "remarks",
          label: "Remarks",
          type: "textarea" as const,
          placeholder: "Notes about this document...",
          span: 2 as const,
        },
      ],
    }),
    [me?.userName, projectOptions, qc],
  );

  const categoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      Drawing: "bg-orange-50 text-orange-700",
      Contract: "bg-purple-50 text-purple-700",
      NOC: "bg-green-50 text-green-700",
      RERA: "bg-orange-50 text-orange-700",
      Environmental: "bg-teal-50 text-teal-700",
      Inspection: "bg-amber-50 text-amber-700",
      Other: "bg-gray-50 text-gray-700",
    };
    return colors[cat] ?? "bg-gray-50 text-gray-700";
  };

  const columns: ColDef<DocumentRow>[] = [
    {
      key: "documentName",
      label: "Document",
      sortable: true,
      searchable: true,
      render: (row) => {
        const Icon = fileIconFor(row);
        const display = row.fileName ?? row.documentName;
        const hasFile = Boolean(row.fileUrl);
        return (
          <button
            type="button"
            disabled={!hasFile}
            onClick={() => hasFile && setPreviewRow(row)}
            className={`inline-flex items-center gap-2 min-w-0 max-w-full text-left ${
              hasFile
                ? "text-orange-700 hover:text-orange-800 hover:underline cursor-pointer"
                : "text-gray-700 cursor-default"
            }`}
            title={hasFile ? "Preview file" : display}
          >
            <Icon className="w-4 h-4 shrink-0 text-gray-400" />
            <span className="truncate">{display}</span>
          </button>
        );
      },
    },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: ["Drawing", "Contract", "NOC", "RERA", "Environmental", "Inspection", "Other"],
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor(row.category)}`}
        >
          {row.category}
        </span>
      ),
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "version", label: "Version" },
    { key: "uploadedBy", label: "Uploaded By", sortable: true },
    { key: "uploadDate", label: "Upload Date", type: "date", sortable: true },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["draft", "active", "approved"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Document Management"
        subtitle="Project drawings, contracts, NOCs, and regulatory documents"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Documents" }]}
      />
      <PageContainer>
        <DataTable
          id="projects-documents"
          columns={columns}
          data={data}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="Upload Document"
          defaultSort="uploadDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer
        key={drawerOpen ? `upload-${me?.userName ?? "pending"}` : "closed"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={uploadConfig}
      />
      {previewRow && (
        <DocumentPreviewModal row={previewRow} onClose={() => setPreviewRow(null)} />
      )}
    </>
  );
}
