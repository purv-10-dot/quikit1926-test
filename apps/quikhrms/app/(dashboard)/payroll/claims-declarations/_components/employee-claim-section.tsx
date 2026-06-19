"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import {
  Plus, Receipt, X, Save, FileUp, ChevronLeft, ChevronRight,
  Fuel, Phone, Plane, Utensils, Pill, Briefcase, BookOpen,
  FileText, ExternalLink, Loader2, Trash2, CheckCircle2,
} from "lucide-react";
import { clsx } from "clsx";

type Kind = "FBP" | "Reimbursement";

interface Component {
  id: string;
  name: string;
  code: string;
  isFBP: boolean;
  maxAmount: number | null;
  description: string | null;
  requireBillNumber: boolean;
  requireMerchantName: boolean;
  requireUploadDoc: boolean;
  claimInstructions: string | null;
}

interface ClaimAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface Claim {
  id: string;
  componentName: string;
  title: string | null;
  billDate: string;
  billDateTo: string | null;
  billNumber: string | null;
  merchantName: string | null;
  currency: string;
  isProject: boolean;
  amountClaimed: string;
  amountApproved: string | null;
  fileUrl: string | null;
  attachments: ClaimAttachment[] | null;
  description: string | null;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Paid" | "Cancelled";
  rejectionReason: string | null;
  createdAt: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const STATUS_BADGE: Record<Claim["status"], string> = {
  Draft:     "bg-gray-100 text-gray-700 border-gray-200",
  Submitted: "bg-amber-50 text-amber-800 border-amber-200",
  Approved:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected:  "bg-rose-50 text-rose-700 border-rose-200",
  Paid:      "bg-emerald-100 text-emerald-800 border-emerald-300",
  Cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABEL: Record<Claim["status"], string> = {
  Draft: "Draft", Submitted: "Pending", Approved: "Approved",
  Rejected: "Rejected", Paid: "Paid", Cancelled: "Cancelled",
};

// Fixed reimbursement category catalog — no admin setup needed.
const REIMBURSEMENT_CATEGORIES = [
  "Fuel",
  "Telephone / Internet",
  "Travel",
  "Meals",
  "Medical",
  "Office Supplies",
  "Books / Training",
  "Other",
];

// Category → icon mapping for the claims table.
function iconForCategory(name: string): typeof Receipt {
  const n = name.toLowerCase();
  if (n.includes("fuel"))     return Fuel;
  if (n.includes("phone") || n.includes("telephone") || n.includes("internet")) return Phone;
  if (n.includes("travel"))   return Plane;
  if (n.includes("meal") || n.includes("food")) return Utensils;
  if (n.includes("medical") || n.includes("health")) return Pill;
  if (n.includes("office") || n.includes("supply")) return Briefcase;
  if (n.includes("book") || n.includes("training")) return BookOpen;
  return Receipt;
}

function fmtClaimDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtClaimRange(from: string, to?: string | null): string {
  if (!to) return fmtClaimDate(from);
  if (new Date(from).toDateString() === new Date(to).toDateString()) return fmtClaimDate(from);
  return `${fmtClaimDate(from)} – ${fmtClaimDate(to)}`;
}

type StatusFilter = "All" | Claim["status"];
type DateFilter = "30" | "60" | "90" | "all";

export function EmployeeClaimSection({ kind }: { kind: Kind }) {
  const api = useApiClient();
  const toast = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [dateFilter, setDateFilter] = useState<DateFilter>("30");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const { data: compRes } = useQuery({
    queryKey: ["payroll", "my-claims", "components", kind],
    queryFn: () => api.get<Component[]>(`/api/v1/hrms/payroll/my-claims/components?type=${kind}`),
    enabled: kind === "FBP",
  });
  const components = compRes?.data ?? [];

  const { data: claimsRes, isLoading } = useQuery({
    queryKey: ["payroll", "my-claims", kind],
    queryFn: () => api.get<Claim[]>(`/api/v1/hrms/payroll/my-claims?type=${kind}`),
  });
  const claims = claimsRes?.data ?? [];

  const submitMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Claim>(`/api/v1/hrms/payroll/my-claims?type=${kind}`, body),
    onSuccess: () => {
      toast.success("Claim submitted", "Awaiting approval.");
      qc.invalidateQueries({ queryKey: ["payroll", "my-claims", kind] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error("Submission failed", e.message),
  });

  // ── Apply status + date filters ──
  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff = dateFilter === "all" ? 0 : now - Number(dateFilter) * 86_400_000;
    return claims.filter((c) => {
      if (statusFilter !== "All" && c.status !== statusFilter) return false;
      if (cutoff && new Date(c.billDate).getTime() < cutoff) return false;
      return true;
    });
  }, [claims, statusFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * perPage;
  const pageRows = filtered.slice(pageStart, pageStart + perPage);

  // FBP needs admin-configured categories first.
  if (kind === "FBP" && components.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No FBP categories have been created yet. Ask your HR / payroll admin to add at least one FBP component.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── New Claim button (when form is closed) ── */}
      {!showForm && (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-600 max-w-2xl">
            {kind === "FBP"
              ? "Submit Flexible Benefit Plan claims for any approved FBP category. HR will review and approve."
              : "Submit reimbursement claims with bill proof. HR reviews the amount and may approve, partially approve, or reject."}
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-md text-sm font-semibold shadow-sm shrink-0"
          >
            <Plus size={14} /> New Claim
          </button>
        </div>
      )}

      {/* ── Submit panel ── */}
      {showForm && (
        <ClaimForm
          kind={kind}
          components={components}
          submitting={submitMut.isPending}
          onSubmit={(values) => submitMut.mutate(values)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Claims list ── */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/40">
          <h3 className="text-sm font-bold text-gray-900">
            My {kind === "FBP" ? "FBP" : "Reimbursement"} Claims
          </h3>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}
              options={[
                { value: "All",       label: "All Status" },
                { value: "Submitted", label: "Pending" },
                { value: "Approved",  label: "Approved" },
                { value: "Rejected",  label: "Rejected" },
                { value: "Paid",      label: "Paid" },
                { value: "Cancelled", label: "Cancelled" },
              ]}
              className="w-32"
            />
            <Select
              value={dateFilter}
              onChange={(v) => { setDateFilter(v as DateFilter); setPage(1); }}
              options={[
                { value: "30",  label: "Last 30 Days" },
                { value: "60",  label: "Last 60 Days" },
                { value: "90",  label: "Last 90 Days" },
                { value: "all", label: "All time" },
              ]}
              className="w-36"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyClaims kind={kind} hasUnfiltered={claims.length > 0} onCta={() => setShowForm(true)} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50/60">
                    <th className="text-left py-2.5 px-4">Category / Title</th>
                    <th className="text-left py-2.5 px-3">Date</th>
                    <th className="text-left py-2.5 px-3">Merchant</th>
                    <th className="text-left py-2.5 px-3">Bill #</th>
                    <th className="text-right py-2.5 px-3">Amount</th>
                    <th className="text-right py-2.5 px-3">Approved</th>
                    <th className="text-center py-2.5 px-3">Status</th>
                    <th className="text-center py-2.5 px-3 w-16">File</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c, i) => {
                    const Icon = iconForCategory(c.componentName);
                    const curPrefix = c.currency === "INR" ? "₹" : `${c.currency} `;
                    return (
                      <tr
                        key={c.id}
                        className="row-stagger border-b border-gray-50 hover:bg-gray-50/60 last:border-0"
                        style={{ ["--i" as never]: Math.min(i, 10) }}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-md bg-blue-50 text-[#3b82f6] flex items-center justify-center shrink-0">
                              <Icon size={14} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate" title={c.componentName}>
                                {c.componentName}
                              </p>
                              {c.title && c.title.trim() !== c.componentName && (
                                <p className="text-[11px] text-gray-500 truncate" title={c.title}>
                                  {c.title}
                                  {c.isProject && <span className="ml-1 px-1 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-semibold uppercase">project</span>}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap text-xs">
                          {fmtClaimRange(c.billDate, c.billDateTo)}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 text-xs">
                          {c.merchantName ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 text-xs font-mono">
                          {c.billNumber ?? <span className="text-gray-300 font-sans">—</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-900 tabular-nums">
                          {curPrefix}{INR.format(Number(c.amountClaimed))}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {c.amountApproved != null
                            ? <span className="text-emerald-700 font-semibold">{curPrefix}{INR.format(Number(c.amountApproved))}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={clsx(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                              STATUS_BADGE[c.status],
                            )}
                            title={c.rejectionReason ?? undefined}
                          >
                            {STATUS_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <ClaimFilesCell claim={c} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-row rejection reasons — shown below the table so they're not cramped */}
            {pageRows.some((c) => c.status === "Rejected" && c.rejectionReason) && (
              <div className="border-t border-gray-100 bg-rose-50/40 px-4 py-2 space-y-1">
                {pageRows.filter((c) => c.status === "Rejected" && c.rejectionReason).map((c) => (
                  <p key={c.id} className="text-[11px] text-rose-800">
                    <span className="font-semibold">{c.componentName}</span>
                    <span className="text-rose-400 mx-1.5">·</span>
                    <span>{c.rejectionReason}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 bg-gray-50/40 text-xs text-gray-600">
              <p>
                Showing <span className="font-semibold text-gray-900">{pageStart + 1}</span>–
                <span className="font-semibold text-gray-900">{Math.min(pageStart + perPage, filtered.length)}</span>
                {" of "}
                <span className="font-semibold text-gray-900">{filtered.length}</span> claims
              </p>
              <div className="flex items-center gap-3">
                <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
                <Select
                  value={String(perPage)}
                  onChange={(v) => { setPerPage(Number(v)); setPage(1); }}
                  options={[10, 25, 50].map((n) => ({ value: String(n), label: `${n} / page` }))}
                  className="w-28"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Pager({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  // Window: prev, current, next, with ellipsis when needed.
  const pages: (number | "...")[] = [];
  const push = (n: number | "...") => pages.push(n);
  push(1);
  if (page > 3) push("...");
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) push(i);
  if (page < totalPages - 2) push("...");
  if (totalPages > 1) push(totalPages);

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="w-7 h-7 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft size={14} />
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="px-1 text-gray-400 select-none">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={clsx(
              "w-7 h-7 rounded text-xs font-semibold flex items-center justify-center tabular-nums",
              p === page
                ? "bg-[#16243A] text-white"
                : "text-gray-700 hover:bg-gray-100",
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="w-7 h-7 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

/**
 * Files cell — supports legacy single fileUrl AND new attachments array.
 * Single file → icon link. Multiple files → "📎 N files" chip with a hover
 * popover listing each file. No attachments → em-dash placeholder.
 */
function ClaimFilesCell({ claim }: { claim: Claim }) {
  const files: ClaimAttachment[] = claim.attachments?.length
    ? claim.attachments
    : claim.fileUrl
      ? [{ url: claim.fileUrl, name: "Attachment", size: 0, type: "", uploadedAt: claim.createdAt }]
      : [];

  if (files.length === 0) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (files.length === 1) {
    return (
      <a
        href={files[0].url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:text-[#3b82f6] hover:bg-blue-50"
        title={files[0].name}
      >
        <FileText size={14} />
      </a>
    );
  }
  // Multi-file: chip with hover popover
  return (
    <div className="relative inline-flex group">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold cursor-default">
        <FileText size={11} /> {files.length} files
      </span>
      <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block min-w-[220px] rounded-md border border-gray-200 bg-white shadow-lg p-1.5 text-left">
        {files.map((f, i) => (
          <a
            key={`${f.url}-${i}`}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-gray-50"
          >
            <FileText size={12} className="text-gray-400 shrink-0" />
            <span className="flex-1 truncate text-gray-800">{f.name}</span>
            <ExternalLink size={10} className="text-gray-400 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

function EmptyClaims({
  kind, hasUnfiltered, onCta,
}: { kind: Kind; hasUnfiltered: boolean; onCta: () => void }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-gray-50 ring-1 ring-gray-200 flex items-center justify-center mb-3">
        <Receipt size={22} className="text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-900">
        {hasUnfiltered ? "No claims match these filters" : kind === "FBP" ? "No FBP claims yet" : "No claims yet"}
      </p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
        {hasUnfiltered
          ? "Try a different status or date range."
          : kind === "FBP"
            ? "Submit a claim against any of your approved FBP categories."
            : "Submit a bill for fuel, telephone, travel, or any other approved category — HR will review and reimburse."}
      </p>
      {!hasUnfiltered && (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#16243A] text-white hover:bg-[#1E3354]"
        >
          <Plus size={12} /> Submit your first claim
        </button>
      )}
    </div>
  );
}

const CURRENCIES = [
  { value: "INR", label: "Indian Rupee (₹)" },
  { value: "USD", label: "US Dollar ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "Pound (£)" },
  { value: "SGD", label: "Singapore Dollar (S$)" },
  { value: "AED", label: "UAE Dirham (د.إ)" },
];

const COMMENT_MAX = 2000;

function ClaimForm({
  kind, components, submitting, onSubmit, onCancel,
}: {
  kind: Kind;
  components: Component[];
  submitting: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(kind === "Reimbursement" ? REIMBURSEMENT_CATEGORIES[0] : "");
  const [componentId, setComponentId] = useState(kind === "FBP" ? (components[0]?.id ?? "") : "");
  const [title, setTitle] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billDateTo, setBillDateTo] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [isProject, setIsProject] = useState(false);
  const [amountClaimed, setAmountClaimed] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<UploadedMeta[]>([]);
  const [description, setDescription] = useState("");

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A]";

  const selected = kind === "FBP" ? components.find((c) => c.id === componentId) : undefined;
  const dateRangeInvalid = billDateTo && billDate && new Date(billDateTo) < new Date(billDate);
  const billNumberMissing = selected?.requireBillNumber && !billNumber.trim();
  const merchantMissing = selected?.requireMerchantName && !merchantName.trim();
  const docMissing = selected?.requireUploadDoc && attachments.length === 0;
  const categoryPicked = kind === "Reimbursement" ? !!category : !!componentId;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!categoryPicked || !billDate || !amountClaimed || dateRangeInvalid) return;
        if (billNumberMissing || merchantMissing || docMissing) return;
        onSubmit({
          ...(kind === "FBP" ? { componentId } : { category }),
          title: title || null,
          billDate,
          billDateTo: billDateTo || null,
          billNumber: billNumber || null,
          merchantName: merchantName || null,
          currency,
          isProject,
          amountClaimed,
          // fileUrl kept for backward compat — primary attachment if any
          fileUrl: attachments[0]?.url ?? null,
          attachments: attachments.length > 0 ? attachments : null,
          description: description || null,
        });
      }}
      className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Panel header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white">
        <div>
          <h3 className="text-base font-bold text-gray-900">
            Submit {kind === "FBP" ? "FBP" : "Reimbursement"} Claim
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-lg">
            {kind === "FBP"
              ? "Submit FBP claim against an approved category. HR will review the amount, approve / partially approve / reject."
              : "Submit reimbursement claims with bill proof. HR will review the amount, approve / partially approve / reject."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
        >
          <X size={12} /> Cancel
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Row 1: Category + Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={kind === "FBP" ? "FBP Component" : "Reimbursement Category"} required>
            {kind === "Reimbursement" ? (
              <Select
                value={category}
                onChange={(v) => setCategory(v)}
                options={REIMBURSEMENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            ) : (
              <Select
                value={componentId}
                onChange={(v) => setComponentId(v)}
                options={components.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
          </Field>
          <Field label="Reimbursement Date" required>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className={inputCls}
                required
              />
              <input
                type="date"
                value={billDateTo}
                min={billDate || undefined}
                onChange={(e) => setBillDateTo(e.target.value)}
                className={inputCls}
                placeholder="dd-mm-yyyy"
              />
            </div>
            {dateRangeInvalid && <p className="text-xs text-rose-600 mt-1">To date must be after From date</p>}
          </Field>
        </div>

        {/* Row 2: Title */}
        <Field label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="Title"
            required
          />
        </Field>

        {/* Row 3: Project toggle */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-700">Project</label>
          <button
            type="button"
            role="switch"
            aria-checked={isProject}
            onClick={() => setIsProject((v) => !v)}
            className={clsx(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              isProject ? "bg-[#3b82f6]" : "bg-gray-300",
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                isProject ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </button>
        </div>

        {/* Row 4: Currency + Amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Select Currency" required>
            <Select value={currency} onChange={(v) => setCurrency(v)} options={CURRENCIES} />
          </Field>
          <Field label="Amount" required>
            <NumberInput
              min="1"
              step="0.01"
              value={amountClaimed}
              onChange={(v) => setAmountClaimed(v)}
              className={inputCls}
              placeholder="Enter amount"
              required
            />
          </Field>
        </div>

        {selected?.claimInstructions && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 whitespace-pre-line">
            <span className="font-semibold">Instructions:</span> {selected.claimInstructions}
          </div>
        )}

        {/* Row 5: Bill # + Merchant */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bill Number" required={!!selected?.requireBillNumber}>
            <input
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              className={inputCls}
              placeholder="Enter bill number"
              required={selected?.requireBillNumber}
            />
            {billNumberMissing && <p className="text-xs text-rose-600 mt-1">Bill Number is required</p>}
          </Field>
          <Field label="Merchant Name" required={!!selected?.requireMerchantName}>
            <input
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              className={inputCls}
              placeholder="Enter merchant name"
              required={selected?.requireMerchantName}
            />
            {merchantMissing && <p className="text-xs text-rose-600 mt-1">Merchant Name is required</p>}
          </Field>
        </div>

        {/* Row 6: Comment with char counter */}
        <Field label="Comment">
          <div className="relative">
            <textarea
              rows={3}
              maxLength={COMMENT_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls + " resize-none"}
              placeholder="Add a comment (optional)"
            />
            <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 tabular-nums">
              {description.length}/{COMMENT_MAX}
            </span>
          </div>
        </Field>

        {/* Row 7: Upload — real file upload via /api/v1/hrms/uploads */}
        <Field
          label="Upload Documents (Bills / Receipts)"
          required={!!selected?.requireUploadDoc}
        >
          <FileUpload attachments={attachments} onChange={setAttachments} />
          {docMissing && <p className="text-xs text-rose-600 mt-1">At least one bill / proof document is required</p>}
        </Field>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/40">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !!dateRangeInvalid || !categoryPicked || !billDate || !title || !amountClaimed || !!billNumberMissing || !!merchantMissing || !!docMissing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold shadow-sm"
        >
          <Save size={14} /> {submitting ? "Submitting…" : "Submit Claim"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// File upload — drag/drop + click-to-browse → POST /api/v1/hrms/uploads
// → returns proxy URL → stored on the claim as `fileUrl`.
// ─────────────────────────────────────────────────────────────────

export interface UploadedMeta {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface UploadResponse {
  url: string;
  directUrl: string;
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

const ACCEPTED_MIME = [
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "image/heic", "image/heif",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB — matches the server-side image cap in /api/v1/hrms/uploads
const MAX_FILES = 10;             // matches the server-side cap in employeeSubmitClaimSchema

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function FileUpload({
  attachments, onChange,
}: {
  attachments: UploadedMeta[];
  onChange: (next: UploadedMeta[]) => void;
}) {
  const api = useApiClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const remainingSlots = MAX_FILES - attachments.length;
  const atCap = remainingSlots <= 0;

  // Upload a batch sequentially — the server endpoint is single-file so
  // we serialize. Each successful upload appends to the list immediately
  // so the UI feels responsive on slow connections.
  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (atCap) {
      toast.error("Attachment limit reached", `Max ${MAX_FILES} files per claim`);
      return;
    }
    if (list.length > remainingSlots) {
      toast.error("Too many files", `Only ${remainingSlots} more allowed; ${list.length - remainingSlots} skipped`);
      list.length = remainingSlots;
    }
    setUploading(true);
    try {
      let current = attachments;
      for (const file of list) {
        if (!ACCEPTED_MIME.includes(file.type)) {
          toast.error(`Skipped ${file.name}`, "Unsupported type. Use PDF, JPG, PNG, WEBP, HEIC.");
          continue;
        }
        if (file.size > MAX_SIZE) {
          toast.error(`Skipped ${file.name}`, `Too large (${formatSize(file.size)}). Max 10 MB.`);
          continue;
        }
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await api.upload<UploadResponse>("/api/v1/hrms/uploads", fd);
          const item: UploadedMeta = {
            url: res.data.url,
            name: res.data.fileName,
            size: res.data.fileSize,
            type: res.data.fileType,
            uploadedAt: new Date().toISOString(),
          };
          current = [...current, item];
          onChange(current);
        } catch (e) {
          toast.error(`Upload failed: ${file.name}`, (e as Error).message);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const removeAt = (idx: number) => {
    onChange(attachments.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {/* Existing attachments list */}
      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((f, i) => (
            <li
              key={`${f.url}-${i}`}
              className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={f.name}>{f.name}</p>
                <div className="flex items-center gap-2 text-[11px] text-gray-600">
                  <span>{formatSize(f.size)}</span>
                  <span className="text-gray-300">·</span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[#3b82f6] hover:underline"
                  >
                    Preview <ExternalLink size={10} />
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Drop zone — hidden once at cap */}
      {!atCap && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={clsx(
            "rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors",
            isDragging
              ? "border-[#16243A] bg-blue-50/60"
              : "border-gray-300 bg-gray-50/40 hover:border-gray-400 hover:bg-gray-50/60",
          )}
        >
          {uploading ? (
            <>
              <Loader2 size={20} className="mx-auto text-[#3b82f6] mb-1.5 animate-spin" />
              <p className="text-xs font-semibold text-gray-700">Uploading…</p>
            </>
          ) : (
            <>
              <FileUp size={20} className="mx-auto text-gray-400 mb-1.5" />
              <p className="text-xs text-gray-600">
                {attachments.length === 0
                  ? <>Drag &amp; drop files or{" "}</>
                  : <>Add more files —{" "}</>}
                <label className="text-[#3b82f6] font-semibold cursor-pointer hover:underline">
                  Browse
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={ACCEPTED_MIME.join(",")}
                    onChange={(e) => {
                      if (e.target.files) handleFiles(e.target.files);
                    }}
                  />
                </label>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                PDF, JPG, PNG, WEBP, HEIC · up to 10 MB each · {remainingSlots} slot{remainingSlots !== 1 ? "s" : ""} left
              </p>
            </>
          )}
        </div>
      )}
      {atCap && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          Maximum {MAX_FILES} attachments reached. Remove one to add another.
        </p>
      )}
    </div>
  );
}

