"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle as MessageSquareReply, List, Activity, Image as ImageIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useActiveBrandId } from "@/hooks/useActiveBrandId";
import { useAutoReplyRules } from "@/lib/auto-reply/use-auto-reply-rules";
import { useAutoReplyLogs } from "@/lib/auto-reply/use-auto-reply-logs";
import { useAutoReplyPosts } from "@/lib/auto-reply/use-auto-reply-posts";

import { RulesView } from "@/components/auto-reply/RulesView";
import { ActivityView } from "@/components/auto-reply/ActivityView";
import { PostControlsView } from "@/components/auto-reply/PostControlsView";
import { RuleWizard } from "@/components/auto-reply/RuleWizard";
import type { RuleRow } from "@/lib/auto-reply/client-types";

type Tab = "rules" | "activity" | "posts";

// v2 design tokens — see apps/web/src/lib/constants/design-tokens.md.
// Tabs match the Social/Email pill pattern: white pill container with
// white-bg active tab and transparent inactive tabs.
function NavTab({
  active,
  onClick,
  Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 16px",
        height: 32,
        borderRadius: 9999,
        border: "none",
        cursor: "pointer",
        background: active ? "#FFFFFF" : "transparent",
        color: active ? "#111111" : "rgba(255, 255, 255, 0.70)",
        fontSize: 13,
        fontWeight: 500,
        transition: "all 0.15s",
        boxShadow: active ? "0 2px 6px rgba(0, 0, 0, 0.15)" : undefined,
      }}
    >
      <Icon size={14} />
      {label}
      {count !== undefined && (
        <span
          style={{
            fontSize: 10,
            background: active
              ? "rgba(17, 17, 17, 0.12)"
              : "rgba(255, 255, 255, 0.12)",
            color: active ? "#111111" : "rgba(255, 255, 255, 0.70)",
            padding: "1px 6px",
            borderRadius: 10,
            marginLeft: 2,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function AutoReplyPage() {
  const { status: sessionStatus } = useSession();
  // QuikIT: active brand lives in UserPreference (DB), exposed via
  // /api/user/active-brand. The session does NOT carry activeBrandId
  // any more — useActiveBrandId() is the replacement.
  const activeBrandId = useActiveBrandId();

  const [tab, setTab] = useState<Tab>("rules");
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const rulesHook = useAutoReplyRules(activeBrandId);
  const logsHook = useAutoReplyLogs(activeBrandId, "all");
  const postsHook = useAutoReplyPosts(activeBrandId);

  const rules = rulesHook.data ?? [];
  const activeRuleCount = rules.filter((r) => r.isActive).length;
  const totalLogs = logsHook.data?.total ?? 0;
  const pausedPostCount =
    postsHook.data?.filter((p) => !p.autoReplyEnabled).length ?? 0;

  if (sessionStatus === "loading") {
    return (
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          color: "rgba(255, 255, 255, 0.65)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!activeBrandId) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 500,
            marginBottom: 16,
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MessageSquareReply size={22} color="#22C55E" />
          Auto-reply
        </h2>
        <div
          style={{
            background: "rgba(33, 33, 33, 0.12)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: 24,
            padding: 40,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.25)",
            textAlign: "center",
            color: "rgba(255, 255, 255, 0.65)",
          }}
        >
          Pick a brand from the sidebar to manage its auto-replies.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            fontSize: 24,
            fontWeight: 500,
            margin: 0,
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MessageSquareReply size={22} color="#22C55E" />
          Auto-reply
        </h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "rgba(255, 255, 255, 0.65)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                activeRuleCount > 0 ? "#22C55E" : "rgba(255, 255, 255, 0.30)",
              boxShadow:
                activeRuleCount > 0
                  ? "0 0 8px rgba(34, 197, 94, 0.55)"
                  : undefined,
            }}
          />
          {activeRuleCount} {activeRuleCount === 1 ? "rule active" : "rules active"}
        </div>
      </div>

      {successBanner && (
        <SuccessBanner
          message={successBanner}
          onDismiss={() => setSuccessBanner(null)}
        />
      )}

      {wizardOpen ? (
        <RuleWizard
          brandId={activeBrandId}
          editing={editingRule}
          onCancel={() => {
            setWizardOpen(false);
            setEditingRule(null);
          }}
          onSuccess={(savedRule, isEdit) => {
            setWizardOpen(false);
            setEditingRule(null);
            setSuccessBanner(
              isEdit
                ? `Rule "${savedRule.name}" updated.`
                : `Rule "${savedRule.name}" activated. Auto-replies will start within 60 seconds.`,
            );
            rulesHook.refetch();
          }}
        />
      ) : (
        <>
          {/* Tabs — pill container matches the Social/Email pattern from
              design-tokens.md §2 */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 40,
              padding: 4,
              gap: 4,
              borderRadius: 9999,
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.22)",
              marginBottom: 20,
            }}
          >
            <NavTab
              active={tab === "rules"}
              onClick={() => setTab("rules")}
              Icon={List}
              label="Rules"
              count={rules.length}
            />
            <NavTab
              active={tab === "activity"}
              onClick={() => setTab("activity")}
              Icon={Activity}
              label="Activity"
              count={totalLogs}
            />
            <NavTab
              active={tab === "posts"}
              onClick={() => setTab("posts")}
              Icon={ImageIcon}
              label="Post controls"
              count={pausedPostCount > 0 ? pausedPostCount : undefined}
            />
          </div>

          {tab === "rules" && (
            <RulesView
              brandId={activeBrandId}
              rulesHook={rulesHook}
              onCreateRule={() => {
                setEditingRule(null);
                setWizardOpen(true);
              }}
              onEditRule={(rule) => {
                setEditingRule(rule);
                setWizardOpen(true);
              }}
            />
          )}
          {tab === "activity" && (
            <ActivityView brandId={activeBrandId} />
          )}
          {tab === "posts" && (
            <PostControlsView postsHook={postsHook} />
          )}
        </>
      )}
    </div>
  );
}

function SuccessBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(34, 197, 94, 0.12)",
        border: "1px solid rgba(34, 197, 94, 0.32)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "#FFFFFF",
        marginBottom: 14,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          color: "rgba(255, 255, 255, 0.70)",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
