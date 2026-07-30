"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { withBasePath } from "@/lib/utils/base-path";
import { PageBackground } from "@/components/hrms/page-background";
import {
  Search, Filter, MoreVertical, Plus, ChevronDown, Check, X,
  ArrowLeft, Mail, Pencil, Trash2, PlusCircle, User,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Employee Directory — data grid (Table / Card / Kanban) + Detail
// with Notes. Reads real employees from the org-chart snapshot API.
// Custom columns / notes persistence are UI-only for now (no backend).
// ─────────────────────────────────────────────────────────────

interface Emp {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  profilePhoto: string | null;
  status: string;
  reportingManagerId: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
}

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  Active: { label: "Active", dot: "#3fae55", badge: "bg-green-100 text-green-700" },
  Probation: { label: "Probation", dot: "#a78bfa", badge: "bg-violet-100 text-violet-700" },
  OnNotice: { label: "On Notice", dot: "#f5b544", badge: "bg-amber-100 text-amber-700" },
  PreBoarding: { label: "Pre-Boarding", dot: "#4a90e2", badge: "bg-blue-100 text-blue-700" },
  Suspended: { label: "Suspended", dot: "#ef4444", badge: "bg-red-100 text-red-700" },
  Exited: { label: "Exited", dot: "#8a93a6", badge: "bg-gray-200 text-gray-600" },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, dot: "#8a93a6", badge: "bg-gray-100 text-gray-600" };
const fullName = (e: Emp) => `${e.firstName} ${e.lastName}`.trim();
const initials = (e: Emp) => `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();
const AV = ["#6c8cff", "#4bb98a", "#e08b5a", "#7a6cf0", "#eab308", "#ef7ea3"];
const colorFor = (id: string) => AV[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

function Avatar({ emp, size = 28 }: { emp: Emp; size?: number }) {
  if (emp.profilePhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={withBasePath(emp.profilePhoto)} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span className="rounded-full inline-flex items-center justify-center text-white font-bold shrink-0" style={{ width: size, height: size, background: colorFor(emp.id), fontSize: size * 0.36 }}>
      {initials(emp)}
    </span>
  );
}

interface Column { key: string; label: string; render: (e: Emp, mgr: Map<string, Emp>) => React.ReactNode }
const BASE_COLUMNS: Column[] = [
  { key: "name", label: "Name", render: (e) => (<span className="flex items-center gap-2.5"><Avatar emp={e} size={30} /><span className="text-gray-900 font-medium">{fullName(e)}</span></span>) },
  { key: "code", label: "Employee Code", render: (e) => <span className="font-mono text-gray-500">{e.employeeCode}</span> },
  { key: "department", label: "Department", render: (e) => <span className="text-gray-600">{e.department?.name ?? "—"}</span> },
  { key: "designation", label: "Designation", render: (e) => <span className="text-gray-600">{e.designation?.title ?? e.jobTitle ?? "—"}</span> },
  { key: "email", label: "Email", render: (e) => <span className="text-gray-600">{e.workEmail ?? "—"}</span> },
  { key: "manager", label: "Reports To", render: (e, mgr) => { const m = e.reportingManagerId ? mgr.get(e.reportingManagerId) : null; return m ? <span className="flex items-center gap-2"><Avatar emp={m} size={22} /><span className="text-gray-600">{fullName(m)}</span></span> : <span className="text-gray-300">—</span>; } },
  { key: "status", label: "Status", render: (e) => { const m = statusMeta(e.status); return <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold", m.badge)}>{m.label}</span>; } },
];

export default function EmployeeDirectoryGridPage() {
  const api = useApiClient();
  const [view, setView] = useState<"table" | "card" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [colMenu, setColMenu] = useState<string | null>(null);
  const [moreMenu, setMoreMenu] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [extraCols, setExtraCols] = useState<Column[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["directory-grid"],
    queryFn: () => api.get<{ employees: Emp[] }>("/api/v1/hrms/org-chart"),
  });
  const employees = useMemo(() => data?.data?.employees ?? [], [data]);
  const mgrMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const columns = useMemo(() => [...BASE_COLUMNS, ...extraCols].filter((c) => !hidden.has(c.key)), [extraCols, hidden]);

  const sortVal = (e: Emp, key: string): string => {
    switch (key) {
      case "name": return fullName(e);
      case "code": return e.employeeCode;
      case "department": return e.department?.name ?? "";
      case "designation": return e.designation?.title ?? e.jobTitle ?? "";
      case "email": return e.workEmail ?? "";
      case "status": return e.status;
      default: return "";
    }
  };

  const filtered = useMemo(() => {
    let rows = employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => `${fullName(e)} ${e.employeeCode} ${e.department?.name ?? ""} ${e.designation?.title ?? ""} ${e.workEmail ?? ""}`.toLowerCase().includes(q));
    }
    if (sort) rows = [...rows].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * sortVal(a, sort.key).localeCompare(sortVal(b, sort.key)));
    return rows;
  }, [employees, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const detail = detailId ? employees.find((e) => e.id === detailId) ?? null : null;
  if (detail) return <DetailView emp={detail} mgr={mgrMap} onBack={() => setDetailId(null)} />;

  // Kanban columns = statuses actually present, in meta order then extras.
  const statusOrder = Object.keys(STATUS_META);
  const presentStatuses = Array.from(new Set(employees.map((e) => e.status)))
    .sort((a, b) => (statusOrder.indexOf(a) + 1 || 99) - (statusOrder.indexOf(b) + 1 || 99));

  return (
    <div className="w-full">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-base font-semibold text-gray-900 mr-1">Employee Directory</h1>
        <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {(["table", "card", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={clsx("px-4 py-1.5 rounded-lg text-[13px] font-semibold capitalize transition", view === v ? "bg-green-50 text-green-700" : "text-gray-500 hover:text-gray-800")}>{v}</button>
          ))}
        </div>
        <div className="flex-1" />
        {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="h-[38px] px-3 border border-gray-200 rounded-xl bg-white text-gray-600 text-[13px] font-semibold hover:bg-gray-50">Deselect all ({selected.size})</button>}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search" className="w-[240px] h-[38px] pl-9 pr-3 border border-gray-200 rounded-xl text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-green-400" />
        </div>
        <button className="w-[38px] h-[38px] border border-gray-200 rounded-xl bg-white text-gray-500 hover:text-gray-800 inline-flex items-center justify-center shadow-sm"><Filter size={17} /></button>
        <div className="relative">
          <button onClick={() => setMoreMenu((m) => !m)} className="w-[38px] h-[38px] border border-gray-200 rounded-xl bg-white text-gray-500 hover:text-gray-800 inline-flex items-center justify-center shadow-sm"><MoreVertical size={17} /></button>
          {moreMenu && (
            <div className="absolute right-0 top-11 z-20 w-48 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5" onMouseLeave={() => setMoreMenu(false)}>
              {["Import Data", "View Trash", "View Hidden Columns"].map((l) => <button key={l} className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-gray-700 hover:bg-gray-50">{l}</button>)}
              <button onClick={() => { setShowAddColumn(true); setMoreMenu(false); }} className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-gray-700 hover:bg-gray-50">Add Column</button>
              <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-gray-700 hover:bg-gray-50">Advanced Filters</button>
            </div>
          )}
        </div>
        <button className="h-[38px] px-4 rounded-xl bg-green-600 text-white text-[13px] font-bold inline-flex items-center gap-1.5 hover:bg-green-700 shadow-sm"><Plus size={16} /> Add Employee</button>
      </div>

      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-400 text-sm">Loading employees…</div>
      ) : employees.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-400 text-sm"><User size={32} className="mx-auto mb-2 text-gray-300" />No employees found</div>
      ) : (
        <>
          {view === "table" && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="w-11 px-4 py-3"><span className="w-4 h-4 inline-block rounded border-[1.5px] border-gray-300 align-middle" /></th>
                      {columns.map((col) => (
                        <th key={col.key} className="text-left px-4 py-3 text-[12px] font-bold text-gray-800 whitespace-nowrap relative">
                          <span className="inline-flex items-center gap-1.5">{col.label}
                            <button onClick={() => setColMenu(colMenu === col.key ? null : col.key)} className="text-gray-400 hover:text-gray-700"><MoreVertical size={13} /></button>
                          </span>
                          {colMenu === col.key && (
                            <div className="absolute left-3 top-10 z-20 w-40 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5" onMouseLeave={() => setColMenu(null)}>
                              <button onClick={() => { setSort({ key: col.key, dir: "asc" }); setColMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-gray-700 hover:bg-gray-50">Sort Ascending</button>
                              <button onClick={() => { setSort({ key: col.key, dir: "desc" }); setColMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-gray-700 hover:bg-gray-50">Sort Descending</button>
                              <button className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-gray-700 hover:bg-gray-50">Freeze Column</button>
                              <button onClick={() => { setHidden((h) => new Set(h).add(col.key)); setColMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-gray-700 hover:bg-gray-50">Hide</button>
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((e) => (
                      <tr key={e.id} onClick={() => setDetailId(e.id)} className="border-t border-gray-100 hover:bg-gray-50/60 cursor-pointer">
                        <td className="px-4 py-3" onClick={(ev) => { ev.stopPropagation(); toggleSel(e.id); }}>
                          <span className={clsx("w-4 h-4 inline-flex items-center justify-center rounded border-[1.5px] align-middle", selected.has(e.id) ? "bg-green-600 border-green-600" : "border-gray-300")}>{selected.has(e.id) && <Check size={11} className="text-white" />}</span>
                        </td>
                        {columns.map((col) => <td key={col.key} className="px-4 py-3 text-[13px] whitespace-nowrap">{col.render(e, mgrMap)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Footer total={filtered.length} page={page} totalPages={totalPages} perPage={perPage} setPage={setPage} />
            </div>
          )}

          {view === "card" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {pageRows.map((e) => {
                const m = statusMeta(e.status);
                return (
                  <div key={e.id} onClick={() => setDetailId(e.id)} className={clsx("bg-white border rounded-2xl shadow-sm overflow-hidden cursor-pointer", selected.has(e.id) ? "border-green-500 ring-1 ring-green-500" : "border-gray-200")}>
                    <div className="flex items-start gap-2.5 p-3 bg-gradient-to-b from-green-50/40 to-white relative">
                      <Avatar emp={e} size={38} />
                      <div className="min-w-0"><div className="text-[13px] font-bold text-gray-900 truncate">{fullName(e)}</div><div className="text-[11px] text-gray-400">{e.employeeCode}</div></div>
                      <button onClick={(ev) => { ev.stopPropagation(); toggleSel(e.id); }} className={clsx("absolute top-3 right-3 w-[18px] h-[18px] rounded-md border-[1.5px] inline-flex items-center justify-center", selected.has(e.id) ? "bg-green-600 border-green-600" : "border-gray-300 bg-white")}>{selected.has(e.id) && <Check size={12} className="text-white" />}</button>
                    </div>
                    <div className="px-3 pb-3.5 pt-2.5 grid gap-1.5 text-[12px]">
                      <div className="flex"><span className="w-20 text-gray-500">Department</span><span className="text-gray-800 truncate">{e.department?.name ?? "—"}</span></div>
                      <div className="flex"><span className="w-20 text-gray-500">Designation</span><span className="text-gray-800 truncate">{e.designation?.title ?? e.jobTitle ?? "—"}</span></div>
                      <div className="flex"><span className="w-20 text-gray-500">Email</span><span className="text-gray-800 truncate">{e.workEmail ?? "—"}</span></div>
                      <div className="flex items-center"><span className="w-20 text-gray-500">Status</span><span className={clsx("inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold", m.badge)}>{m.label}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "kanban" && (
            <div className="flex gap-3.5 overflow-x-auto pb-2">
              {presentStatuses.map((st) => {
                const m = statusMeta(st);
                const rows = filtered.filter((e) => e.status === st);
                return (
                  <div key={st} className="w-[250px] flex-none">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-xl mb-2.5 shadow-sm">
                      <span className="w-2 h-2 rounded-full" style={{ background: m.dot }} />
                      <span className="text-[12.5px] font-bold">{m.label}</span>
                      <span className="text-[11px] text-gray-400 font-semibold">{String(rows.length).padStart(2, "0")}</span>
                    </div>
                    {rows.map((e) => (
                      <div key={e.id} onClick={() => setDetailId(e.id)} className="bg-white border border-gray-200 rounded-xl p-3 mb-2.5 shadow-sm cursor-pointer hover:border-green-300">
                        <div className="flex items-center gap-2 mb-2"><Avatar emp={e} size={26} /><div className="min-w-0"><div className="text-[12.5px] font-bold text-gray-900 truncate">{fullName(e)}</div><div className="text-[10.5px] text-gray-400">{e.employeeCode}</div></div></div>
                        <div className="text-[11.5px] text-gray-500"><span className="text-gray-700 font-semibold">Dept</span> {e.department?.name ?? "—"}</div>
                        <div className="text-[11.5px] text-gray-500 truncate"><span className="text-gray-700 font-semibold">Email</span> {e.workEmail ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showAddColumn && <AddColumnModal onClose={() => setShowAddColumn(false)} onSave={(label) => { setExtraCols((c) => [...c, { key: `custom_${c.length}`, label, render: () => <span className="text-gray-300">—</span> }]); setShowAddColumn(false); }} />}
    </div>
  );
}

function Footer({ total, page, totalPages, perPage, setPage }: { total: number; page: number; totalPages: number; perPage: number; setPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-t border-gray-200 flex-wrap gap-2.5">
      <span className="text-[12.5px] text-gray-500">Showing {total === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total} results</span>
      <div className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-500">
        <button onClick={() => setPage(Math.max(1, page - 1))} className="px-2">Prev</button>
        {Array.from({ length: totalPages }).slice(0, 3).map((_, i) => <button key={i} onClick={() => setPage(i + 1)} className={clsx("min-w-[26px] h-[26px] rounded-lg border", page === i + 1 ? "bg-green-600 text-white border-green-600" : "border-gray-200 bg-white")}>{i + 1}</button>)}
        {totalPages > 3 && <><span>…</span><button onClick={() => setPage(totalPages)} className="min-w-[26px] h-[26px] rounded-lg border border-gray-200 bg-white">{totalPages}</button></>}
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} className="px-2">Next</button>
      </div>
    </div>
  );
}

function AddColumnModal({ onClose, onSave }: { onClose: () => void; onSave: (label: string) => void }) {
  const [name, setName] = useState("");
  const [required, setRequired] = useState(true);
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 bg-green-50"><h4 className="text-[14px] font-bold text-gray-900">Add Column</h4><button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button></div>
        <div className="p-5 grid grid-cols-2 gap-3.5">
          <Field className="col-span-2" label="Column Type"><div className="h-9 border border-gray-200 rounded-lg px-3 flex items-center justify-between text-[12.5px] text-gray-500">Text<ChevronDown size={14} className="text-gray-400" /></div></Field>
          <Field label="Display Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Location" className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-green-400" /></Field>
          <Field label="Default Value"><input placeholder="example123" className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[12.5px]" /></Field>
          <Field label="Placeholder"><input placeholder="example123" className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[12.5px]" /></Field>
          <Field label="Pattern"><input placeholder="example123" className="w-full h-9 border border-gray-200 rounded-lg px-3 text-[12.5px]" /></Field>
        </div>
        <div className="px-5 pb-5 flex items-center justify-between">
          <button onClick={() => setRequired((r) => !r)} className="inline-flex items-center gap-2 text-[12.5px] text-gray-700"><span className={clsx("w-[17px] h-[17px] rounded-[5px] inline-flex items-center justify-center", required ? "bg-green-600" : "border-[1.5px] border-gray-300")}>{required && <Check size={11} className="text-white" />}</span>Required</button>
          <button onClick={() => onSave(name || "New Column")} className="bg-green-600 text-white rounded-lg px-5 py-2 text-[12.5px] font-bold hover:bg-green-700">Save</button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="block text-[11.5px] font-semibold mb-1.5 text-gray-700">{label}</label>{children}</div>;
}

function DetailView({ emp, mgr, onBack }: { emp: Emp; mgr: Map<string, Emp>; onBack: () => void }) {
  const manager = emp.reportingManagerId ? mgr.get(emp.reportingManagerId) : null;
  const m = statusMeta(emp.status);
  const fields: { label: string; value: string }[] = [
    { label: "Full Name", value: fullName(emp) },
    { label: "Employee Code", value: emp.employeeCode },
    { label: "Department", value: emp.department?.name ?? "—" },
    { label: "Designation", value: emp.designation?.title ?? emp.jobTitle ?? "—" },
    { label: "Work Email", value: emp.workEmail ?? "—" },
    { label: "Personal Email", value: emp.personalEmail ?? "—" },
    { label: "Reports To", value: manager ? fullName(manager) : "—" },
    { label: "Status", value: m.label },
  ];
  return (
    <div className="w-full">
      <div className="flex items-center gap-2.5 mb-4">
        <button onClick={onBack} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 inline-flex items-center justify-center hover:bg-gray-50"><ArrowLeft size={17} /></button>
        <Avatar emp={emp} size={34} />
        <h1 className="text-[17px] font-bold text-gray-900">{fullName(emp)}</h1>
        <span className="ml-auto flex items-center gap-2">{[Mail, Pencil, Trash2].map((Icon, i) => <button key={i} className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-500 inline-flex items-center justify-center hover:bg-gray-50"><Icon size={16} /></button>)}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
              {fields.map((f) => (
                <div key={f.label}><label className="block text-[12px] font-semibold mb-1.5 text-gray-700">{f.label}</label><div className="h-9 rounded-lg bg-gray-50 px-3 flex items-center text-[12.5px] text-gray-600">{f.value}</div></div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm self-start">
          <h4 className="text-[15px] font-bold mb-3">Notes</h4>
          {[0, 1].map((i) => (
            <div key={i} className="border-b border-gray-100 pb-3 mb-3">
              <div className="flex items-center gap-2 mb-1.5"><span className="w-6 h-6 rounded-full bg-[#6c8cff] text-white inline-flex items-center justify-center text-[10px] font-bold">RR</span><span className="text-[12.5px] font-bold">Ronald R.</span><span className="ml-auto text-[11px] text-gray-400">02 Jun, 2025</span></div>
              <p className="text-[12px] text-gray-500 leading-relaxed">Sample note — notes aren&apos;t saved yet (UI only).</p>
            </div>
          ))}
          <div className="border border-gray-200 rounded-xl p-3">
            <div className="text-[12px] text-gray-400 mb-8">Share your thoughts, update or observations…</div>
            <button className="w-full border-t border-gray-100 pt-2.5 inline-flex items-center justify-center gap-1.5 text-green-700 font-bold text-[12.5px]"><PlusCircle size={15} /> Add A Note</button>
          </div>
        </div>
      </div>
    </div>
  );
}
