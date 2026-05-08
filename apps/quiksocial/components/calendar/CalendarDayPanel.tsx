"use client";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { X, Plus, Clock, CheckCircle, RotateCcw, Eye } from "lucide-react";
import type { Holiday } from "@/lib/constants/holidays";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarPost {
  _id: string;
  content: string;
  aiImageUrl: string | null;
  imageUrls: string[];
  platform: string;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
}

interface Props {
  day: Date | null;
  posts: CalendarPost[];
  holiday: Holiday | null;
  onClose: () => void;
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_LABEL: Record<string, string> = {
  draft:     "Draft",
  review:    "In Review",
  approved:  "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed:    "Failed",
  overdue:   "Overdue",
};

const STATUS_COLOR: Record<string, string> = {
  draft:     "#6B7280",
  review:    "#F59E0B",
  approved:  "#8B5CF6",
  scheduled: "#3B82F6",
  published: "#22C55E",
  failed:    "#EF4444",
  overdue:   "#F97316",
};

const PLATFORM_ICON: Record<string, string> = {
  instagram: "📸",
  facebook:  "💬",
  linkedin:  "💼",
  twitter:   "🐦",
  x:         "𝕏",
  youtube:   "▶️",
  tiktok:    "🎵",
};

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getThumbnail(post: CalendarPost): string | null {
  return post.aiImageUrl || post.imageUrls?.[0] || null;
}

function groupPosts(posts: CalendarPost[]) {
  const needsAttention = posts.filter((p) => p.status === "overdue" || p.status === "review");
  const scheduled      = posts.filter((p) => p.status === "scheduled" || p.status === "approved");
  const published      = posts.filter((p) => p.status === "published");
  const drafts         = posts.filter((p) => p.status === "draft" || p.status === "failed");
  return { needsAttention, scheduled, published, drafts };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PostRow({
  post,
  onApprove,
}: {
  post: CalendarPost;
  onApprove: (id: string) => void;
}) {
  const thumb = getThumbnail(post);
  const icon  = PLATFORM_ICON[post.platform?.toLowerCase()] ?? "📄";
  const time  = formatTime(post.scheduledFor || post.publishedAt);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          flexShrink: 0,
          overflow: "hidden",
          background: "rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 18 }}>{icon}</span>
        )}
      </div>

      {/* Caption + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            color: "#ffffff",
            fontSize: 13,
            lineHeight: 1.4,
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {post.content || "No caption"}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 12 }}>{icon}</span>
          {time && (
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
              {time}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: STATUS_COLOR[post.status] ?? "#6B7280",
              background: `${STATUS_COLOR[post.status] ?? "#6B7280"}22`,
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            {STATUS_LABEL[post.status] ?? post.status}
          </span>
        </div>
      </div>

      {/* Action button */}
      <ActionButton post={post} onApprove={onApprove} />
    </div>
  );
}

function ActionButton({
  post,
  onApprove,
}: {
  post: CalendarPost;
  onApprove: (id: string) => void;
}) {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  };

  if (post.status === "review") {
    return (
      <button
        type="button"
        style={{ ...base, background: "rgba(245,158,11,0.20)", color: "#F59E0B" }}
        onClick={() => onApprove(post._id)}
      >
        Approve
      </button>
    );
  }
  if (post.status === "overdue") {
    return (
      <Link
        href={`/dashboard/posts/${post._id}?reschedule=true`}
        style={{ ...base, background: "rgba(239,68,68,0.18)", color: "#EF4444", textDecoration: "none" }}
      >
        Reschedule
      </Link>
    );
  }
  return (
    <Link
      href={`/dashboard/posts/${post._id}`}
      style={{ ...base, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)", textDecoration: "none" }}
    >
      View
    </Link>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  if (count === 0) return null;
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.35)",
        margin: "14px 0 2px",
      }}
    >
      {title} ({count})
    </p>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function CalendarDayPanel({
  day,
  posts,
  holiday,
  onClose,
  onRefresh,
}: Props) {
  const isOpen = day !== null;

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleApprove = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/approve`, { method: "POST" });
      if (res.ok) onRefresh();
    } catch {
      // ignore
    }
  };

  const { needsAttention, scheduled, published, drafts } = groupPosts(posts);

  const dateStr = day
    ? `${DAY_NAMES[day.getDay()]}, ${MONTH_NAMES[day.getMonth()]} ${day.getDate()}`
    : "";

  const isoDate = day
    ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
    : "";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 65,
          background: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.25s",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dateStr}
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 70,
          width: 380,
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          background: "rgba(33, 33, 33, 0.14)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            flexShrink: 0,
            padding: "18px 20px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 2 }}>
              {day ? `${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}` : ""}
            </p>
            <h2 style={{ color: "#ffffff", fontWeight: 600, fontSize: 18, margin: 0 }}>
              {dateStr}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
          {/* Holiday banner */}
          {holiday && isoDate && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <p style={{ color: "#ffffff", fontSize: 14, fontWeight: 500, margin: "0 0 10px" }}>
                🎉 {holiday.name} — Create post?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href={`/dashboard/posts/create?festival=${encodeURIComponent(holiday.name)}&country=${holiday.country}&date=${isoDate}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "7px 0",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.85)",
                    color: "#0a0a0a",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Single Post
                </Link>
                <Link
                  href={`/dashboard/campaigns/create?festival=${encodeURIComponent(holiday.name)}&country=${holiday.country}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "7px 0",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.20)",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Campaign
                </Link>
              </div>
            </div>
          )}

          {/* Create Post for this day */}
          {isoDate && (
            <Link
              href={`/dashboard/posts/create?date=${isoDate}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 14,
                padding: "9px 0",
                borderRadius: 10,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.80)",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              <Plus size={14} />
              Create Post for this day
            </Link>
          )}

          {/* Empty state */}
          {posts.length === 0 && (
            <div
              style={{
                marginTop: 32,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              <Clock size={32} strokeWidth={1.2} />
              <p style={{ fontSize: 14, textAlign: "center" }}>
                No posts scheduled.
                <br />
                Create one to get started.
              </p>
            </div>
          )}

          {/* Posts by section */}
          {needsAttention.length > 0 && (
            <>
              <SectionHeader title="Needs Attention" count={needsAttention.length} />
              {needsAttention.map((p) => (
                <PostRow key={p._id} post={p} onApprove={handleApprove} />
              ))}
            </>
          )}

          {scheduled.length > 0 && (
            <>
              <SectionHeader title="Scheduled" count={scheduled.length} />
              {scheduled.map((p) => (
                <PostRow key={p._id} post={p} onApprove={handleApprove} />
              ))}
            </>
          )}

          {published.length > 0 && (
            <>
              <SectionHeader title="Published" count={published.length} />
              {published.map((p) => (
                <PostRow key={p._id} post={p} onApprove={handleApprove} />
              ))}
            </>
          )}

          {drafts.length > 0 && (
            <>
              <SectionHeader title="Drafts" count={drafts.length} />
              {drafts.map((p) => (
                <PostRow key={p._id} post={p} onApprove={handleApprove} />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
