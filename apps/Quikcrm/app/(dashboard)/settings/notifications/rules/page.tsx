"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Zap, RefreshCw, AlertTriangle } from "lucide-react";
import { NotificationsSubNav } from "@/components/notifications/rules/notifications-sub-nav";
import { RuleCard } from "@/components/notifications/rules/rule-card";
import { RuleBuilderModal } from "@/components/notifications/rules/rule-builder-modal";
import type { NotificationRule } from "@/lib/notifications/rules/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  entityType: string;
  conditionType: string;
  fieldName: string;
  conditionValue: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  recipientType: string;
  recipientValue: string;
  messageTemplate: string;
  isActive: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationRulesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);

  // ── Ensure DB table exists on first load ──────────────────────────────────
  const { data: setupData, isError: setupError } = useQuery({
    queryKey: ["notification-rules-setup"],
    queryFn: async () => {
      const r = await fetch("/api/notifications/rules/setup", { method: "POST" });
      if (!r.ok) throw new Error("Setup failed");
      return r.json();
    },
    staleTime: Infinity, // Run once per session.
    retry: 2,
  });

  // ── Rules list ────────────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError: listError,
    refetch,
    isFetching,
  } = useQuery<{ rules: NotificationRule[] }>({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const r = await fetch("/api/notifications/rules");
      if (!r.ok) throw new Error("Failed to fetch rules");
      return r.json();
    },
    enabled: !!setupData, // Wait for setup to complete.
    staleTime: 30_000,
  });

  const rules = data?.rules ?? [];

  // ── Toggle ────────────────────────────────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      setTogglingId(id);
      const r = await fetch(`/api/notifications/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("Toggle failed");
      return r.json();
    },
    onSettled: () => {
      setTogglingId(null);
      void qc.invalidateQueries({ queryKey: ["notification-rules"] });
    },
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!window.confirm("Delete this rule permanently?")) return;
      setDeletingId(id);
      const r = await fetch(`/api/notifications/rules/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      return r.json();
    },
    onSettled: () => {
      setDeletingId(null);
      void qc.invalidateQueries({ queryKey: ["notification-rules"] });
    },
  });

  // ── Save (create or update) ───────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async (form: FormState) => {
    setIsSaving(true);
    try {
      const url = editingRule
        ? `/api/notifications/rules/${editingRule.id}`
        : "/api/notifications/rules";
      const method = editingRule ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Save failed");
      void qc.invalidateQueries({ queryKey: ["notification-rules"] });
      setModalOpen(false);
      setEditingRule(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => { setEditingRule(null); setModalOpen(true); };
  const openEdit = (rule: NotificationRule) => { setEditingRule(rule); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingRule(null); };

  return (
    <div className="space-y-6">
      <NotificationsSubNav />

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-crm-text">Notification Rules</h1>
          <p className="mt-0.5 text-sm text-crm-muted">
            Rules fire <span className="font-medium text-crm-text">after</span> built-in notifications and add additional
            alerts based on your conditions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-xs font-medium text-crm-text transition hover:bg-crm-panel disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-crm-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-crm-blue-dark"
          >
            <Plus size={15} />
            New Rule
          </button>
        </div>
      </div>

      {/* ── Architecture callout ── */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3.5">
        <Zap size={16} className="mt-0.5 shrink-0 text-blue-500" strokeWidth={2.5} />
        <div>
          <p className="text-sm font-medium text-blue-800">Layered notification architecture</p>
          <p className="mt-0.5 text-xs leading-relaxed text-blue-700">
            Built-in notifications (Lead Assigned, Stage Changed, Converted, Reassigned) always fire first.
            Rules run afterwards — they never replace or affect the built-in ones.
          </p>
          <div className="mt-2 font-mono text-[11px] text-blue-600">
            CRM Event → Built-in Notifications → Rules Engine → Additional Notifications
          </div>
        </div>
      </div>

      {/* ── Error states ── */}
      {setupError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">Setup failed</p>
            <p className="text-xs text-red-700">
              Could not create the rules database table. Check server logs and ensure the
              database is accessible. <button
                type="button"
                className="underline"
                onClick={() => void qc.invalidateQueries({ queryKey: ["notification-rules-setup"] })}
              >Retry</button>
            </p>
          </div>
        </div>
      )}

      {listError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">Failed to load rules. <button type="button" className="underline" onClick={() => refetch()}>Try again</button></p>
        </div>
      )}

      {/* ── Rules list ── */}
      {isLoading ? (
        <RulesLoadingSkeleton />
      ) : rules.length === 0 ? (
        <RulesEmptyState onCreateClick={openCreate} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-crm-muted">
            {rules.length} rule{rules.length !== 1 ? "s" : ""} configured ·{" "}
            {rules.filter((r) => r.isActive).length} active
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={openEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                isTogglingId={togglingId}
                isDeletingId={deletingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <RuleBuilderModal
          editingRule={editingRule}
          onClose={closeModal}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function RulesLoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-crm-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-200" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="h-12 animate-pulse rounded-lg bg-slate-50" />
          <div className="flex gap-2">
            <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-5 w-12 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function RulesEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <Zap size={26} className="text-blue-400" strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-slate-700">No rules configured</p>
        <p className="max-w-xs text-xs leading-relaxed text-slate-400">
          Create rules to send additional notifications when specific conditions are met.
          Built-in notifications always run regardless of rules.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreateClick}
        className="flex items-center gap-2 rounded-lg bg-crm-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-crm-blue-dark"
      >
        <Plus size={15} />
        Create your first rule
      </button>
    </div>
  );
}
