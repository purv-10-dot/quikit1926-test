"use client";

import { FileText, Sparkles, Info } from "lucide-react";

import { Tooltip } from "./primitives/Tooltip";
import type { ReplyMode } from "@/lib/auto-reply/client-types";

type Props = {
  replyMode: ReplyMode;
  templateBody: string;
  toneGuidance: string;
  cooldownMinutes: number;
  maxRepliesPerDay: number;
  onChangeReplyMode: (m: ReplyMode) => void;
  onChangeTemplateBody: (s: string) => void;
  onChangeToneGuidance: (s: string) => void;
  onChangeCooldown: (n: number) => void;
  onChangeMaxPerDay: (n: number) => void;
};

// Shared glass-input style for textareas and number inputs.
const glassInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255, 255, 255, 0.15)",
  background: "rgba(255, 255, 255, 0.08)",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
  color: "#FFFFFF",
};

export function WizardStepResponse({
  replyMode,
  templateBody,
  toneGuidance,
  cooldownMinutes,
  maxRepliesPerDay,
  onChangeReplyMode,
  onChangeTemplateBody,
  onChangeToneGuidance,
  onChangeCooldown,
  onChangeMaxPerDay,
}: Props) {
  const insertPlaceholder = (token: string) => {
    onChangeTemplateBody(`${templateBody}${token}`);
  };

  return (
    <div>
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          display: "block",
          marginBottom: 12,
          color: "#FFFFFF",
        }}
      >
        How should we reply?
      </label>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {(
          [
            {
              val: "TEMPLATE" as const,
              Icon: FileText,
              label: "Template",
              desc: "Fixed reply with placeholders",
            },
            {
              val: "AI" as const,
              Icon: Sparkles,
              label: "AI-powered",
              desc: "Smart replies using product context",
            },
          ]
        ).map((opt) => {
          const selected = replyMode === opt.val;
          return (
            <button
              key={opt.val}
              type="button"
              onClick={() => onChangeReplyMode(opt.val)}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 12,
                border: selected
                  ? "1px solid rgba(255, 255, 255, 0.35)"
                  : "1px solid rgba(255, 255, 255, 0.10)",
                background: selected
                  ? "rgba(255, 255, 255, 0.16)"
                  : "rgba(255, 255, 255, 0.06)",
                cursor: "pointer",
                textAlign: "center",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <opt.Icon
                size={24}
                color={selected ? "#FFFFFF" : "rgba(255, 255, 255, 0.55)"}
                style={{ display: "block", margin: "0 auto 6px" }}
              />
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 2,
                  color: "#FFFFFF",
                }}
              >
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.55)" }}>
                {opt.desc}
              </div>
            </button>
          );
        })}
      </div>

      {replyMode === "TEMPLATE" ? (
        <div>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: "block",
              marginBottom: 6,
              color: "#FFFFFF",
            }}
          >
            Reply template
          </label>
          <textarea
            value={templateBody}
            onChange={(e) => onChangeTemplateBody(e.target.value)}
            rows={3}
            placeholder="Thanks for reaching out {username}! How can we help?"
            style={{ ...glassInputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {["{username}", "{comment}"].map((tok) => (
              <button
                key={tok}
                type="button"
                onClick={() => insertPlaceholder(tok)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(255, 255, 255, 0.08)",
                  cursor: "pointer",
                  color: "#FFFFFF",
                }}
              >
                {tok}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: "block",
              marginBottom: 6,
              color: "#FFFFFF",
            }}
          >
            Tone guidance for AI
          </label>
          <textarea
            value={toneGuidance}
            onChange={(e) => onChangeToneGuidance(e.target.value)}
            placeholder="e.g., Friendly and helpful. Always mention the product name and direct to the link in bio."
            rows={3}
            style={{ ...glassInputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(34, 197, 94, 0.10)",
              border: "1px solid rgba(34, 197, 94, 0.32)",
              fontSize: 12,
              color: "#FFFFFF",
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
              lineHeight: 1.5,
            }}
          >
            <Sparkles size={14} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              AI will use your product descriptions, brand voice, and this
              guidance to craft unique replies per comment.
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.65)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 4,
            }}
          >
            Cooldown (minutes)
            <Tooltip text="If the same person comments multiple times, wait this long before replying again. Prevents your brand from looking spammy. Set to 0 to reply every time.">
              <Info size={14} color="rgba(255, 255, 255, 0.40)" style={{ cursor: "help" }} />
            </Tooltip>
          </label>
          <input
            type="number"
            min={0}
            value={cooldownMinutes}
            onChange={(e) => onChangeCooldown(parseInt(e.target.value, 10) || 0)}
            style={{ ...glassInputStyle, padding: "8px 10px" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.65)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 4,
            }}
          >
            Max replies/day
            <Tooltip text="Maximum number of replies this rule can send per day across all posts. Protects against unexpected comment floods. Set to 0 for unlimited.">
              <Info size={14} color="rgba(255, 255, 255, 0.40)" style={{ cursor: "help" }} />
            </Tooltip>
          </label>
          <input
            type="number"
            min={0}
            value={maxRepliesPerDay}
            onChange={(e) => onChangeMaxPerDay(parseInt(e.target.value, 10) || 0)}
            style={{ ...glassInputStyle, padding: "8px 10px" }}
          />
        </div>
      </div>
    </div>
  );
}
