"use client";

import { useState } from "react";
import { Plus, MessageCircle as MessageSquareReply } from "lucide-react";

import { useSocialAccounts } from "@/lib/auto-reply/use-social-accounts";
import { useAutoReplyRules } from "@/lib/auto-reply/use-auto-reply-rules";
import type { RuleRow } from "@/lib/auto-reply/client-types";

import { KpiStrip } from "./KpiStrip";
import { RuleCard } from "./RuleCard";
import { PlatformToggleStrip } from "./PlatformToggleStrip";
import { Skeleton } from "./primitives/Skeleton";
import { ErrorBanner } from "./primitives/ErrorBanner";
import { ConfirmDialog } from "./primitives/ConfirmDialog";

type RulesHook = ReturnType<typeof useAutoReplyRules>;

export function RulesView({
  brandId,
  rulesHook,
  onCreateRule,
  onEditRule,
}: {
  brandId: string;
  rulesHook: RulesHook;
  onCreateRule: () => void;
  onEditRule: (rule: RuleRow) => void;
}) {
  const accountsHook = useSocialAccounts(brandId);
  const accountById = new Map(
    (accountsHook.data ?? []).map((a) => [a.id, a]),
  );

  const [pendingDelete, setPendingDelete] = useState<RuleRow | null>(null);

  const rules = rulesHook.data;
  const activeCount = (rules ?? []).filter((r) => r.isActive).length;

  if (rulesHook.loading) {
    return (
      <div>
        <Skeleton variant="kpi" count={4} />
        <Skeleton variant="rule" count={3} />
      </div>
    );
  }

  if (rulesHook.error) {
    return (
      <ErrorBanner message={rulesHook.error} onRetry={rulesHook.refetch} />
    );
  }

  if (!rules || rules.length === 0) {
    return (
      // Heavy-glass empty state — matches design-tokens.md §1 EmptyStateGlassCard.
      <div
        style={{
          background: "rgba(33, 33, 33, 0.12)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: 24,
          padding: 48,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.25)",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(34, 197, 94, 0.18)",
            border: "1px solid rgba(34, 197, 94, 0.35)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <MessageSquareReply size={28} color="#22C55E" />
        </div>
        <h3
          style={{
            fontSize: 18,
            fontWeight: 600,
            margin: 0,
            marginBottom: 8,
            color: "#FFFFFF",
          }}
        >
          Set up auto-replies to respond to comments automatically
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255, 255, 255, 0.65)",
            margin: 0,
            marginBottom: 22,
            lineHeight: 1.55,
            maxWidth: 460,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Create a rule, pick which comments it matches, and choose a template
          or let AI write each reply. We&apos;ll start replying within a minute
          of any new matching comment.
        </p>
        <button
          type="button"
          onClick={onCreateRule}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 22px",
            borderRadius: 10,
            border: "none",
            background: "#FFFFFF",
            color: "#0A0A0A",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          Create your first rule
        </button>
      </div>
    );
  }

  return (
    <div>
      <PlatformToggleStrip accountsHook={accountsHook} />

      <KpiStrip brandId={brandId} activeRuleCount={activeCount} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            color: "#FFFFFF",
          }}
        >
          Auto-reply rules
        </h3>
        <button
          type="button"
          onClick={onCreateRule}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 10,
            border: "none",
            background: "#FFFFFF",
            color: "#0A0A0A",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          New rule
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rules.map((rule) => {
          const account = accountById.get(rule.socialAccountId);
          return (
            <RuleCard
              key={rule.id}
              rule={rule}
              accountLabel={account?.accountName ?? null}
              accountPlatform={account?.platform ?? null}
              onToggle={() => rulesHook.toggle(rule.id, !rule.isActive)}
              onEdit={() => onEditRule(rule)}
              onDelete={() => setPendingDelete(rule)}
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ""}
        description="This rule will stop replying to comments immediately. The activity log is preserved. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          if (pendingDelete) {
            void rulesHook.remove(pendingDelete.id);
            setPendingDelete(null);
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
