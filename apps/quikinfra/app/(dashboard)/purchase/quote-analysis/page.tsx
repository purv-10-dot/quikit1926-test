"use client";

/**
 * Comparative Statement — RFQs that have vendors attached, shown as a
 * lean table with a per-row "Details" action that jumps into the
 * item-wise vendor comparison page at
 * `/purchase/quote-analysis/[rfqId]`.
 *
 * Data source: `useRFQs` (no new endpoint). Search is client-side so
 * there's no network traffic per keystroke. Rows where no vendors are
 * attached are filtered out — nothing to compare.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/PageShell";
import { useRFQs } from "@/hooks/use-approvals";

function statusLabel(s: string): { text: string; tone: "success" | "warn" | "info" | "default" } {
  switch (s) {
    case "draft":
      return { text: "Draft", tone: "default" };
    case "pending_approval":
    case "submitted":
      return { text: "Approval Pending", tone: "success" };
    case "approved":
      return { text: "Approved", tone: "success" };
    case "sent":
      return { text: "Sent", tone: "info" };
    case "quoted":
    case "responses_received":
      return { text: "Responses Received", tone: "info" };
    case "evaluated":
      return { text: "Evaluated", tone: "info" };
    case "closed":
      return { text: "Closed", tone: "default" };
    default:
      return { text: s || "—", tone: "default" };
  }
}

function toneClass(t: ReturnType<typeof statusLabel>["tone"]): string {
  switch (t) {
    case "success":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "info":
      return "bg-orange-50 text-orange-700 border border-orange-200";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

interface QuoteRfqRow {
  id: string; rfqNumber?: string; projectName?: string; status?: string;
  rfqDate?: string; dueDate?: string;
  vendors?: Array<{ quotedRates?: unknown[] }>;
  [key: string]: unknown;
}

export default function ComparativeStatementPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data: result } = useRFQs({ status: "all", search: "" });

  const rows = useMemo(() => {
    const all = ((result?.data ?? []) as unknown as QuoteRfqRow[]).filter(
      (r) => (r.vendors ?? []).length > 0,
    );
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => {
      const rfq = String(r.rfqNumber ?? "").toLowerCase();
      const proj = String(r.projectName ?? "").toLowerCase();
      return rfq.includes(q) || proj.includes(q);
    });
  }, [result, search]);

  return (
    <>
      <PageContainer>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Comparative Statement
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Review Quotations and Shortlist Suppliers
            </p>
          </div>
          <div className="relative w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by RFQ No or Project..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left">RFQ No</th>
                <th className="px-5 py-3 text-left">Project Name</th>
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Due Date</th>
                <th className="px-5 py-3 text-left">No. of Vendors</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-sm text-gray-400"
                  >
                    No RFQs with attached vendors yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const vendors = Array.isArray(r.vendors) ? r.vendors : [];
                  const quoted = vendors.filter(
                    (v) =>
                      Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
                  ).length;
                  const lbl = statusLabel(r.status ?? "");
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/purchase/quote-analysis/${r.id}`)
                          }
                          className="text-accent-600 font-medium hover:underline"
                        >
                          {r.rfqNumber ?? r.id}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-gray-800">
                        {r.projectName ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">
                        {fmtDate(r.rfqDate)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">
                        {fmtDate(r.dueDate)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">
                        {quoted} / {vendors.length}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${toneClass(lbl.tone)}`}
                        >
                          {lbl.text}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/purchase/quote-analysis/${r.id}`)
                          }
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium text-accent-700 bg-white border border-accent-200 hover:bg-accent-50"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </PageContainer>
    </>
  );
}
