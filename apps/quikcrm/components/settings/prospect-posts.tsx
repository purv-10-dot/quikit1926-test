"use client";

import { useState } from "react";
import { Heart, ImageOff, MessageCircle } from "lucide-react";
import { RelativeTime } from "@/components/shared/relative-time";
import type { LinkedInPost } from "@/lib/services/prospects/linkedin-posts";

/**
 * LinkedIn posts list for a prospect.
 *
 * Renders the recent activity captured by the Chrome extension and stored in
 * `CrmProspect.posts`. Presentational only — the caller passes an already
 * normalized list (see lib/services/prospects/linkedin-posts.ts); this component
 * never touches the raw JSON blob.
 *
 * Used inside the prospects table's "LinkedIn posts" drawer.
 */

/** Long bodies are clamped; anything past this gets a Show more/less toggle. */
const CLAMP_CHARS = 320;

function PostBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > CLAMP_CHARS;
  const shown = !isLong || expanded ? text : `${text.slice(0, CLAMP_CHARS).trimEnd()}…`;

  return (
    <div>
      {/* Scraped text keeps its original line breaks. */}
      <p className="whitespace-pre-wrap break-words text-sm text-crm-text">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-crm-blue hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function PostImage({ src, alt }: { src: string; alt: string | null }) {
  const [failed, setFailed] = useState(false);

  // LinkedIn CDN URLs are time-signed and expire, so a broken image is expected
  // over time rather than exceptional — degrade to a caption instead of an
  // empty box. Plain <img>: these are arbitrary remote hosts and next/image
  // has no remotePatterns configured for them in next.config.js.
  if (failed) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-crm-border bg-crm-panel/40 px-3 py-2 text-xs text-crm-muted">
        <ImageOff size={14} aria-hidden />
        <span>Image no longer available</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || "LinkedIn post image"}
      loading="lazy"
      onError={() => setFailed(true)}
      className="mt-2 max-h-72 w-full rounded-lg border border-crm-border object-cover"
    />
  );
}

export function ProspectPosts({ posts }: { posts: LinkedInPost[] }) {
  if (posts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-crm-muted">
        No LinkedIn posts were captured for this prospect. Re-save the profile from the
        extension while their recent activity is visible to collect them.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {posts.map((post, index) => (
        <li
          // Scraped posts carry no stable id; date+index is unique within a render
          // and the list is never reordered client-side.
          key={`${post.date ?? "undated"}-${index}`}
          className="rounded-lg border border-crm-border bg-white p-3 sm:p-4"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-crm-muted">
            {post.type && (
              <span className="inline-flex items-center rounded-full bg-crm-panel px-2 py-0.5 font-medium capitalize text-crm-text">
                {post.type}
              </span>
            )}
            {/* Prefer the real timestamp; fall back to the scraped "2w" label. */}
            {post.date ? (
              <RelativeTime iso={post.date} />
            ) : post.relativeTime ? (
              <span>{post.relativeTime}</span>
            ) : null}
          </div>

          <PostBody text={post.text} />

          {post.imageUrl && <PostImage src={post.imageUrl} alt={post.imageAlt} />}

          <div className="mt-3 flex items-center gap-4 border-t border-crm-border pt-2 text-xs text-crm-muted">
            <span className="inline-flex items-center gap-1">
              <Heart size={13} aria-hidden />
              {post.reactions.toLocaleString()}
              <span className="sr-only"> reactions</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={13} aria-hidden />
              {post.comments.toLocaleString()}
              <span className="sr-only"> comments</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
