"use client";

import { ShieldOff, Image as ImageIcon } from "lucide-react";

import { Toggle } from "./primitives/Toggle";
import type { PostWithControlRow } from "@/lib/auto-reply/client-types";

function postLabel(post: PostWithControlRow): string {
  if (post.title && post.title.trim()) return post.title;
  const c = post.content?.trim() ?? "";
  return c.length > 80 ? `${c.slice(0, 80)}…` : c || "Untitled post";
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Card layout for the Post Controls grid — image at top (square 1:1
 * aspect so it stays prominent at any column width), caption + meta
 * row + toggle row stacked below.
 */
export function PostControlRow({
  post,
  onToggle,
}: {
  post: PostWithControlRow;
  onToggle: () => void;
}) {
  const thumbSrc = post.aiImageUrl ?? post.imageUrls[0] ?? null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 14,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        opacity: post.autoReplyEnabled ? 1 : 0.55,
        transition: "opacity 0.2s",
        overflow: "hidden",
      }}
    >
      {/* Thumbnail — square aspect so it stays visually identifiable */}
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "rgba(255, 255, 255, 0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <ImageIcon size={36} color="rgba(255, 255, 255, 0.30)" />
        )}
      </div>

      {/* Content */}
      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#FFFFFF",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: "calc(1.35em * 2)",
          }}
        >
          {postLabel(post)}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.45)",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>{dateLabel(post.publishedAt)}</span>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span style={{ textTransform: "capitalize" }}>{post.platform}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {!post.autoReplyEnabled && (
              <span
                style={{
                  fontSize: 11,
                  color: "#FCA5A5",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <ShieldOff size={11} />
                Paused
              </span>
            )}
            <Toggle
              checked={post.autoReplyEnabled}
              onChange={onToggle}
              size="sm"
              ariaLabel={`${post.autoReplyEnabled ? "Pause" : "Enable"} auto-reply on this post`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
