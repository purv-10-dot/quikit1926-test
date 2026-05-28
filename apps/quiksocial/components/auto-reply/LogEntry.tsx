"use client";

import { Bot, AlertTriangle, Info } from "lucide-react";

import { Badge } from "./primitives/Badge";
import type { LogRow } from "@/lib/auto-reply/client-types";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function LogEntry({ log }: { log: LogRow }) {
  const author = log.commentAuthor ?? "unknown";
  const initial = author.charAt(0).toUpperCase() || "?";
  const isSent = log.status === "SENT";
  const isFailed = log.status === "FAILED";
  const isSkipped = log.status === "SKIPPED";

  return (
    <div
      // Primary glass card for the whole entry
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        overflow: "hidden",
      }}
    >
      {/* Top — original comment */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 16px",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(59, 130, 246, 0.22)",
            color: "#93C5FD",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {initial}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
              @{author}
            </span>
            {log.postTitle && (
              <>
                <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.40)" }}>
                  on
                </span>
                <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.65)" }}>
                  &quot;{log.postTitle}&quot;
                </span>
              </>
            )}
            {log.platform && (
              <Badge
                variant={
                  log.platform === "instagram"
                    ? "instagram"
                    : log.platform === "facebook"
                      ? "facebook"
                      : "default"
                }
              >
                {log.platform}
              </Badge>
            )}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#FFFFFF" }}>
            {log.commentText || "(no text / emoji only)"}
          </div>
        </div>

        <span
          style={{
            fontSize: 11,
            color: "rgba(255, 255, 255, 0.40)",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {relativeTime(log.sentAt)}
        </span>
      </div>

      {!isSkipped ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "12px 16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: isSent
              ? "rgba(34, 197, 94, 0.08)"
              : "rgba(239, 68, 68, 0.08)",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 2,
              borderRadius: 1,
              background: isSent ? "#22C55E" : "#EF4444",
              flexShrink: 0,
            }}
          />
          <div
            aria-hidden
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: isSent
                ? "rgba(34, 197, 94, 0.20)"
                : "rgba(239, 68, 68, 0.20)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isSent ? (
              <Bot size={15} color="#4ADE80" />
            ) : (
              <AlertTriangle size={15} color="#F87171" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: "#FFFFFF" }}>
                Auto-reply
              </span>
              {log.ruleName && (
                <span
                  style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.65)" }}
                >
                  via &quot;{log.ruleName}&quot;
                </span>
              )}
              <Badge variant={log.replyMode === "AI" ? "ai" : "template"}>
                {log.replyMode === "AI" ? "AI" : "Template"}
              </Badge>
              <Badge variant={isFailed ? "failed" : "sent"}>{log.status}</Badge>
            </div>
            {log.replyText && (
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255, 255, 255, 0.92)",
                  lineHeight: 1.5,
                }}
              >
                {log.replyText}
              </div>
            )}
            {log.failureReason && (
              <div
                style={{ fontSize: 12, color: "#F87171", marginTop: 2 }}
              >
                {log.failureReason}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(245, 158, 11, 0.08)",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 2,
              borderRadius: 1,
              background: "#F59E0B",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontSize: 12,
              color: "#FCD34D",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Info size={13} />
            Skipped{log.failureReason ? ` — ${log.failureReason}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
