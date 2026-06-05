"use client";

import { Image as ImageIcon } from "lucide-react";

import { useAutoReplyPosts } from "@/lib/auto-reply/use-auto-reply-posts";
import { PostControlRow } from "./PostControlRow";
import { Skeleton } from "./primitives/Skeleton";
import { ErrorBanner } from "./primitives/ErrorBanner";

type PostsHook = ReturnType<typeof useAutoReplyPosts>;

export function PostControlsView({ postsHook }: { postsHook: PostsHook }) {
  const { data, loading, error, refetch, setEnabled } = postsHook;

  if (loading) {
    // Skeleton respects the new 2-column grid layout.
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="post" count={1} />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refetch} />;
  }

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255, 255, 255, 0.65)",
          marginBottom: 14,
          lineHeight: 1.55,
        }}
      >
        Control which published posts receive auto-replies. When a post is
        toggled <strong style={{ color: "#FFFFFF" }}>off</strong>, no rules
        will fire on that post&apos;s comments — including AI rules. Use this
        to pause sensitive posts without disabling your rules globally.
      </div>

      {!data || data.length === 0 ? (
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
            <ImageIcon size={24} color="rgba(255, 255, 255, 0.65)" />
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
            No published posts yet
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255, 255, 255, 0.65)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            When you publish posts, you can control auto-reply per-post here.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {data.map((post) => (
            <PostControlRow
              key={post.id}
              post={post}
              onToggle={() => setEnabled(post.id, !post.autoReplyEnabled)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
