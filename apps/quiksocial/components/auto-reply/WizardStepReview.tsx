"use client";

import { Eye, Bot } from "lucide-react";

import { Badge } from "./primitives/Badge";
import type {
  ReplyMode,
  TriggerType,
  KeywordMatch,
  SocialAccountRow,
} from "@/lib/auto-reply/client-types";

const SAMPLE_COMMENTS = [
  { author: "priya_sharma", text: "love this product so much!" },
  { author: "skincare_fan", text: "This is amazing quality 😍" },
  { author: "rahul.m", text: "Where can I buy this?" },
];

const SAMPLE_AI_REPLY =
  "Hi {author}! Thanks for your interest. Our products are crafted with " +
  "premium ingredients and are available on our website — check the link " +
  "in our bio for easy ordering!";

function applyTemplate(template: string, author: string, comment: string): string {
  return template
    .replace(/@?\{username\}/gi, author)
    .replace(/\{comment\}/gi, comment);
}

function commentMatches(
  triggerType: TriggerType,
  keywords: string[],
  keywordMatch: KeywordMatch,
  caseSensitive: boolean,
  text: string,
): boolean {
  if (triggerType === "ANY_COMMENT") return true;
  if (keywords.length === 0) return false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needles = caseSensitive ? keywords : keywords.map((k) => k.toLowerCase());
  return keywordMatch === "ALL"
    ? needles.every((n) => haystack.includes(n))
    : needles.some((n) => haystack.includes(n));
}

type Props = {
  account: SocialAccountRow | null;
  triggerType: TriggerType;
  keywords: string[];
  keywordMatch: KeywordMatch;
  caseSensitive: boolean;
  replyMode: ReplyMode;
  templateBody: string;
  cooldownMinutes: number;
  maxRepliesPerDay: number;
};

export function WizardStepReview({
  account,
  triggerType,
  keywords,
  keywordMatch,
  caseSensitive,
  replyMode,
  templateBody,
  cooldownMinutes,
  maxRepliesPerDay,
}: Props) {
  const triggerSummary =
    triggerType === "KEYWORD_MATCH"
      ? `Keywords: ${keywords.join(", ") || "(none)"}`
      : "Any comment";

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 12,
          color: "#FFFFFF",
        }}
      >
        Review &amp; live preview
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 16,
          fontSize: 12,
        }}
      >
        <ReviewTile label="Account" value={account?.accountName ?? "Not selected"} />
        <ReviewTile label="Trigger" value={triggerSummary} />
        <ReviewTile
          label="Reply mode"
          value={replyMode === "TEMPLATE" ? "Template" : "AI-powered"}
        />
        <ReviewTile
          label="Limits"
          value={`${cooldownMinutes}min cooldown · ${maxRepliesPerDay || "∞"}/day`}
        />
      </div>

      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Eye size={14} />
        Live preview — how your rule handles real comments
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SAMPLE_COMMENTS.map((c, i) => {
          const matches = commentMatches(
            triggerType,
            keywords,
            keywordMatch,
            caseSensitive,
            c.text,
          );
          const reply =
            replyMode === "TEMPLATE"
              ? applyTemplate(templateBody, c.author, c.text)
              : SAMPLE_AI_REPLY.replace("{author}", c.author);

          return (
            <div
              key={i}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.10)",
                overflow: "hidden",
                background: "rgba(255, 255, 255, 0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.04)",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(59, 130, 246, 0.22)",
                    color: "#93C5FD",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {c.author.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#FFFFFF",
                    }}
                  >
                    @{c.author}
                  </span>
                  <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.92)" }}>
                    {c.text}
                  </div>
                </div>
                <Badge variant={matches ? "sent" : "skipped"}>
                  {matches ? "Match" : "No match"}
                </Badge>
              </div>

              {matches && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    background: "rgba(34, 197, 94, 0.08)",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "rgba(34, 197, 94, 0.20)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={14} color="#4ADE80" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255, 255, 255, 0.65)",
                        marginBottom: 2,
                      }}
                    >
                      Your reply (
                      {replyMode === "TEMPLATE" ? "template" : "AI-generated"})
                    </div>
                    <div style={{ fontSize: 13, color: "#FFFFFF", lineHeight: 1.5 }}>
                      {reply}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div style={{ color: "rgba(255, 255, 255, 0.55)", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontWeight: 500,
          color: "#FFFFFF",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}
