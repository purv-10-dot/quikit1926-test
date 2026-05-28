"use client";

import { useState } from "react";
import { Activity as ActivityIcon } from "lucide-react";

import {
  useAutoReplyLogs,
  type ActivityFilter,
} from "@/lib/auto-reply/use-auto-reply-logs";

import { LogEntry } from "./LogEntry";
import { Skeleton } from "./primitives/Skeleton";
import { ErrorBanner } from "./primitives/ErrorBanner";

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 9999,
        border: active ? "none" : "1px solid rgba(255, 255, 255, 0.18)",
        background: active ? "#FFFFFF" : "rgba(255, 255, 255, 0.08)",
        color: active ? "#111111" : "rgba(255, 255, 255, 0.85)",
        fontSize: 12,
        cursor: "pointer",
        fontWeight: 500,
        transition: "all 0.15s",
        boxShadow: active ? "0 2px 6px rgba(0, 0, 0, 0.15)" : undefined,
      }}
    >
      {label} ({count})
    </button>
  );
}

export function ActivityView({ brandId }: { brandId: string }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const { data, loading, error, refetch, loadMore, loadingMore } =
    useAutoReplyLogs(brandId, filter);

  if (loading) {
    return (
      <div>
        <div
          className="animate-pulse"
          style={{
            width: 280,
            height: 30,
            borderRadius: 9999,
            background: "rgba(255, 255, 255, 0.08)",
            marginBottom: 16,
          }}
        />
        <Skeleton variant="log" count={4} />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refetch} />;
  }

  const all = data?.logs ?? [];
  const counts = {
    all: data?.total ?? 0,
    sent: all.filter((l) => l.status === "SENT").length,
    failed: all.filter((l) => l.status === "FAILED").length,
    skipped: all.filter((l) => l.status === "SKIPPED").length,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterPill
          active={filter === "all"}
          label="All"
          count={counts.all}
          onClick={() => setFilter("all")}
        />
        <FilterPill
          active={filter === "sent"}
          label="Sent"
          count={counts.sent}
          onClick={() => setFilter("sent")}
        />
        <FilterPill
          active={filter === "failed"}
          label="Failed"
          count={counts.failed}
          onClick={() => setFilter("failed")}
        />
        <FilterPill
          active={filter === "skipped"}
          label="Skipped"
          count={counts.skipped}
          onClick={() => setFilter("skipped")}
        />
      </div>

      {all.length === 0 ? (
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
          }}
        >
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <ActivityIcon size={24} color="rgba(255, 255, 255, 0.65)" />
          </div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              margin: 0,
              marginBottom: 6,
              color: "#FFFFFF",
            }}
          >
            No auto-reply activity yet
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255, 255, 255, 0.65)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            Create a rule and auto-replies will appear here as comments come in.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {all.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>

          {data?.hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{
                  padding: "8px 20px",
                  borderRadius: 10,
                  border: "1px solid rgba(255, 255, 255, 0.10)",
                  background: "rgba(255, 255, 255, 0.10)",
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: loadingMore ? "wait" : "pointer",
                  opacity: loadingMore ? 0.6 : 1,
                  transition: "background 0.15s",
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
