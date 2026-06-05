"use client";

import { Pencil, Trash2, Send, CheckCircle, User } from "lucide-react";

import { Badge } from "./primitives/Badge";
import { Toggle } from "./primitives/Toggle";
import type { RuleRow } from "@/lib/auto-reply/client-types";

function platformLabel(platform?: string): string {
  if (platform === "instagram") return "Instagram";
  if (platform === "facebook") return "Facebook";
  return platform ?? "Social";
}

export function RuleCard({
  rule,
  accountLabel,
  accountPlatform,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RuleRow;
  accountLabel: string | null;
  accountPlatform: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isKeyword = rule.triggerType === "KEYWORD_MATCH";
  const isAi = rule.replyMode === "AI";
  const platform = platformLabel(accountPlatform ?? undefined);

  return (
    <div
      // Glass card per design-tokens.md §1 (primary glass surface).
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        padding: "14px 18px",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        opacity: rule.isActive ? 1 : 0.55,
        transition: "opacity 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#FFFFFF",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {rule.name}
            </span>
            <Badge variant={isAi ? "ai" : "template"}>
              {isAi ? "AI" : "Template"}
            </Badge>
            <Badge variant={isKeyword ? "keyword" : "any"}>
              {isKeyword ? "Keywords" : "Any comment"}
            </Badge>
            <Badge
              variant={
                accountPlatform === "instagram"
                  ? "instagram"
                  : accountPlatform === "facebook"
                    ? "facebook"
                    : "default"
              }
            >
              {platform}
            </Badge>
          </div>

          {isKeyword && rule.keywords.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              {rule.keywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    fontSize: 11,
                    padding: "1px 8px",
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.08)",
                    color: "rgba(255, 255, 255, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.10)",
                  }}
                >
                  &quot;{kw}&quot;
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.65)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Send size={13} />
              Activity in feed
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <CheckCircle size={13} />
              {rule.cooldownMinutes > 0
                ? `${rule.cooldownMinutes}m cooldown`
                : "No cooldown"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <User size={13} />
              {accountLabel ?? "Unknown account"}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginLeft: 16,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${rule.name}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255, 255, 255, 0.65)",
              padding: 4,
              display: "inline-flex",
            }}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${rule.name}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255, 255, 255, 0.65)",
              padding: 4,
              display: "inline-flex",
            }}
          >
            <Trash2 size={18} />
          </button>
          <Toggle
            checked={rule.isActive}
            onChange={onToggle}
            ariaLabel={`${rule.isActive ? "Deactivate" : "Activate"} ${rule.name}`}
          />
        </div>
      </div>
    </div>
  );
}
