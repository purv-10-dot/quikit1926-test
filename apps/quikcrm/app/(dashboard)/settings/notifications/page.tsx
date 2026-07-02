"use client";

/**
 * /settings/notifications
 *
 * Admin-only notification debugging & management page.
 *
 * Sections:
 *   1. System Health
 *   2. Notification Stats
 *   3. Send Test Notification
 *   4. Live SSE Monitor
 *   5. Notification History
 *   6. Trigger Debugger (root-cause guide)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationsSubNav } from "@/components/notifications/rules/notifications-sub-nav";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Circle,
  Database,
  Loader2,
  Mail,
  Radio,
  RefreshCw,
  Send,
  Server,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType =
  | "lead_assigned"
  | "lead_stage_changed"
  | "lead_converted"
  | "lead_reassigned";

interface StatsData {
  total: number;
  unread: number;
  read: number;
  today: number;
}

interface SubsystemResult {
  ok: boolean;
  latencyMs?: number;
  detail: string;
}

interface HealthData {
  allOk: boolean;
  database: SubsystemResult;
  email: SubsystemResult;
}

interface HistoryItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  body: string | null;
  category: string | null;
  link: string | null;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface HistoryData {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface OrgUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface LiveEvent {
  id: string;
  arrivedAt: string;
  data: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(ok: boolean | undefined, loading = false) {
  if (loading)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        <Loader2 size={10} className="animate-spin" /> Checking…
      </span>
    );
  if (ok === undefined)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        Unknown
      </span>
    );
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Error
    </span>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_LABELS: Record<NotificationType, string> = {
  lead_assigned: "Lead Assigned",
  lead_stage_changed: "Lead Stage Changed",
  lead_converted: "Lead Converted",
  lead_reassigned: "Lead Reassigned",
};

const TYPE_COLORS: Record<NotificationType, string> = {
  lead_assigned: "bg-blue-100 text-blue-700",
  lead_stage_changed: "bg-violet-100 text-violet-700",
  lead_converted: "bg-emerald-100 text-emerald-700",
  lead_reassigned: "bg-amber-100 text-amber-700",
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2 border-b border-crm-border pb-3">
        <Icon size={18} className="text-crm-blue" />
        <h2 className="text-base font-semibold text-crm-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ─── Section 1: System Health ─────────────────────────────────────────────────

function HealthSection() {
  const { data, isLoading, refetch, isFetching } = useQuery<HealthData>({
    queryKey: ["notifications-debug-health"],
    queryFn: async () => {
      const r = await fetch("/api/notifications/debug/health");
      if (!r.ok) throw new Error("Health check failed");
      return r.json();
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const checks: Array<{
    key: keyof Omit<HealthData, "allOk">;
    label: string;
    Icon: React.ElementType;
  }> = [
    { key: "database", label: "Database (Prisma)", Icon: Database },
    { key: "email", label: "Email Provider", Icon: Mail },
  ];

  return (
    <Section title="System Health" icon={Activity}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-crm-muted">
          Live checks run against each subsystem the notification pipeline depends on.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel disabled:opacity-50"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Re-check
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {checks.map(({ key, label, Icon }) => {
          const result = data?.[key];
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-xl border border-crm-border bg-white p-4"
            >
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  result === undefined || isLoading
                    ? "bg-slate-100"
                    : result.ok
                      ? "bg-emerald-50"
                      : "bg-red-50"
                }`}
              >
                <Icon
                  size={18}
                  className={
                    result === undefined || isLoading
                      ? "text-slate-400"
                      : result.ok
                        ? "text-emerald-500"
                        : "text-red-500"
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-crm-text">{label}</span>
                  {statusPill(result?.ok, isLoading)}
                </div>
                {result?.latencyMs !== undefined && (
                  <p className="mt-0.5 text-[11px] text-crm-muted">{result.latencyMs}ms</p>
                )}
                <p className="mt-1 text-xs text-crm-muted leading-relaxed">
                  {isLoading ? "Checking…" : (result?.detail ?? "—")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Section 2: Notification Stats ───────────────────────────────────────────

function StatsSection() {
  const { data, isLoading, refetch, isFetching } = useQuery<StatsData>({
    queryKey: ["notifications-debug-stats"],
    queryFn: async () => {
      const r = await fetch("/api/notifications/debug/stats");
      if (!r.ok) throw new Error("Stats fetch failed");
      return r.json();
    },
    staleTime: 15_000,
  });

  const cards = [
    { label: "Total Notifications", value: data?.total, color: "text-crm-text" },
    { label: "Unread", value: data?.unread, color: "text-blue-600" },
    { label: "Read", value: data?.read, color: "text-emerald-600" },
    { label: "Created Today", value: data?.today, color: "text-violet-600" },
  ];

  return (
    <Section title="Notification Stats" icon={Bell}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel disabled:opacity-50"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-crm-border bg-white p-4 text-center">
            <p
              className={`text-3xl font-bold tabular-nums ${color} ${isLoading ? "opacity-30" : ""}`}
            >
              {isLoading ? "—" : (value ?? 0)}
            </p>
            <p className="mt-1 text-xs text-crm-muted">{label}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Section 3: Send Test Notification ───────────────────────────────────────

function TestSection() {
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<NotificationType>("lead_assigned");
  const [title, setTitle] = useState("Lead assigned to you");
  const [body, setBody] = useState(
    '"Acme Corp Enquiry" was assigned to you by Admin (test notification).',
  );
  const [link, setLink] = useState("/leads");
  const [skipEmail, setSkipEmail] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const qc = useQueryClient();

  // API returns { items: [...], total, page, pageSize } — NOT { users: [...] }
  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
  } = useQuery<{ items: OrgUser[]; total: number }>({
    queryKey: ["settings-users-list"],
    queryFn: async () => {
      const r = await fetch("/api/settings/users?pageSize=200");
      if (!r.ok) throw new Error(`Failed to load users (${r.status})`);
      return r.json();
    },
    staleTime: 60_000,
  });

  const users: OrgUser[] = usersData?.items ?? [];

  const sendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/notifications/debug/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type, title, body, link, skipEmail }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Request failed");
      return json;
    },
    onSuccess: (data) => {
      setResult({ ok: true, message: data.message });
      void qc.invalidateQueries({ queryKey: ["notifications-debug-stats"] });
      void qc.invalidateQueries({ queryKey: ["notifications-debug-history"] });
    },
    onError: (err: Error) => {
      setResult({ ok: false, message: err.message });
    },
  });

  // Auto-fill title/body when type changes.
  const handleTypeChange = (t: NotificationType) => {
    setType(t);
    const defaults: Record<NotificationType, { title: string; body: string }> = {
      lead_assigned: {
        title: "Lead assigned to you",
        body: '"Acme Corp Enquiry" was assigned to you by Admin (test).',
      },
      lead_stage_changed: {
        title: "Lead stage updated",
        body: '"Acme Corp Enquiry" moved from New Lead to Contacted by Admin (test).',
      },
      lead_converted: {
        title: "Lead converted",
        body: '"Acme Corp Enquiry" was converted by Admin (test). A contact and opportunity was created.',
      },
      lead_reassigned: {
        title: "Lead reassigned",
        body: '"Acme Corp Enquiry" was reassigned to Priya Patel by Admin (test).',
      },
    };
    setTitle(defaults[t].title);
    setBody(defaults[t].body);
  };

  const inputCls =
    "w-full rounded-lg border border-crm-border bg-white px-3 py-2 text-sm text-crm-text outline-none transition focus-visible:ring-2 focus-visible:ring-crm-blue-glow";

  return (
    <Section title="Send Test Notification" icon={Send}>
      <div className="rounded-xl border border-crm-border bg-crm-panel/40 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Recipient */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-crm-text">
              Recipient User <span className="text-red-500">*</span>
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={inputCls}
            >
              {usersLoading ? (
                <option value="" disabled>Loading users…</option>
              ) : usersError ? (
                <option value="" disabled>Failed to load users — check console</option>
              ) : users.length === 0 ? (
                <option value="" disabled>No users found</option>
              ) : (
                <option value="">— Select user —</option>
              )}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-crm-text">
              Notification Type <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as NotificationType)}
              className={inputCls}
            >
              {(Object.keys(TYPE_LABELS) as NotificationType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-crm-text">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder="Notification title…"
            />
          </div>

          {/* Action URL */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-crm-text">Action URL</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className={inputCls}
              placeholder="/leads/some-id"
            />
          </div>

          {/* Message */}
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-crm-text">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Notification body text…"
            />
          </div>
        </div>

        {/* Skip email toggle */}
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-crm-muted">
          <input
            type="checkbox"
            checked={skipEmail}
            onChange={(e) => setSkipEmail(e.target.checked)}
            className="h-4 w-4 rounded border-crm-border accent-crm-blue"
          />
          Skip email delivery (in-app only)
        </label>

        {/* Result */}
        {result && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {result.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <XCircle size={15} className="mt-0.5 shrink-0" />}
            {result.message}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!userId || !title || !body || sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
            className="flex items-center gap-2 rounded-lg bg-crm-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-crm-blue-dark disabled:opacity-50"
          >
            {sendMutation.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            Send Test Notification
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── Section 4: Live SSE Monitor ─────────────────────────────────────────────

function LiveMonitorSection() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const counter = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource("/api/notifications/stream");
    esRef.current = es;
    es.addEventListener("hello", () => setConnected(true));
    es.addEventListener("notification", (e) => {
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>;
        counter.current += 1;
        setEvents((prev) => [
          {
            id: `evt-${counter.current}`,
            arrivedAt: new Date().toISOString(),
            data,
          },
          ...prev.slice(0, 49), // Keep last 50
        ]);
      } catch {/* ignore */}
    });
    es.addEventListener("error", () => setConnected(false));
  }, []);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => () => { esRef.current?.close(); }, []);

  return (
    <Section title="Live SSE Monitor" icon={Radio}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}
          />
          <span className="text-xs text-crm-muted">
            {connected ? "Connected — listening for events" : "Disconnected"}
          </span>
        </div>
        <div className="flex-1" />
        {!connected ? (
          <button
            type="button"
            onClick={connect}
            className="flex items-center gap-1.5 rounded-lg bg-crm-blue px-3 py-1.5 text-xs font-medium text-white transition hover:bg-crm-blue-dark"
          >
            <Radio size={12} /> Connect
          </button>
        ) : (
          <button
            type="button"
            onClick={disconnect}
            className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel"
          >
            Disconnect
          </button>
        )}
        <button
          type="button"
          onClick={() => setEvents([])}
          className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel"
        >
          Clear
        </button>
      </div>

      <div className="rounded-xl border border-crm-border bg-slate-900 font-mono text-xs">
        {/* Header row */}
        <div className="grid grid-cols-[80px_1fr_140px_80px] gap-2 border-b border-slate-700 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Time</span>
          <span>Title</span>
          <span>Type</span>
          <span>Status</span>
        </div>

        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">
            {connected
              ? "Listening… send a test notification above to see it appear here."
              : "Click Connect to start monitoring the SSE stream."}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {events.map((ev) => {
              const type = ev.data.metadata
                ? (ev.data.metadata as Record<string, unknown>).type as string
                : undefined;
              return (
                <div
                  key={ev.id}
                  className="grid grid-cols-[80px_1fr_140px_80px] gap-2 border-b border-slate-800 px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-800/50"
                >
                  <span className="text-slate-400">{fmtTime(ev.arrivedAt)}</span>
                  <span className="truncate text-white">{String(ev.data.title ?? "—")}</span>
                  <span className="truncate text-violet-300">{type ?? String(ev.data.category ?? "—")}</span>
                  <span className="text-emerald-400">received</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-crm-muted">
        This monitor subscribes to <code className="rounded bg-slate-100 px-1">/api/notifications/stream</code> — your own user&apos;s channel. Send a test notification to yourself to verify end-to-end delivery.
      </p>
    </Section>
  );
}

// ─── Section 5: Notification History ─────────────────────────────────────────

function HistorySection() {
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery<HistoryData>({
    queryKey: ["notifications-debug-history", filter, page],
    queryFn: async () => {
      const r = await fetch(
        `/api/notifications/debug/history?filter=${filter}&page=${page}&pageSize=25`,
      );
      if (!r.ok) throw new Error("History fetch failed");
      return r.json();
    },
    staleTime: 15_000,
  });

  const items = data?.items ?? [];

  const getTypeFromMeta = (metadata: Record<string, unknown> | null): string => {
    return (metadata?.type as string) ?? "—";
  };

  return (
    <Section title="Notification History" icon={Bell}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "unread", "read"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { setFilter(f); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === f
                ? "bg-crm-blue text-white"
                : "border border-crm-border text-crm-text hover:bg-crm-panel"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        {data && (
          <span className="text-xs text-crm-muted">
            {data.total} notification{data.total !== 1 ? "s" : ""}
          </span>
        )}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel disabled:opacity-50"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-crm-border">
        <table className="w-full text-sm">
          <thead className="border-b border-crm-border bg-crm-panel/60">
            <tr>
              {["Created", "User", "Type", "Title", "Read"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 w-24 animate-pulse rounded bg-crm-border" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-crm-muted">
                  No notifications found.
                </td>
              </tr>
            ) : (
              items.map((n) => {
                const type = getTypeFromMeta(n.metadata);
                const typeKey = type as NotificationType;
                return (
                  <tr key={n.id} className="hover:bg-crm-panel/40">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-crm-muted">
                      {fmtDateTime(n.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-medium text-crm-text">{n.userName}</p>
                      <p className="text-[11px] text-crm-muted">{n.userEmail}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          TYPE_COLORS[typeKey] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {TYPE_LABELS[typeKey] ?? type}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <p className="truncate text-xs font-medium text-crm-text">{n.title}</p>
                      {n.body && (
                        <p className="truncate text-[11px] text-crm-muted">{n.body}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {n.readAt ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                          <CheckCircle2 size={11} /> Read
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                          <Circle size={11} className="fill-blue-600" /> Unread
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-crm-muted">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Section 6: Trigger Debugger ─────────────────────────────────────────────

const TRIGGERS: Array<{
  type: NotificationType;
  label: string;
  file: string;
  route: string;
  guardNote: string;
}> = [
  {
    type: "lead_assigned",
    label: "Lead Assigned",
    file: "lib/notifications/lead-triggers.ts → notifyLeadAssigned()",
    route: "PATCH /api/leads/[id]",
    guardNote: "Fires when data.ownerId is in the PATCH body AND newOwnerId ≠ oldOwnerId AND actor ≠ newOwner.",
  },
  {
    type: "lead_reassigned",
    label: "Lead Reassigned",
    file: "lib/notifications/lead-triggers.ts → notifyLeadReassigned()",
    route: "PATCH /api/leads/[id]",
    guardNote: "Fires alongside Lead Assigned when an existing owner is displaced. Skipped if actor = old owner.",
  },
  {
    type: "lead_stage_changed",
    label: "Lead Stage Changed",
    file: "lib/notifications/lead-triggers.ts → notifyLeadStageChanged()",
    route: "POST /api/leads/[id]/transition",
    guardNote: "Fires after successful stage transition. Skipped if ownerId is null OR actor = lead owner.",
  },
  {
    type: "lead_converted",
    label: "Lead Converted",
    file: "lib/notifications/lead-triggers.ts → notifyLeadConverted()",
    route: "POST /api/leads/[id]/convert",
    guardNote: "Fires after prisma.$transaction() succeeds. Skipped if ownerId is null OR actor = lead owner.",
  },
];

// Common failure reasons with quick fixes.
const ROOT_CAUSES = [
  {
    title: "Self-notification suppression (most common)",
    detail:
      "All four triggers check: if (actorUserId === ownerId) return. When you test with the same user account that owns the lead, every notification is correctly suppressed. Use two different user accounts in two different browsers to test.",
    severity: "high",
  },
  {
    title: "Redis not configured (REDIS_URL unset)",
    detail:
      "Without Redis, the SSE stream returns 503 and the client gives up after 3 consecutive errors. Notifications ARE still written to the database — the bell badge just lags by up to 60 seconds (polling fallback). Set REDIS_URL in .env.local to get real-time delivery.",
    severity: "medium",
  },
  {
    title: "Owner unchanged (no diff)",
    detail:
      "fireLeadOwnerChangeNotifications() skips silently when newOwnerId === oldOwnerId. If you patch the lead with the same owner it already has, no notification fires. This is correct behaviour.",
    severity: "low",
  },
  {
    title: "Lead has no owner (ownerId = null)",
    detail:
      "notifyLeadStageChanged() and notifyLeadConverted() both guard: if (!ownerId) return. A lead with no owner assigned will never produce a stage-change or conversion notification.",
    severity: "medium",
  },
  {
    title: "ownerId not in PATCH payload",
    detail:
      "The PATCH route only fires owner-change notifications when data.ownerId !== undefined. If the frontend sends a partial update without touching ownerId, no ownership notification fires (correct behaviour).",
    severity: "low",
  },
  {
    title: "createNotification() DB error (silent)",
    detail:
      "The entire trigger chain runs fire-and-forget. Errors are console.error'd but never bubble up to the API response. Check server logs for [notifications] prefixed errors. Use the Health Check above to verify DB connectivity.",
    severity: "medium",
  },
];

function TriggerDebuggerSection() {
  return (
    <Section title="Trigger Debugger & Root Cause Guide" icon={AlertTriangle}>
      {/* Root causes */}
      <div className="mb-5">
        <h3 className="mb-3 text-sm font-semibold text-crm-text">
          Why notifications may not appear
        </h3>
        <div className="space-y-2">
          {ROOT_CAUSES.map((rc) => (
            <div
              key={rc.title}
              className={`flex gap-3 rounded-xl border p-3 ${
                rc.severity === "high"
                  ? "border-red-200 bg-red-50"
                  : rc.severity === "medium"
                    ? "border-amber-200 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <AlertTriangle
                size={15}
                className={`mt-0.5 shrink-0 ${
                  rc.severity === "high"
                    ? "text-red-500"
                    : rc.severity === "medium"
                      ? "text-amber-500"
                      : "text-slate-400"
                }`}
              />
              <div>
                <p
                  className={`text-xs font-semibold ${
                    rc.severity === "high"
                      ? "text-red-800"
                      : rc.severity === "medium"
                        ? "text-amber-800"
                        : "text-slate-700"
                  }`}
                >
                  {rc.title}
                </p>
                <p
                  className={`mt-0.5 text-xs leading-relaxed ${
                    rc.severity === "high"
                      ? "text-red-700"
                      : rc.severity === "medium"
                        ? "text-amber-700"
                        : "text-slate-600"
                  }`}
                >
                  {rc.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger wiring table */}
      <h3 className="mb-3 text-sm font-semibold text-crm-text">Trigger wiring</h3>
      <div className="overflow-x-auto rounded-xl border border-crm-border">
        <table className="w-full text-sm">
          <thead className="border-b border-crm-border bg-crm-panel/60">
            <tr>
              {["Trigger", "Route", "Guard Logic", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-crm-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-border">
            {TRIGGERS.map((t) => (
              <tr key={t.type} className="hover:bg-crm-panel/40">
                <td className="px-3 py-3">
                  <p className="text-xs font-semibold text-crm-text">{t.label}</p>
                  <p className="mt-0.5 text-[11px] font-mono text-crm-muted">{t.file}</p>
                </td>
                <td className="px-3 py-3">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                    {t.route}
                  </code>
                </td>
                <td className="max-w-[220px] px-3 py-3 text-[11px] text-crm-muted leading-relaxed">
                  {t.guardNote}
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 size={11} /> Wired
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trace diagram */}
      <div className="mt-4 rounded-xl border border-crm-border bg-slate-900 p-4 font-mono text-xs text-slate-300">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Full execution trace (lead_assigned example)
        </p>
        <pre className="leading-relaxed whitespace-pre-wrap text-[11px]">{`PATCH /api/leads/{id}  { ownerId: "user-b" }
  │
  ├─ updateCrmLead()          ← DB write (awaited)
  ├─ recordLeadChange()       ← audit log (awaited)
  ├─ publishLeadEvent()       ← kanban SSE (fire-and-forget)
  │
  └─ if (data.ownerId !== undefined)
       └─ fireLeadOwnerChangeNotifications()   [fire-and-forget .catch()]
            │
            ├─ if (!newOwnerId || newOwnerId === oldOwnerId) RETURN ←── guard ①
            │
            ├─ notifyLeadAssigned({ newOwnerId })
            │    ├─ if (newOwnerId === actorUserId) RETURN            ←── guard ②
            │    └─ createNotification()
            │         ├─ prisma.crmNotification.create()  (awaited)
            │         ├─ publishNotificationEvent()       (fire-and-forget)
            │         │    └─ redis.publish("quikcrm:notifications:{orgId}:{userId}")
            │         │         └─ EventSource → badge updates (~100ms)
            │         └─ sendNotificationEmail()          (fire-and-forget)
            │
            └─ if (oldOwnerId)
                 └─ notifyLeadReassigned({ oldOwnerId })
                      ├─ if (oldOwnerId === actorUserId) RETURN       ←── guard ③
                      └─ createNotification() [same path]`}</pre>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-10">
      <NotificationsSubNav />

      <div className="flex items-start gap-3">
        <div>
          <h1 className="text-lg font-semibold text-crm-text">Notification System</h1>
          <p className="mt-0.5 text-sm text-crm-muted">
            Monitor, test, and debug the Phase 1 notification pipeline. Admin access required.
          </p>
        </div>
      </div>

      <HealthSection />
      <StatsSection />
      <TestSection />
      <LiveMonitorSection />
      <HistorySection />
      <TriggerDebuggerSection />
    </div>
  );
}
