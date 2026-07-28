"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { FileText, Search, Download, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { withBasePath } from "@/lib/utils/base-path";

/** Internal uploads live behind an auth-guarded API path and need the app's
 *  basePath prepended; external (http) links pass through unchanged. */
function docHref(url: string): string {
  return url.startsWith("/") ? withBasePath(url) : url;
}
function downloadHref(d: DocItem): string {
  const base = docHref(d.fileUrl);
  if (!d.fileUrl.startsWith("/")) return base;
  const keyMatch = d.fileUrl.match(/[?&]key=([^&]+)/);
  const key = keyMatch ? decodeURIComponent(keyMatch[1]) : "";
  const ext = (key.split(".").pop() || "").toLowerCase();
  const safe = (d.title || "document").replace(/[^\w.-]+/g, "_");
  const name = ext && !safe.toLowerCase().endsWith(`.${ext}`) ? `${safe}.${ext}` : safe;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}dl=1&name=${encodeURIComponent(name)}`;
}

interface Emp {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  jobTitle: string | null;
  profilePhoto: string | null;
  department: { id: string; name: string } | null;
}
interface DocItem {
  id: string;
  title: string;
  category: string;
  fileUrl: string;
  fileType: string;
  status: string;
  createdAt: string;
}

const catColors: Record<string, string> = {
  OfferLetter: "bg-[#dcfce7] text-[#16a34a]",
  Policy: "bg-purple-100 text-purple-700",
  IdProof: "bg-gray-100 text-gray-700",
  Certificate: "bg-green-100 text-green-700",
  Contract: "bg-red-100 text-red-700",
  AppointmentLetter: "bg-[#dcfce7] text-[#16a34a]",
  ExperienceLetter: "bg-cyan-100 text-cyan-700",
  RelievingLetter: "bg-orange-100 text-orange-700",
  NDA: "bg-sky-100 text-sky-700",
  Other: "bg-gray-100 text-gray-600",
};

const PAGE_SIZE = 10;

function fullName(e: Emp) {
  return e.displayName || `${e.firstName} ${e.lastName}`.trim();
}
function initials(e: Emp) {
  return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function EmployeeDocumentsPage() {
  const api = useApiClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Emp | null>(null);

  const { data: empResp, isLoading: loadingEmps } = useQuery({
    queryKey: ["employees", "doc-directory", search, page],
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      if (search) qs.set("search", search);
      return api.get<Emp[]>(`/api/v1/hrms/employees?${qs.toString()}`);
    },
    staleTime: 60_000,
  });

  const employees = empResp?.data ?? [];
  const total = empResp?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: docResp, isLoading: loadingDocs } = useQuery({
    queryKey: ["documents", "employee", selected?.id],
    queryFn: () => api.get<DocItem[]>(`/api/v1/hrms/documents?employeeId=${selected!.id}&limit=100`),
    enabled: !!selected,
    staleTime: 60_000,
  });
  const docs = docResp?.data ?? [];

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start gap-3 mb-4">
        <FileText size={28} className="text-[#166534] mt-1.5" />
        <div>
          <h1 className="text-page-title text-gray-900">Employee documents</h1>
          <p className="text-sm text-gray-500">Pick an employee to view all documents in their file.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── Employee list ─────────────────────────────── */}
        <div className="surface-card p-3 flex flex-col">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>

          {loadingEmps ? (
            <SkeletonTable rows={8} cols={1} />
          ) : employees.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              <Users size={26} className="mx-auto mb-2 text-gray-300" /> No employees found.
            </div>
          ) : (
            <div className="space-y-1 overflow-y-auto">
              {employees.map((e) => {
                const active = selected?.id === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition",
                      active ? "bg-[#166534]/10 ring-1 ring-[#166534]/30" : "hover:bg-gray-50",
                    )}
                  >
                    <span className={clsx(
                      "w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0",
                      active ? "bg-[#166534] text-white" : "bg-[#166534]/10 text-[#166534]",
                    )}>
                      {initials(e)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-gray-900 truncate">{fullName(e)}</span>
                      <span className="block text-[11px] text-gray-400 truncate">
                        {e.employeeCode}{e.department ? ` · ${e.department.name}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-100 text-xs text-gray-500">
              <span>Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
                  <ChevronLeft size={15} />
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Selected employee's documents ─────────────── */}
        <div className="surface-card p-5 min-h-[320px]">
          {!selected ? (
            <div className="h-full grid place-items-center text-center text-gray-500 py-16">
              <div>
                <Users size={34} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm">Select an employee from the list to see their documents.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 pb-4 mb-4 border-b border-gray-100">
                <span className="w-10 h-10 rounded-full bg-[#166534] text-white grid place-items-center text-sm font-bold shrink-0">
                  {initials(selected)}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{fullName(selected)}</p>
                  <p className="text-[12px] text-gray-500 truncate">
                    {selected.employeeCode}{selected.jobTitle ? ` · ${selected.jobTitle}` : ""}
                  </p>
                </div>
                <span className="ml-auto text-[12px] text-gray-500">{docs.length} document{docs.length === 1 ? "" : "s"}</span>
              </div>

              {loadingDocs ? (
                <SkeletonTable rows={4} cols={2} />
              ) : docs.length === 0 ? (
                <div className="py-14 text-center text-gray-500">
                  <FileText size={30} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No documents on file for this employee yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-3">
                      <span className="w-9 h-9 rounded-lg bg-[#166534]/5 text-[#166534] grid place-items-center shrink-0">
                        <FileText size={16} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-900 truncate">{d.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold", catColors[d.category] ?? catColors.Other)}>
                            {d.category}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {new Date(d.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link href={`/documents/${d.id}`}
                          className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#166534] hover:bg-[#166534]/5 transition">
                          View
                        </Link>
                        {d.fileUrl && (
                          <a href={downloadHref(d)} download rel="noreferrer" title="Download"
                            className="p-2 text-gray-400 hover:text-[#166534] hover:bg-[#166534]/5 rounded-lg transition">
                            <Download size={14} />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
