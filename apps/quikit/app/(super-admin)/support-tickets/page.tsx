"use client";

/**
 * Super Admin → Support Status.
 *
 * Every support ticket raised from every app, with app / org / request-type /
 * status filters. Detail + triage happens in a SlidePanel rather than a nested
 * /support-tickets/[id] route — matching broadcasts and platform-users, and
 * sidestepping the layout's exact-match `isActive` check which would fail to
 * highlight the parent nav item on a nested route.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { SlidePanel, EmptyState, Pagination, TableSkeleton } from "@quikit/ui";
import {
  SUPPORT_REQUEST_TYPES,
  SUPPORT_REQUEST_TYPE_LABELS,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_STATUS_TRANSITIONS,
  formatSupportTicketNo,
  type SupportRequestType,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from "@quikit/shared";

interface Ticket {
  id: string;
  ticketNo: number;
  orgId: string;
  orgName: string;
  appSlug: string;
  roleName: string | null;
  subject: string;
  description: string;
  requestType: SupportRequestType;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  adminResponse: string | null;
  respondedAt: string | null;
  requesterName: string;
  requesterEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AppOption {
  slug: string;
  name: string;
}

const STATUS_CLASSES: Record<SupportTicketStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
  reopened: "bg-purple-100 text-purple-700",
};

const PAGE_SIZE = 20;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [appSlug, setAppSlug] = useState(() => searchParams.get("appSlug") ?? "");
  const [orgId, setOrgId] = useState(() => searchParams.get("orgId") ?? "");
  const [requestType, setRequestType] = useState(() => searchParams.get("requestType") ?? "");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [apps, setApps] = useState<AppOption[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  // Triage panel state
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [draftStatus, setDraftStatus] = useState<SupportTicketStatus>("open");
  const [draftPriority, setDraftPriority] = useState<SupportTicketPriority>("medium");
  const [draftResponse, setDraftResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", String(PAGE_SIZE));
      if (search) qs.set("search", search);
      if (appSlug) qs.set("appSlug", appSlug);
      if (orgId) qs.set("orgId", orgId);
      if (requestType) qs.set("requestType", requestType);
      if (status) qs.set("status", status);

      const r = await fetch(`/api/super/support-tickets?${qs.toString()}`);
      const j = await r.json();
      if (j.success) {
        setItems(j.data ?? []);
        setTotal(j.pagination?.total ?? 0);
        setTotalPages(j.pagination?.totalPages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, appSlug, orgId, requestType, status]);

  useEffect(() => {
    load();
  }, [load]);

  // Filters live in the URL so a triage view can be shared / survives reload.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (appSlug) qs.set("appSlug", appSlug);
    if (orgId) qs.set("orgId", orgId);
    if (requestType) qs.set("requestType", requestType);
    if (status) qs.set("status", status);
    const str = qs.toString();
    router.replace(str ? `/support-tickets?${str}` : "/support-tickets");
  }, [search, appSlug, orgId, requestType, status, router]);

  useEffect(() => {
    setPage(1);
  }, [search, appSlug, orgId, requestType, status]);

  // Filter dropdown sources — reuse the existing super-admin endpoints rather
  // than adding a bespoke facets route.
  useEffect(() => {
    (async () => {
      try {
        const [ra, ro] = await Promise.all([
          fetch("/api/super/apps"),
          fetch("/api/super/orgs?limit=100"),
        ]);
        const [ja, jo] = await Promise.all([ra.json(), ro.json()]);
        if (ja.success) setApps(ja.data ?? []);
        if (jo.success) setOrgs(jo.data ?? []);
      } catch {
        /* filter dropdowns are a convenience — the list still works without them */
      }
    })();
  }, []);

  function openTicket(t: Ticket) {
    setSelected(t);
    setDraftStatus(t.status);
    setDraftPriority(t.priority);
    setDraftResponse("");
    setSaveError(null);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/super/support-tickets/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: draftStatus,
          priority: draftPriority,
          adminResponse: draftResponse.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setSaveError(j.error ?? "Failed to update ticket");
        return;
      }
      setSelected(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  // Only statuses reachable from the ticket's current one — mirrors the
  // server-side transition gate so the UI can't offer an invalid move.
  const allowedStatuses = selected
    ? [selected.status, ...(SUPPORT_STATUS_TRANSITIONS[selected.status] ?? [])]
    : [];

  const selectCls =
    "px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-amber-600" />
          Support Status
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Support requests raised across every QuikIT application.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subject or description…"
          className={`${selectCls} min-w-[240px] flex-1`}
        />
        <select value={appSlug} onChange={(e) => setAppSlug(e.target.value)} className={selectCls}>
          <option value="">All apps</option>
          {apps.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={selectCls}>
          <option value="">All organizations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value)}
          className={selectCls}
        >
          <option value="">All request types</option>
          {SUPPORT_REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {SUPPORT_REQUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          {SUPPORT_TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets"
          message="No tickets match the current filters."
        />
      ) : (
        <>
          <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 border-b border-gray-200">
                  {["Ticket", "Org", "App", "Requester", "Type", "Status", "Created", "Updated"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-xs font-semibold text-gray-600"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openTicket(t)}
                    className="border-b border-gray-100 hover:bg-amber-50/40 cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">
                        {formatSupportTicketNo(t.ticketNo)}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[220px]">
                        {t.subject}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{t.orgName}</td>
                    <td className="px-3 py-2 text-gray-700">{t.appSlug}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <div>{t.requesterName}</div>
                      {t.roleName && <div className="text-xs text-gray-400">{t.roleName}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {SUPPORT_REQUEST_TYPE_LABELS[t.requestType] ?? t.requestType}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          STATUS_CLASSES[t.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {SUPPORT_TICKET_STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtDateTime(t.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtDateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatSupportTicketNo(selected.ticketNo) : ""}
      >
        {selected && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{selected.subject}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {selected.orgName} · {selected.appSlug} · {selected.requesterName}
                {selected.requesterEmail ? ` (${selected.requesterEmail})` : ""}
                {selected.roleName ? ` · ${selected.roleName}` : ""}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Raised {fmtDateTime(selected.createdAt)}
              </p>
            </div>

            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                {selected.description}
              </p>
            </div>

            {selected.adminResponse && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">
                  Latest response · {fmtDateTime(selected.respondedAt)}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-amber-50 rounded-lg p-3">
                  {selected.adminResponse}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value as SupportTicketStatus)}
                  className={`${selectCls} w-full`}
                >
                  {allowedStatuses.map((s) => (
                    <option key={s} value={s}>
                      {SUPPORT_TICKET_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select
                  value={draftPriority}
                  onChange={(e) => setDraftPriority(e.target.value as SupportTicketPriority)}
                  className={`${selectCls} w-full`}
                >
                  {SUPPORT_TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {SUPPORT_TICKET_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Response / remarks
              </label>
              <textarea
                rows={5}
                maxLength={5000}
                value={draftResponse}
                onChange={(e) => setDraftResponse(e.target.value)}
                placeholder="This reply is shown to the user in QuikScale → Settings → Support Status."
                className={`${selectCls} w-full resize-y`}
              />
            </div>

            {saveError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {saveError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save updates"}
              </button>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
