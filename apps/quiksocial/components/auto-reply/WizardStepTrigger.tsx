"use client";

import { useRef } from "react";
import { Hash, MessageSquare } from "lucide-react";
import type { TriggerType, KeywordMatch } from "@/lib/auto-reply/client-types";

type Props = {
  triggerType: TriggerType;
  keywords: string[];
  keywordMatch: KeywordMatch;
  caseSensitive: boolean;
  onChangeTrigger: (t: TriggerType) => void;
  onChangeKeywords: (ks: string[]) => void;
  onChangeKeywordMatch: (m: KeywordMatch) => void;
  onChangeCaseSensitive: (v: boolean) => void;
};

export function WizardStepTrigger({
  triggerType,
  keywords,
  keywordMatch,
  caseSensitive,
  onChangeTrigger,
  onChangeKeywords,
  onChangeKeywordMatch,
  onChangeCaseSensitive,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addKeyword = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (keywords.includes(value)) return;
    onChangeKeywords([...keywords, value]);
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
        When should this rule trigger?
      </label>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {(
          [
            {
              val: "KEYWORD_MATCH" as const,
              Icon: Hash,
              label: "Keyword match",
              desc: "Reply when comment contains specific words",
            },
            {
              val: "ANY_COMMENT" as const,
              Icon: MessageSquare,
              label: "Any comment",
              desc: "Reply to every new comment",
            },
          ]
        ).map((opt) => {
          const selected = triggerType === opt.val;
          return (
            <button
              key={opt.val}
              type="button"
              onClick={() => onChangeTrigger(opt.val)}
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

      {triggerType === "KEYWORD_MATCH" && (
        <>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: "block",
              marginBottom: 6,
              color: "#FFFFFF",
            }}
          >
            Keywords
          </label>
          <div
            // Glass input chip container — same fill as qs-input
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.15)",
              background: "rgba(255, 255, 255, 0.08)",
              marginBottom: 12,
              minHeight: 40,
              alignItems: "center",
              cursor: "text",
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {keywords.map((kw, i) => (
              <span
                key={`${kw}-${i}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  background: "rgba(255, 255, 255, 0.14)",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  color: "#FFFFFF",
                }}
              >
                {kw}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeKeywords(keywords.filter((_, j) => j !== i));
                  }}
                  aria-label={`Remove ${kw}`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "rgba(255, 255, 255, 0.55)",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              placeholder={
                keywords.length === 0 ? "Type a keyword and press Enter" : ""
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
                if (e.key === "Backspace") {
                  const target = e.target as HTMLInputElement;
                  if (target.value === "" && keywords.length > 0) {
                    onChangeKeywords(keywords.slice(0, -1));
                  }
                }
              }}
              style={{
                border: "none",
                outline: "none",
                fontSize: 12,
                flex: 1,
                minWidth: 120,
                background: "transparent",
                padding: "4px 0",
                color: "#FFFFFF",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 12 }}>
              {(["ANY", "ALL"] as const).map((m) => (
                <label
                  key={m}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    color: "rgba(255, 255, 255, 0.85)",
                  }}
                >
                  <input
                    type="radio"
                    name="kwm"
                    checked={keywordMatch === m}
                    onChange={() => onChangeKeywordMatch(m)}
                    style={{ accentColor: "#22C55E" }}
                  />
                  Match {m.toLowerCase()} keywords
                </label>
              ))}
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                cursor: "pointer",
                color: "rgba(255, 255, 255, 0.85)",
              }}
            >
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => onChangeCaseSensitive(e.target.checked)}
                style={{ accentColor: "#22C55E" }}
              />
              Case sensitive
            </label>
          </div>
        </>
      )}
    </div>
  );
}
