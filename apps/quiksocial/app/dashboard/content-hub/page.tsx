"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  X,
  Calendar,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Send,
  Eye,
  ChevronDown,
  Trash2,
  RotateCcw,
  MoreVertical,
  Pencil,
  Heart,
  MessageCircle,
  Share2,
  BarChart3,
  RefreshCw,
  Zap,
} from "lucide-react";
import ScheduleModal from "@/components/posts/ScheduleModal";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "failed"
  | "overdue";

interface Post {
  _id: string;
  content: string;
  platform: string;
  status: PostStatus;
  imageUrls?: string[];
  aiImageUrl?: string;
  scheduledFor?: string;
  // Member-suggested publish time submitted alongside Send for Review.
  // Distinct from scheduledFor (admin-confirmed). Surfaced as "Requested: …"
  // on review cards for both admin (so they can honour the suggestion) and
  // member (so they can confirm what they sent).
  requestedPublishTime?: string;
  publishedAt?: string;
  createdAt: string;
  userId: string;
  rejectionNote?: string;
  // Optional fields surfaced in the redesigned PostDetailModal —
  // populated for AI-generated posts, may be missing for older rows.
  title?: string | null;
  prompt?: string | null;
  newPostCreateMeta?: string | null;
  storeidead?: string | null;
  brandId?: string | null;
  likes?: number;
  comments?: number;
  shares?: number;
  reactions?: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  PostStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    color: "#9CA3AF",
    bg: "rgba(107,114,128,0.18)",
    icon: <FileText size={11} />,
  },
  review: {
    label: "In Review",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.18)",
    icon: <Eye size={11} />,
  },
  approved: {
    label: "Approved",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.18)",
    icon: <CheckCircle2 size={11} />,
  },
  scheduled: {
    label: "Scheduled",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.18)",
    icon: <Clock size={11} />,
  },
  published: {
    label: "Published",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.18)",
    icon: <CheckCircle2 size={11} />,
  },
  failed: {
    label: "Failed",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.18)",
    icon: <XCircle size={11} />,
  },
  overdue: {
    label: "Overdue",
    color: "#F97316",
    bg: "rgba(249,115,22,0.18)",
    icon: <AlertTriangle size={11} />,
  },
};

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "review", label: "In Review" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
  { key: "overdue", label: "Overdue" },
];

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  twitter: "#000000",
  x: "#1DA1F2",
  youtube: "#FF0000",
  google_business: "#4285F4",
  tiktok: "#010101",
};

const PLATFORM_INITIALS: Record<string, string> = {
  facebook: "Fb",
  instagram: "Ig",
  linkedin: "Li",
  twitter: "Tw",
  x: "X",
  youtube: "Yt",
  google_business: "Gb",
  tiktok: "Tk",
};

function PlatformBadge({ platform }: { platform: string }) {
  const key = platform?.toLowerCase() ?? "";
  const color = PLATFORM_COLORS[key] ?? "#6B7280";
  const initials = PLATFORM_INITIALS[key] ?? platform?.slice(0, 2) ?? "–";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: color,
        color: "#ffffff",
        fontSize: 8,
        fontWeight: 700,
        flexShrink: 0,
      }}
      title={platform}
    >
      {initials}
    </span>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 9999,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared button styles — derived from design-tokens.md
// ---------------------------------------------------------------------------

// Card-row buttons (32 px tall, 11 px text). Match the existing Reject /
// Approve pair on review posts so the new buttons sit in the same visual
// language. The new spec from this change applies to NEW button types
// (Schedule, Delete, Reschedule, Unschedule, Retry, Approve & Schedule);
// existing Reject + Approve keep their original outlined-red / white-fill
// look untouched per "Do not change… The existing Reject + Approve buttons".

const cardBtnPrimary: React.CSSProperties = {
  flex: 1,
  height: 32,
  borderRadius: 10,
  border: "none",
  background: "#ffffff",
  color: "#000000",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const cardBtnDestructive: React.CSSProperties = {
  flex: 1,
  height: 32,
  borderRadius: 10,
  border: "none",
  background: "rgba(239,68,68,0.20)",
  color: "rgba(248,113,113,1)",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const cardBtnSecondary: React.CSSProperties = {
  flex: 1,
  height: 32,
  borderRadius: 10,
  border: "none",
  background: "rgba(255,255,255,0.10)",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

// Modal-row buttons (40 px tall, 13 px text) — same colour tokens, scaled
// up to match the existing modal footer buttons (Reject + Approve).

const modalBtnPrimary: React.CSSProperties = {
  flex: 1,
  height: 40,
  borderRadius: 10,
  border: "none",
  background: "#ffffff",
  color: "#0a0a0a",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const modalBtnDestructive: React.CSSProperties = {
  flex: 1,
  height: 40,
  borderRadius: 10,
  border: "none",
  background: "rgba(239,68,68,0.20)",
  color: "rgba(248,113,113,1)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const modalBtnSecondary: React.CSSProperties = {
  flex: 1,
  height: 40,
  borderRadius: 10,
  border: "none",
  background: "rgba(255,255,255,0.10)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  postId,
  onCancel,
  onConfirmed,
}: {
  postId: string;
  onCancel: () => void;
  onConfirmed: (deletedId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = unwrap(await res.json().catch(() => ({})));
      if (!res.ok) {
        setError(data.error ?? "Failed to delete post");
        setLoading(false);
        return;
      }
      onConfirmed(postId);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: 420,
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          padding: 24,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0 }}>
            Delete Post
          </h3>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          Are you sure you want to delete this post? This cannot be undone.
        </p>

        {error && (
          <p style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "rgba(255,255,255,0.75)",
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: "none",
              background: "#EF4444",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------

function RejectModal({
  postId,
  onClose,
  onDone,
}: {
  postId: string;
  onClose: () => void;
  onDone: (updatedPost: Post) => void;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/posts/${postId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rejectionNote: note }),
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to reject post");
        return;
      }
      onDone(data.post);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 420,
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          padding: 24,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0 }}>
            Reject Post
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 14 }}>
          The post will return to Draft. The member will see your note.
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Rejection note (optional)…"
          rows={4}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            color: "#ffffff",
            fontSize: 13,
            padding: "10px 12px",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <p style={{ color: "#EF4444", fontSize: 12, marginTop: 8 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "rgba(255,255,255,0.75)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: "none",
              background: "#EF4444",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Rejecting…" : "Reject Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post Detail Modal
// ---------------------------------------------------------------------------

// Resolve the original creation prompt from any of the wizard-snapshot
// fields the Post schema accumulates. Newer rows store `prompt` directly;
// older rows fall through to `newPostCreateMeta` / `storeidead` JSON.
function _extractPromptText(post: Post): string {
  if (post.prompt && post.prompt.trim()) return post.prompt.trim();
  for (const raw of [post.newPostCreateMeta, post.storeidead]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidate =
        parsed?.prompt ||
        parsed?.userPrompt ||
        parsed?.scenePrompt ||
        parsed?.idea?.description;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    } catch {
      /* not JSON — skip */
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Analytics card (small glass tile used 4× in the right column)
// ---------------------------------------------------------------------------

function AnalyticsCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div
      // Tokens — design-tokens.md sub-section glass surface.
      // Background rgba(255,255,255,0.04) + border rgba(255,255,255,0.08)
      // matches the Caption / Prompt section containers above.
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "14px 16px",
        minHeight: 78,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.3,
          }}
        >
          {label}
        </span>
        <span style={{ color: "rgba(255,255,255,0.55)" }}>{icon}</span>
      </div>
      <span style={{ color: "#ffffff", fontSize: 22, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

function PostDetailModal({
  post,
  onClose,
  isAdmin,
  currentUserId,
  onPostUpdate,
  onPatch,
  onSchedule,
  onDelete,
}: {
  post: Post;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId: string;
  onPostUpdate: (p: Post) => void;
  onPatch: (postId: string, updates: Partial<Post>) => void;
  onSchedule: (
    post: Post,
    mode: "schedule" | "reschedule" | "approve-and-schedule" | "suggest-time-send"
  ) => void;
  onDelete: (post: Post) => void;
}) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  // ── Edit mode ──────────────────────────────────────────────────────
  // Toggled from the Edit button on Draft / Approved / Failed action rows.
  // Caption section becomes a textarea; left column gets a Regenerate
  // Image panel; action row swaps to Cancel + Save Changes.
  const [editMode, setEditMode] = useState(false);
  const [editedCaption, setEditedCaption] = useState(post.content);
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Image carousel + regenerate ────────────────────────────────────
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [regeneratedImageUrl, setRegeneratedImageUrl] = useState<string | null>(null);
  const [showRegeneratePanel, setShowRegeneratePanel] = useState(false);
  const [regenerationPrompt, setRegenerationPrompt] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");
  const regenerateWsRef = useRef<WebSocket | null>(null);

  // ── Kebab menu ─────────────────────────────────────────────────────
  const [showKebab, setShowKebab] = useState(false);

  // ── Reset edit state if the parent re-opens the modal on a new post ─
  useEffect(() => {
    setEditMode(false);
    setEditedCaption(post.content);
    setRegeneratedImageUrl(null);
    setShowRegeneratePanel(false);
    setRegenerationPrompt("");
    setRegenerateError("");
    setCurrentImageIndex(0);
    setShowKebab(false);
    setError("");
  }, [post._id]);

  // Tear down any pending regenerate WebSocket on unmount.
  useEffect(() => {
    return () => {
      regenerateWsRef.current?.close();
      regenerateWsRef.current = null;
    };
  }, []);

  // ── Quick PATCHes (no modal; surface errors inline) ────────────────
  const handleUnschedule = async () => {
    setActionLoading("unschedule");
    setError("");
    try {
      const res = await fetch(`/api/posts/${post._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "approved", scheduledFor: null }),
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to unschedule");
        return;
      }
      onPatch(post._id, { status: "approved", scheduledFor: undefined });
      onPostUpdate(data.post);
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async () => {
    setActionLoading("retry");
    setError("");
    try {
      const res = await fetch(`/api/posts/${post._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: "scheduled",
          scheduledFor: post.scheduledFor ?? null,
        }),
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to retry");
        return;
      }
      onPatch(post._id, { status: "scheduled" });
      onPostUpdate(data.post);
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Image list — supports a multi-variant carousel. aiImageUrl is the
  // canonical render; imageUrls[] is the variant pool. We dedupe so the
  // canonical isn't shown twice if it also appears in the array.
  const imageList: string[] = (() => {
    const list: string[] = [];
    if (post.aiImageUrl) list.push(post.aiImageUrl);
    for (const u of post.imageUrls ?? []) {
      if (u && !list.includes(u)) list.push(u);
    }
    return list;
  })();
  const safeIndex = Math.min(currentImageIndex, Math.max(0, imageList.length - 1));
  const currentImage = regeneratedImageUrl ?? imageList[safeIndex] ?? null;

  // First non-empty line of caption, ellipsised — used as the modal title.
  const captionFirstLine = (post.content || "").split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  const title =
    captionFirstLine.length > 50
      ? `${captionFirstLine.slice(0, 47)}…`
      : captionFirstLine || "Untitled post";

  const promptText = _extractPromptText(post);

  // ── Approve, save, regenerate handlers ────────────────────────────
  const handleApprove = async () => {
    setActionLoading("approve");
    setError("");
    try {
      const res = await fetch(`/api/posts/${post._id}/approve`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to approve");
        return;
      }
      if (data.requiresReschedule) {
        setError("This post's scheduled time has passed. Please reschedule before approving.");
        return;
      }
      onPatch(post._id, {
        status: data.post?.status ?? "approved",
        rejectionNote: undefined,
      });
      onPostUpdate(data.post);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  // Member: submit own draft for review (no suggested time). The Suggest
  // Time & Send variant goes through the parent's openSchedule flow.
  const handleSubmitReview = async () => {
    setActionLoading("review");
    setError("");
    try {
      const res = await fetch(`/api/posts/${post._id}/submit-review`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to submit for review");
        return;
      }
      onPatch(post._id, { status: "review" });
      onPostUpdate(data.post);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  // Member: withdraw own review post back to draft (clears requestedPublishTime).
  const handleWithdraw = async () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Withdraw this post from review?");
      if (!ok) return;
    }
    setActionLoading("withdraw");
    setError("");
    try {
      const res = await fetch(`/api/posts/${post._id}/withdraw`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to withdraw");
        return;
      }
      onPatch(post._id, { status: "draft", requestedPublishTime: undefined });
      onPostUpdate(data.post);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEnterEditMode = () => {
    setEditMode(true);
    setEditedCaption(post.content);
    setError("");
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditedCaption(post.content);
    setRegeneratedImageUrl(null);
    setShowRegeneratePanel(false);
    setRegenerationPrompt("");
    setRegenerateError("");
    setError("");
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    setError("");
    const body: { content?: string; aiImageUrl?: string } = {};
    if (editedCaption !== post.content) body.content = editedCaption;
    if (regeneratedImageUrl) body.aiImageUrl = regeneratedImageUrl;
    if (Object.keys(body).length === 0) {
      // No-op save — exit edit mode silently.
      setEditMode(false);
      setSavingEdit(false);
      return;
    }
    try {
      const res = await fetch(`/api/posts/${post._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to save changes");
        setSavingEdit(false);
        return;
      }
      // Patch only the fields we sent — keeps content/aiImageUrl in sync
      // immediately, then reconcile to the full server post afterwards.
      const patch: Partial<Post> = {};
      if (body.content !== undefined) patch.content = body.content;
      if (body.aiImageUrl !== undefined) patch.aiImageUrl = body.aiImageUrl;
      onPatch(post._id, patch);
      onPostUpdate(data.post);
      setEditMode(false);
      setRegeneratedImageUrl(null);
      setShowRegeneratePanel(false);
    } catch {
      setError("Network error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Regenerate flow: POST returns {jobId, wsToken, wsUrl}; we open a WS
  // and wait for "step":"done" with result.imageUrl. Errors and timeouts
  // surface inline via regenerateError.
  const handleRegenerate = async () => {
    if (!regenerationPrompt.trim() || !currentImage) {
      setRegenerateError("Type a change prompt first.");
      return;
    }
    setRegenerating(true);
    setRegenerateError("");
    try {
      const res = await fetch("/api/posts/regenerate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageUrl: currentImage,
          modificationPrompt: regenerationPrompt.trim(),
        }),
      });
      const data = unwrap(await res.json().catch(() => ({})));
      if (!res.ok || !data.jobId || !data.wsToken || !data.wsUrl) {
        setRegenerateError(data.error ?? "Failed to start regeneration");
        setRegenerating(false);
        return;
      }
      const ws = new WebSocket(
        `${data.wsUrl}/ws/regenerate/${data.jobId}?ws_token=${data.wsToken}`
      );
      regenerateWsRef.current = ws;
      // Close the panel as soon as the regen is in flight — the outer
      // "Regenerate Image" button now carries the loading state. Keeping
      // the panel open here would render two redundant indicators.
      setShowRegeneratePanel(false);
      const timer = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
          setRegenerating(false);
          setRegenerateError("Regeneration timed out — please try again.");
        }
      }, 300_000);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.step === "done") {
            const newUrl = msg.result?.imageUrl;
            if (newUrl) {
              setRegeneratedImageUrl(newUrl);
              setRegenerationPrompt("");
            }
            window.clearTimeout(timer);
            setRegenerating(false);
            ws.close();
          } else if (msg.step === "error") {
            window.clearTimeout(timer);
            setRegenerateError(msg.error ?? "Regeneration failed");
            setRegenerating(false);
            ws.close();
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        setRegenerateError("Connection error");
        setRegenerating(false);
      };
      ws.onclose = () => {
        if (regenerateWsRef.current === ws) regenerateWsRef.current = null;
      };
    } catch {
      setRegenerateError("Network error");
      setRegenerating(false);
    }
  };

  // ── Date formatters — match the v1 screenshot's "MM/DD/YYYY, H:MM AM/PM"
  const fmtDateTime = (d: string | Date) =>
    new Date(d).toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  const fmtDateOnly = (d: string | Date) =>
    new Date(d).toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  // ── Action-row builder — status-specific button layout for the modal.
  // Edit mode swaps everything for Cancel + Save Changes.
  const renderActions = () => {
    if (editMode) {
      // Save is blocked while a regen is in flight so the user can't
      // race the WebSocket result. Cancel still works — it tears down
      // the regen on next mount cycle (handleCancelEdit clears state).
      const blockedBySave = savingEdit || regenerating;
      const saveLabel = savingEdit
        ? "Saving…"
        : regenerating
        ? "Regenerating…"
        : "Save Changes";
      return (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleCancelEdit}
            disabled={savingEdit}
            style={{
              ...modalBtnSecondary,
              cursor: savingEdit ? "not-allowed" : "pointer",
              opacity: savingEdit ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={blockedBySave}
            style={{
              ...modalBtnPrimary,
              cursor: blockedBySave ? "not-allowed" : "pointer",
              opacity: blockedBySave ? 0.6 : 1,
            }}
          >
            {saveLabel}
          </button>
        </div>
      );
    }
    // Member action sets — own posts only. Approved/scheduled/published/
    // failed/overdue are view-only for members; the modal still renders
    // image, caption, prompt and analytics.
    if (!isAdmin) {
      const ownPost = post.userId === currentUserId;
      if (!ownPost) return null;

      if (post.status === "draft") {
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={actionLoading === "review"}
                style={{
                  ...modalBtnPrimary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: actionLoading === "review" ? 0.7 : 1,
                  cursor: actionLoading === "review" ? "not-allowed" : "pointer",
                }}
              >
                <Send size={13} />
                {actionLoading === "review" ? "Sending…" : "Send for Review"}
              </button>
              <button
                type="button"
                onClick={() => onSchedule(post, "suggest-time-send")}
                style={{
                  ...modalBtnSecondary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Calendar size={13} />
                Suggest Time &amp; Send
              </button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={handleEnterEditMode} style={modalBtnSecondary}>
                Edit
              </button>
              <button type="button" onClick={() => onDelete(post)} style={modalBtnDestructive}>
                Delete
              </button>
            </div>
          </div>
        );
      }

      if (post.status === "review") {
        return (
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={actionLoading === "withdraw"}
            style={{
              ...modalBtnSecondary,
              flex: undefined,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: actionLoading === "withdraw" ? 0.7 : 1,
              cursor: actionLoading === "withdraw" ? "not-allowed" : "pointer",
            }}
          >
            <RotateCcw size={13} />
            {actionLoading === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        );
      }

      // approved / scheduled / published / failed / overdue → view only.
      return null;
    }

    // ── Admin action sets ──────────────────────────────────────────
    if (post.status === "draft") {
      return (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => onSchedule(post, "schedule")} style={modalBtnPrimary}>
            Schedule
          </button>
          <button type="button" onClick={handleEnterEditMode} style={modalBtnSecondary}>
            Edit
          </button>
          <button type="button" onClick={() => onDelete(post)} style={modalBtnDestructive}>
            Delete
          </button>
        </div>
      );
    }

    if (post.status === "review") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setShowRejectModal(true)}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.45)",
                background: "transparent",
                color: "#EF4444",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={actionLoading === "approve"}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                border: "none",
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 13,
                fontWeight: 600,
                cursor: actionLoading === "approve" ? "not-allowed" : "pointer",
                opacity: actionLoading === "approve" ? 0.7 : 1,
              }}
            >
              {actionLoading === "approve" ? "Approving…" : "Approve"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSchedule(post, "approve-and-schedule")}
            style={{ ...modalBtnPrimary, flex: undefined, width: "100%" }}
          >
            Approve &amp; Schedule
          </button>
        </div>
      );
    }

    if (post.status === "approved") {
      return (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => onSchedule(post, "schedule")} style={modalBtnPrimary}>
            Schedule
          </button>
          <button type="button" onClick={handleEnterEditMode} style={modalBtnSecondary}>
            Edit
          </button>
        </div>
      );
    }

    if (post.status === "scheduled") {
      return (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => onSchedule(post, "reschedule")} style={modalBtnSecondary}>
            Reschedule
          </button>
          <button
            type="button"
            onClick={handleUnschedule}
            disabled={actionLoading === "unschedule"}
            style={{
              ...modalBtnSecondary,
              cursor: actionLoading === "unschedule" ? "not-allowed" : "pointer",
              opacity: actionLoading === "unschedule" ? 0.7 : 1,
            }}
          >
            {actionLoading === "unschedule" ? "…" : "Unschedule"}
          </button>
        </div>
      );
    }

    if (post.status === "failed") {
      return (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleRetry}
            disabled={actionLoading === "retry"}
            style={{
              ...modalBtnSecondary,
              cursor: actionLoading === "retry" ? "not-allowed" : "pointer",
              opacity: actionLoading === "retry" ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={13} />
            {actionLoading === "retry" ? "Retrying…" : "Retry"}
          </button>
          <button type="button" onClick={handleEnterEditMode} style={modalBtnSecondary}>
            Edit
          </button>
        </div>
      );
    }

    if (post.status === "overdue") {
      return (
        <button
          type="button"
          onClick={() => onSchedule(post, "schedule")}
          style={{ ...modalBtnPrimary, flex: undefined, width: "100%" }}
        >
          Schedule
        </button>
      );
    }

    // published — view-only, no actions.
    return null;
  };

  // Section heading style — used by Caption & Hashtags / Prompt sections.
  const sectionHeadingStyle: React.CSSProperties = {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    marginBottom: 8,
    letterSpacing: 0.1,
  };

  // Glass section container — design-tokens.md "primary glass card",
  // softened (radius 14, lower-alpha border) to read as a sub-section
  // inside the modal rather than a top-level card.
  const sectionContainerStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 12,
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(6px)",
          padding: "16px",
        }}
        onClick={onClose}
      >
        <div
          // Tokens — see apps/web/src/lib/constants/design-tokens.md
          // (Primary glass card + sidebar shadow). Dark-tinted glass at
          // 33,33,33/0.14 with the 24px backdrop-blur is what makes the
          // modal frame against the green-hills wallpaper.
          style={{
            width: "min(900px, 100%)",
            maxHeight: "85vh",
            background: "rgba(33, 33, 33, 0.14)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 16,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ────────── LEFT COLUMN — image + carousel + regenerate ────────── */}
          <div
            style={{
              flex: "1 1 360px",
              minWidth: 320,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxSizing: "border-box",
            }}
          >
            {currentImage ? (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "4 / 5",
                  borderRadius: 16,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.30)",
                }}
              >
                <img
                  src={currentImage}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {/* Carousel thumbnail strip — only when post has multiple
                    variant images. Sits at bottom-left, mirroring the v1
                    screenshot's "V1" thumbnail. */}
                {imageList.length > 1 && !regeneratedImageUrl && (
                  <div
                    style={{
                      position: "absolute",
                      left: 10,
                      bottom: 10,
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    {imageList.map((url, i) => {
                      const active = i === safeIndex;
                      return (
                        <button
                          key={url + i}
                          type="button"
                          onClick={() => setCurrentImageIndex(i)}
                          aria-label={`Variant ${i + 1}`}
                          style={{
                            width: 44,
                            height: 60,
                            borderRadius: 8,
                            border: active
                              ? "2px solid #ffffff"
                              : "1px solid rgba(255,255,255,0.30)",
                            padding: 0,
                            background: `center / cover no-repeat url("${url}")`,
                            cursor: "pointer",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              left: 4,
                              bottom: 3,
                              fontSize: 9,
                              fontWeight: 600,
                              color: "#ffffff",
                              textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                            }}
                          >
                            V{i + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4 / 5",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.30)",
                }}
              >
                <FileText size={32} />
              </div>
            )}

            {/* Regenerate Image — edit-mode only. Toggles an inline prompt
                input; submit fires POST /api/posts/regenerate-image and
                listens on the returned WS for the new image. While a
                regen is in flight the outer button (this one) carries
                the loading state — spinning icon + "Regenerating…" text,
                disabled. The panel auto-closes when the regen starts.
                The new image is held in regeneratedImageUrl until Save
                Changes persists it. */}
            {editMode && (
              <div>
                {!showRegeneratePanel ? (
                  <button
                    type="button"
                    onClick={() => setShowRegeneratePanel(true)}
                    disabled={!currentImage || regenerating}
                    style={{
                      ...modalBtnSecondary,
                      flex: undefined,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      opacity: !currentImage || regenerating ? 0.6 : 1,
                      cursor: !currentImage || regenerating ? "not-allowed" : "pointer",
                    }}
                  >
                    <RefreshCw
                      size={13}
                      style={{
                        animation: regenerating ? "qs-spin 1s linear infinite" : undefined,
                      }}
                    />
                    {regenerating ? "Regenerating…" : "Regenerate Image"}
                  </button>
                ) : (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <textarea
                      value={regenerationPrompt}
                      onChange={(e) => setRegenerationPrompt(e.target.value)}
                      placeholder="What should change? e.g. 'warmer light', 'replace soap with bath salts'…"
                      rows={3}
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 10,
                        color: "#ffffff",
                        fontSize: 13,
                        padding: "8px 10px",
                        resize: "vertical",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    {regenerateError && (
                      <p style={{ color: "#EF4444", fontSize: 12, margin: 0 }}>{regenerateError}</p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRegeneratePanel(false);
                          setRegenerationPrompt("");
                          setRegenerateError("");
                        }}
                        disabled={regenerating}
                        style={{
                          ...modalBtnSecondary,
                          height: 34,
                          fontSize: 12,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        disabled={regenerating || !regenerationPrompt.trim()}
                        style={{
                          ...modalBtnPrimary,
                          height: 34,
                          fontSize: 12,
                          opacity: regenerating || !regenerationPrompt.trim() ? 0.6 : 1,
                          cursor:
                            regenerating || !regenerationPrompt.trim() ? "not-allowed" : "pointer",
                        }}
                      >
                        {regenerating ? "Regenerating…" : "Submit"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ────────── RIGHT COLUMN — header + sections + actions ────────── */}
          <div
            style={{
              flex: "1 1 360px",
              minWidth: 320,
              maxHeight: "85vh",
              padding: "20px 22px 22px",
              boxSizing: "border-box",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ── Header row: title + dates + meta + kebab + close ── */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  title={captionFirstLine || undefined}
                  style={{
                    color: "#ffffff",
                    fontSize: 16,
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    marginTop: 8,
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Clock size={12} />
                    Created on {fmtDateTime(post.createdAt)}
                  </span>
                  {post.scheduledFor && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={12} />
                      Scheduled on {fmtDateOnly(post.scheduledFor)}
                    </span>
                  )}
                  {post.status === "review" && post.requestedPublishTime && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={12} />
                      Requested {fmtDateOnly(post.requestedPublishTime)}
                    </span>
                  )}
                </div>
              </div>

              {/* Kebab + close. The kebab only renders when there's at
                  least one delete-capable action: admin always, member on
                  their own draft. Non-draft members get no kebab. */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0, position: "relative" }}>
                {(isAdmin ||
                  (post.userId === currentUserId && post.status === "draft")) && (
                  <button
                    type="button"
                    aria-label="More actions"
                    onClick={() => setShowKebab((s) => !s)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.80)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <MoreVertical size={15} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.80)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={15} />
                </button>

                {showKebab && (
                  <div
                    role="menu"
                    // Primary glass card tokens — design-tokens.md §1.
                    style={{
                      position: "absolute",
                      top: 38,
                      right: 0,
                      minWidth: 160,
                      background: "rgba(33, 33, 33, 0.14)",
                      border: "1px solid rgba(255, 255, 255, 0.10)",
                      borderRadius: 16,
                      padding: 6,
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                      zIndex: 200,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowKebab(false);
                        onDelete(post);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        color: "rgba(248,113,113,1)",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <Trash2 size={13} />
                      Delete post
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Status + platform pill row ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <StatusBadge status={post.status} />
              <PlatformBadge platform={post.platform} />
            </div>

            {/* ── Rejection note (when present) ── */}
            {post.rejectionNote && (
              <div
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  marginBottom: 12,
                }}
              >
                <p style={{ fontSize: 12, color: "#EF4444", fontWeight: 500, margin: 0, marginBottom: 4 }}>
                  Rejection note
                </p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", margin: 0 }}>
                  {post.rejectionNote}
                </p>
              </div>
            )}

            {/* ── SECTION 2 — Caption & Hashtags ── */}
            <div style={sectionContainerStyle}>
              <h3 style={sectionHeadingStyle}>Caption &amp; Hashtags</h3>
              {editMode ? (
                <textarea
                  value={editedCaption}
                  onChange={(e) => setEditedCaption(e.target.value)}
                  rows={6}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 10,
                    color: "#ffffff",
                    fontSize: 13,
                    lineHeight: 1.55,
                    padding: "10px 12px",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              ) : (
                <p
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {post.content || "—"}
                </p>
              )}
            </div>

            {/* ── SECTION 3 — Prompt ── */}
            <div style={sectionContainerStyle}>
              <h3 style={sectionHeadingStyle}>Prompt</h3>
              <p
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {promptText || "—"}
              </p>
            </div>

            {/* ── SECTION 4 — Analytics 2×2 grid ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <AnalyticsCard label="Total Reach" value={0} icon={<BarChart3 size={14} />} />
              <AnalyticsCard label="Total Likes" value={post.likes ?? 0} icon={<Heart size={14} />} />
              <AnalyticsCard label="Comments" value={post.comments ?? 0} icon={<MessageCircle size={14} />} />
              <AnalyticsCard label="Share" value={post.shares ?? 0} icon={<Share2 size={14} />} />
            </div>

            {/* ── SECTION 5 — View Advanced Analytics (disabled stub) ── */}
            <button
              type="button"
              disabled
              title="Coming Soon"
              style={{
                width: "100%",
                height: 40,
                borderRadius: 10,
                // Tokens — same 0.04/0.08 sub-section glass as the
                // section containers + analytics tiles, so every
                // surface inside the modal is consistent.
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.45)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "not-allowed",
                marginBottom: 14,
              }}
            >
              View Advanced Analytics
            </button>

            {error && (
              <p style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{error}</p>
            )}

            {/* ── SECTION 6 — Action buttons (status-specific or edit-mode) ── */}
            <div style={{ marginTop: "auto" }}>{renderActions()}</div>
          </div>
        </div>
      </div>

      {showRejectModal && (
        <RejectModal
          postId={post._id}
          onClose={() => setShowRejectModal(false)}
          onDone={(updated) => {
            setShowRejectModal(false);
            // Patch first so the underlying card flips to "draft" instantly
            // when this detail modal closes.
            onPatch(post._id, {
              status: "draft",
              rejectionNote: updated?.rejectionNote ?? undefined,
            });
            onPostUpdate(updated);
            onClose();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Post Card
// ---------------------------------------------------------------------------

function PostCard({
  post,
  isAdmin,
  currentUserId,
  onClick,
  onPostUpdate,
  onPatch,
  onSchedule,
  onDelete,
}: {
  post: Post;
  isAdmin: boolean;
  currentUserId: string;
  onClick: () => void;
  onPostUpdate: (p: Post) => void;
  // Partial-patch helper for immediate optimistic UI updates after a
  // successful API call. The parent's full-post reconciler `onPostUpdate`
  // still fires after to bring server-derived fields back in sync.
  onPatch: (postId: string, updates: Partial<Post>) => void;
  // Triggered when the user clicks any button that should open the
  // ScheduleModal. mode determines the API path the parent will use:
  //   "schedule"             — draft / approved / overdue
  //   "reschedule"           — currently scheduled posts
  //   "approve-and-schedule" — review posts (admin)
  onSchedule: (
    post: Post,
    mode: "schedule" | "reschedule" | "approve-and-schedule" | "suggest-time-send"
  ) => void;
  // Triggered when the user clicks Delete on a draft post. Parent shows
  // the confirm dialog and calls the DELETE route.
  onDelete: (post: Post) => void;
}) {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  // Quick PATCHes that don't need ScheduleModal — Unschedule (scheduled →
  // approved, scheduledFor cleared) and Retry (failed → scheduled, keep
  // scheduledFor). Both flow through the existing /status route which
  // admins can transition freely.
  const handleUnschedule = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading("unschedule");
    try {
      const res = await fetch(`/api/posts/${post._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "approved", scheduledFor: null }),
      });
      const data = unwrap(await res.json());
      if (res.ok) {
        onPatch(post._id, { status: "approved", scheduledFor: undefined });
        onPostUpdate(data.post);
      }
    } catch {}
    setActionLoading(null);
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading("retry");
    try {
      const res = await fetch(`/api/posts/${post._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: "scheduled",
          scheduledFor: post.scheduledFor ?? null,
        }),
      });
      const data = unwrap(await res.json());
      if (res.ok) {
        onPatch(post._id, { status: "scheduled" });
        onPostUpdate(data.post);
      }
    } catch {}
    setActionLoading(null);
  };

  // Post Now — admin-only override that publishes immediately. Backend
  // route enforces RBAC + status guard, but we double-check here so the
  // button doesn't render for members.
  const handlePostNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading("post-now");
    try {
      const res = await fetch(`/api/posts/${post._id}/publish-now`, {
        method: "POST",
        credentials: "include",
      });
      const data = unwrap(await res.json().catch(() => ({})));
      // Patch immediately based on outcome — the publish-now route returns
      // the post on both success (200) and failure (502). Surface the new
      // status before the full reconcile arrives.
      if (res.ok) {
        onPatch(post._id, {
          status: "published",
          publishedAt: new Date().toISOString(),
        });
      } else {
        onPatch(post._id, {
          status: "failed",
        });
      }
      if (data?.post) onPostUpdate(data.post);
    } catch {}
    setActionLoading(null);
  };

  const img =
    post.aiImageUrl ||
    (post.imageUrls && post.imageUrls.length > 0 ? post.imageUrls[0] : null);

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading("approve");
    try {
      const res = await fetch(`/api/posts/${post._id}/approve`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = unwrap(await res.json());
      if (res.ok && data.requiresReschedule) {
        // The post had a scheduledFor in the past — admin must pick a new
        // time before it can transition to scheduled. Open the reschedule
        // flow rather than silently doing nothing on the click.
        setActionLoading(null);
        onSchedule(post, "reschedule");
        return;
      }
      if (res.ok) {
        // Approve route resolves to either "approved" (no scheduledFor) or
        // "scheduled" (future scheduledFor). Patch with the server-known
        // shape; full reconcile via onPostUpdate restores approvedAt etc.
        onPatch(post._id, {
          status: data.post?.status ?? "approved",
          rejectionNote: undefined,
        });
        onPostUpdate(data.post);
      }
    } catch {}
    setActionLoading(null);
  };

  const handleSubmitReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading("review");
    try {
      const res = await fetch(`/api/posts/${post._id}/submit-review`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = unwrap(await res.json());
      if (res.ok) {
        onPatch(post._id, { status: "review" });
        onPostUpdate(data.post);
      }
    } catch {}
    setActionLoading(null);
  };

  // Member: withdraw a review post back to draft. Confirms first because
  // the action discards the suggested time and any review queue position.
  const handleWithdraw = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== "undefined") {
      const ok = window.confirm("Withdraw this post from review?");
      if (!ok) return;
    }
    setActionLoading("withdraw");
    try {
      const res = await fetch(`/api/posts/${post._id}/withdraw`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = unwrap(await res.json());
      if (res.ok) {
        onPatch(post._id, { status: "draft", requestedPublishTime: undefined });
        onPostUpdate(data.post);
      }
    } catch {}
    setActionLoading(null);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        // Primary glass card tokens — design-tokens.md §1.
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: `1px solid ${hovered ? "rgba(255, 255, 255, 0.20)" : "rgba(255, 255, 255, 0.10)"}`,
          borderRadius: 16,
          overflow: "hidden",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          transition: "border-color 0.15s, transform 0.15s",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* Image area */}
        <div
          style={{
            position: "relative",
            aspectRatio: "4/5",
            background: "rgba(255,255,255,0.04)",
            overflow: "hidden",
          }}
        >
          {img ? (
            <img
              src={img}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.20)",
              }}
            >
              <FileText size={28} />
            </div>
          )}

          {/* Hover overlay — external link */}
          {hovered && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.30)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                padding: 8,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                }}
              >
                <ExternalLink size={13} />
              </div>
            </div>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {/* Caption */}
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.80)",
              lineHeight: 1.5,
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {post.content}
          </p>

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              {new Date(post.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PlatformBadge platform={post.platform} />
            </div>
          </div>

          {/* Status badge */}
          <StatusBadge status={post.status} />

          {/* Member-suggested publish time on review cards. Shown to BOTH
              admin (so they can honour or override the suggestion) and
              member (so they can confirm what they sent). */}
          {post.status === "review" && post.requestedPublishTime && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "rgba(255,255,255,0.50)",
                marginTop: 2,
              }}
            >
              <Calendar size={11} />
              <span>
                Requested:{" "}
                {new Date(post.requestedPublishTime).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}

          {/* Rejection-note amber banner on draft cards. Shown to BOTH
              admin (audit trail) and member (so they can fix and resubmit). */}
          {post.status === "draft" && post.rejectionNote && (
            <div
              style={{
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.30)",
                borderRadius: 8,
                padding: "6px 9px",
                marginTop: 2,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "#F59E0B",
                  margin: 0,
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                <strong style={{ fontWeight: 600 }}>Rejected:</strong> {post.rejectionNote}
              </p>
            </div>
          )}

          {/* Action buttons — per-status, per-role. Admin sees the full
              admin set; member sees their own subset on their own posts. */}

          {isAdmin && post.status === "draft" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSchedule(post, "schedule");
                  }}
                  style={cardBtnPrimary}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(post);
                  }}
                  style={cardBtnDestructive}
                >
                  Delete
                </button>
              </div>
              <button
                type="button"
                onClick={handlePostNow}
                disabled={actionLoading === "post-now"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: actionLoading === "post-now" ? 0.6 : 1,
                  cursor: actionLoading === "post-now" ? "not-allowed" : "pointer",
                }}
              >
                <Zap size={11} />
                {actionLoading === "post-now" ? "Posting…" : "Post Now"}
              </button>
            </div>
          )}

          {isAdmin && post.status === "review" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRejectModal(true);
                  }}
                  style={{
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid rgba(239,68,68,0.40)",
                    background: "transparent",
                    color: "#EF4444",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={actionLoading === "approve"}
                  style={{
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    border: "none",
                    background: "rgba(255,255,255,0.92)",
                    color: "#0a0a0a",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: actionLoading === "approve" ? "not-allowed" : "pointer",
                    opacity: actionLoading === "approve" ? 0.6 : 1,
                  }}
                >
                  {actionLoading === "approve" ? "…" : "Approve"}
                </button>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(post, "approve-and-schedule");
                }}
                style={{ ...cardBtnPrimary, flex: undefined, width: "100%" }}
              >
                Approve &amp; Schedule
              </button>
            </div>
          )}

          {isAdmin && post.status === "approved" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(post, "schedule");
                }}
                style={{ ...cardBtnPrimary, flex: undefined, width: "100%" }}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={handlePostNow}
                disabled={actionLoading === "post-now"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: actionLoading === "post-now" ? 0.6 : 1,
                  cursor: actionLoading === "post-now" ? "not-allowed" : "pointer",
                }}
              >
                <Zap size={11} />
                {actionLoading === "post-now" ? "Posting…" : "Post Now"}
              </button>
            </div>
          )}

          {isAdmin && post.status === "scheduled" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSchedule(post, "reschedule");
                  }}
                  style={cardBtnSecondary}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={handleUnschedule}
                  disabled={actionLoading === "unschedule"}
                  style={{
                    ...cardBtnSecondary,
                    opacity: actionLoading === "unschedule" ? 0.6 : 1,
                    cursor: actionLoading === "unschedule" ? "not-allowed" : "pointer",
                  }}
                >
                  {actionLoading === "unschedule" ? "…" : "Unschedule"}
                </button>
              </div>
              <button
                type="button"
                onClick={handlePostNow}
                disabled={actionLoading === "post-now"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: actionLoading === "post-now" ? 0.6 : 1,
                  cursor: actionLoading === "post-now" ? "not-allowed" : "pointer",
                }}
              >
                <Zap size={11} />
                {actionLoading === "post-now" ? "Posting…" : "Post Now"}
              </button>
              <Link
                href="/dashboard/calendar"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid rgba(59,130,246,0.35)",
                  background: "transparent",
                  color: "#3B82F6",
                  fontSize: 11,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                <Calendar size={11} />
                View in Calendar
              </Link>
            </div>
          )}

          {isAdmin && post.status === "failed" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleRetry}
                disabled={actionLoading === "retry"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  opacity: actionLoading === "retry" ? 0.6 : 1,
                  cursor: actionLoading === "retry" ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <RotateCcw size={11} />
                {actionLoading === "retry" ? "Retrying…" : "Retry"}
              </button>
              <button
                type="button"
                onClick={handlePostNow}
                disabled={actionLoading === "post-now"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: actionLoading === "post-now" ? 0.6 : 1,
                  cursor: actionLoading === "post-now" ? "not-allowed" : "pointer",
                }}
              >
                <Zap size={11} />
                {actionLoading === "post-now" ? "Posting…" : "Post Now"}
              </button>
            </div>
          )}

          {isAdmin && post.status === "overdue" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(post, "schedule");
                }}
                style={{ ...cardBtnPrimary, flex: undefined, width: "100%" }}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={handlePostNow}
                disabled={actionLoading === "post-now"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: actionLoading === "post-now" ? 0.6 : 1,
                  cursor: actionLoading === "post-now" ? "not-allowed" : "pointer",
                }}
              >
                <Zap size={11} />
                {actionLoading === "post-now" ? "Posting…" : "Post Now"}
              </button>
            </div>
          )}

          {/* Member draft branch — own post only. Send for Review +
              Delete on row 1, Suggest Time & Send full-width on row 2.
              Edit lives in the modal (matches the admin pattern). */}
          {!isAdmin && post.status === "draft" && post.userId === currentUserId && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={actionLoading === "review"}
                  style={{
                    ...cardBtnPrimary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    opacity: actionLoading === "review" ? 0.6 : 1,
                    cursor: actionLoading === "review" ? "not-allowed" : "pointer",
                  }}
                >
                  <Send size={11} />
                  {actionLoading === "review" ? "Sending…" : "Send for Review"}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(post);
                  }}
                  style={cardBtnDestructive}
                >
                  Delete
                </button>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(post, "suggest-time-send");
                }}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <Calendar size={11} />
                Suggest Time &amp; Send
              </button>
            </div>
          )}

          {/* Member review branch — own post only. Withdraw returns the
              post to draft + clears requestedPublishTime so the member
              can edit and resubmit. */}
          {!isAdmin && post.status === "review" && post.userId === currentUserId && (
            <div
              style={{ display: "flex", gap: 6, marginTop: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={actionLoading === "withdraw"}
                style={{
                  ...cardBtnSecondary,
                  flex: undefined,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: actionLoading === "withdraw" ? 0.6 : 1,
                  cursor: actionLoading === "withdraw" ? "not-allowed" : "pointer",
                }}
              >
                <RotateCcw size={11} />
                {actionLoading === "withdraw" ? "Withdrawing…" : "Withdraw"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showRejectModal && (
        <RejectModal
          postId={post._id}
          onClose={() => setShowRejectModal(false)}
          onDone={(updated) => {
            setShowRejectModal(false);
            // Patch first so the badge flips to "draft" instantly even if
            // the parent's full reconcile has any subtle issue.
            onPatch(post._id, {
              status: "draft",
              rejectionNote: updated?.rejectionNote ?? undefined,
            });
            onPostUpdate(updated);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ filter }: { filter: string }) {
  return (
    <div
      // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
      style={{
        gridColumn: "1 / -1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.35)",
        }}
      >
        <FileText size={24} />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#ffffff", fontSize: 15, fontWeight: 500, margin: 0 }}>
          {filter === "all" ? "No posts yet" : `No ${filter} posts`}
        </p>
        <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, marginTop: 6 }}>
          {filter === "all"
            ? "Create your first post to get started"
            : "Posts with this status will appear here"}
        </p>
      </div>
      {filter === "all" && (
        <Link
          href="/dashboard/posts/create"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 20px",
            borderRadius: 10,
            background: "#ffffff",
            color: "#0a0a0a",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Plus size={14} />
          Create Post
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div
      // Glass-styled placeholder — same primary-glass tint as the real
      // PostCard so the wallpaper shows through and there's no layout
      // shift when content arrives. Border slightly subtler than a real
      // card (0.08 vs 0.10) so it reads as "loading". qs-pulse keyframe
      // lives in apps/web/src/app/globals.css.
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          aspectRatio: "4/5",
          background: "rgba(255,255,255,0.06)",
          animation: "qs-pulse 1.4s ease-in-out infinite",
        }}
      />
      <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.06)", animation: "qs-pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 12, borderRadius: 6, width: "70%", background: "rgba(255,255,255,0.06)", animation: "qs-pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 20, borderRadius: 9999, width: "50%", background: "rgba(255,255,255,0.06)", animation: "qs-pulse 1.4s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ContentHubPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentUserId = (session?.user as any)?.id ?? "";

  const filterFromUrl = searchParams.get("filter") ?? "all";
  const [activeFilter, setActiveFilter] = useState(filterFromUrl);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // Per-brand role. Drives admin vs member buttons across the page.
  // Returns { isAdmin: false } while loading or before activeBrandId
  // resolves; member-specific UI is gated by !isAdmin + ownership checks
  // so the loading flash favours the safer (member-style) layout.
  const { isAdmin } = useWorkspaceRole(activeBrandId);

  // Schedule modal — opened from PostCard / PostDetailModal via onSchedule.
  // mode determines which API path the onSave/onSuggest handler routes to:
  //   schedule              — admin: status → scheduled
  //   reschedule            — admin: change scheduledFor on a scheduled post
  //   approve-and-schedule  — admin: set scheduledFor on review then approve
  //   suggest-time-send     — member: persist requestedPublishTime + submit
  const [scheduleTarget, setScheduleTarget] = useState<{
    post: Post;
    mode: "schedule" | "reschedule" | "approve-and-schedule" | "suggest-time-send";
  } | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [schedulePublishingNow, setSchedulePublishingNow] = useState(false);
  // Active when the member's "Suggest & Send for Review" button is in flight.
  const [scheduleSuggesting, setScheduleSuggesting] = useState(false);

  // Delete confirm modal — opened from PostCard / PostDetailModal via onDelete.
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  // Fetch active brand on mount
  useEffect(() => {
    fetch("/api/user/active-brand", { credentials: "include" })
      .then((r) => r.json()).then(unwrap)
      .then((d) => setActiveBrandId(d.activeBrandId ?? d.brandId ?? null))
      .catch(() => {});
  }, []);

  // Fetch posts when filter or brandId changes
  const fetchPosts = useCallback(
    async (filter: string, page: number, append: boolean) => {
      if (!activeBrandId) return;
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          brandId: activeBrandId,
          page: String(page),
        });
        if (filter !== "all") params.set("status", filter);

        const res = await fetch(`/api/posts?${params}`, { credentials: "include" });
        if (!res.ok) return;
        const data = unwrap(await res.json());

        setPosts((prev) => (append ? [...prev, ...data.posts] : data.posts));
        setPagination(data.pagination);
      } catch {}
      finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeBrandId]
  );

  useEffect(() => {
    if (activeBrandId) {
      setPosts([]);
      fetchPosts(activeFilter, 1, false);
    }
  }, [activeFilter, activeBrandId, fetchPosts]);

  // Sync filter from URL param (KPI card deep links)
  useEffect(() => {
    if (filterFromUrl && filterFromUrl !== activeFilter) {
      setActiveFilter(filterFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFromUrl]);

  const handleFilterChange = (key: string) => {
    setActiveFilter(key);
    router.replace(`/dashboard/content-hub${key !== "all" ? `?filter=${key}` : ""}`, {
      scroll: false,
    });
  };

  const handlePostUpdate = (updated: Post) => {
    setPosts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    if (selectedPost?._id === updated._id) setSelectedPost(updated);
  };

  // Partial-patch optimistic updater. Merges `updates` into the matching
  // post in the local list and into `selectedPost` if it's the same row.
  // Use this for immediate UI feedback right after a successful API call,
  // even if the server response shape is unexpected. The full-post
  // `handlePostUpdate(data.post)` reconciler still runs afterwards to
  // bring server-derived fields (approvedAt, lockedAt, …) back in sync.
  const updatePostInList = useCallback(
    (postId: string, updates: Partial<Post>) => {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, ...updates } : p))
      );
      setSelectedPost((prev) =>
        prev && prev._id === postId ? { ...prev, ...updates } : prev
      );
    },
    []
  );

  const handleLoadMore = () => {
    if (pagination?.hasMore && !loadingMore) {
      fetchPosts(activeFilter, (pagination.page ?? 1) + 1, true);
    }
  };

  // Open ScheduleModal for one of four flows. The detail modal stays
  // open underneath so closing the schedule modal returns the user to
  // it; on success we close both.
  const openSchedule = (
    post: Post,
    mode: "schedule" | "reschedule" | "approve-and-schedule" | "suggest-time-send"
  ) => {
    setScheduleTarget({ post, mode });
  };

  // Deep-link from the calendar day panel / Day view: there is no standalone
  // post page, so "View" / "Reschedule" land here as
  // /dashboard/content-hub?post=<id>[&reschedule=true]. Fetch the post by id
  // (it may not be on the current page) and open its detail modal, or the
  // reschedule flow. Runs once on mount; strips the params so a refresh won't
  // reopen it.
  useEffect(() => {
    const postId = searchParams.get("post");
    if (!postId) return;
    const wantReschedule = searchParams.get("reschedule") === "true";
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${postId}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = unwrap<{ post?: Post }>(await res.json());
        if (!data?.post || cancelled) return;
        if (wantReschedule) openSchedule(data.post, "reschedule");
        else setSelectedPost(data.post);
      } catch {
        // A bad / forbidden id simply opens nothing.
      }
    })();
    // Strip ?post=…&reschedule=… so a later refresh doesn't reopen the modal.
    window.history.replaceState(null, "", window.location.pathname);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Member: "Suggest & Send for Review" — submits the chosen time as
  // requestedPublishTime and transitions the post to "review". Returns
  // null on success (modal will close), error string on failure. The
  // platform argument from the modal is informational here — the post
  // already has a platform from creation, so we don't update it.
  const handleSuggestTimeSend = async (when: Date, _platform: string): Promise<string | null> => {
    if (!scheduleTarget) return "No post selected";
    const post = scheduleTarget.post;
    setScheduleSuggesting(true);
    try {
      const res = await fetch(`/api/posts/${post._id}/submit-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requestedPublishTime: when.toISOString() }),
      });
      const data = unwrap(await res.json().catch(() => ({})));
      if (!res.ok) return data.error ?? "Failed to submit for review";
      updatePostInList(post._id, {
        status: "review",
        requestedPublishTime: when.toISOString(),
      });
      handlePostUpdate(data.post);
      setScheduleTarget(null);
      // Also close the detail modal if it was open on this post — the
      // member just sent it for review, the next view is the review
      // queue (which they can't open anyway).
      if (selectedPost?._id === post._id) setSelectedPost(null);
      return null;
    } catch {
      return "Network error";
    } finally {
      setScheduleSuggesting(false);
    }
  };

  // ScheduleModal.onSave — null scheduledFor in Content Hub flows is a
  // no-op (Save-to-Library doesn't have a meaningful interpretation for
  // posts that already exist). Returns null on success, error string on
  // failure (the modal renders it inline without unmounting).
  const handleScheduleSave = async (
    scheduledFor: Date | null,
    _platform: string
  ): Promise<string | null> => {
    if (!scheduleTarget) return "No post selected";
    if (!scheduledFor) {
      // Save-to-Library inside an existing-post flow: just close the modal.
      setScheduleTarget(null);
      return null;
    }
    const { post, mode } = scheduleTarget;
    setScheduleSaving(true);
    try {
      const iso = scheduledFor.toISOString();

      if (mode === "approve-and-schedule") {
        // Two-call: first set scheduledFor on the review post, then run
        // the standard approve flow. The approve route reads the (now
        // future) scheduledFor and transitions status → "scheduled" with
        // the audit fields (approvedAt, moderatedBy, moderatedAt) set.
        const r1 = await fetch(`/api/posts/${post._id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "review", scheduledFor: iso }),
        });
        if (!r1.ok) {
          const d = unwrap(await r1.json().catch(() => ({})));
          return d.error ?? "Failed to set scheduled time";
        }
        const r2 = await fetch(`/api/posts/${post._id}/approve`, {
          method: "PATCH",
          credentials: "include",
        });
        const d2 = unwrap(await r2.json().catch(() => ({})));
        if (!r2.ok) return d2.error ?? "Failed to approve";
        if (d2.requiresReschedule) return "Selected time has already passed.";
        updatePostInList(post._id, { status: "scheduled", scheduledFor: iso });
        handlePostUpdate(d2.post);
      } else {
        // schedule + reschedule: single PATCH /status with the new time.
        const res = await fetch(`/api/posts/${post._id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "scheduled", scheduledFor: iso }),
        });
        const data = unwrap(await res.json().catch(() => ({})));
        if (!res.ok) return data.error ?? "Failed to schedule";
        updatePostInList(post._id, { status: "scheduled", scheduledFor: iso });
        handlePostUpdate(data.post);
      }

      setScheduleTarget(null);
      return null;
    } catch {
      return "Network error";
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleDeleteConfirmed = (deletedId: string) => {
    setPosts((prev) => prev.filter((p) => p._id !== deletedId));
    if (selectedPost?._id === deletedId) setSelectedPost(null);
    setDeleteTarget(null);
  };

  // ScheduleModal Post Now — admin override that publishes immediately.
  // Closes the modal on success, returns the error string on failure so
  // the modal can render it without unmounting.
  const handleSchedulePublishNow = async (platform: string): Promise<string | null> => {
    const target = scheduleTarget?.post;
    if (!target) return "No post selected";
    setSchedulePublishingNow(true);
    try {
      const res = await fetch(`/api/posts/${target._id}/publish-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform }),
      });
      const data = unwrap(await res.json().catch(() => ({})));
      if (res.ok) {
        updatePostInList(target._id, {
          status: "published",
          publishedAt: new Date().toISOString(),
        });
      } else {
        updatePostInList(target._id, { status: "failed" });
      }
      if (data?.post) handlePostUpdate(data.post);
      if (!res.ok) {
        return data.error ?? "Failed to publish";
      }
      setScheduleTarget(null);
      return null;
    } catch {
      return "Network error";
    } finally {
      setSchedulePublishingNow(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes qs-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        @keyframes qs-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      {/* Outer page wrapper — no padding/margin/max-width. The
          dashboard layout shell owns all outer spacing. */}
      <div>
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h1 style={{ fontSize: 26, fontWeight: 500, color: "#ffffff", margin: 0 }}>
            All Post
          </h1>
          <Link
            href="/dashboard/posts/create"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 18px",
              borderRadius: 10,
              background: "#ffffff",
              color: "#0a0a0a",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Plus size={14} />
            New Post
          </Link>
        </div>

        {/* ── Filter tabs ── */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {FILTER_TABS.map((tab) => {
            const active = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleFilterChange(tab.key)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  border: active ? "none" : "1px solid rgba(255,255,255,0.18)",
                  background: active ? "#ffffff" : "transparent",
                  color: active ? "#0a0a0a" : "rgba(255,255,255,0.65)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Post Grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {loading ? (
            Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)
          ) : posts.length === 0 ? (
            <EmptyState filter={activeFilter} />
          ) : (
            posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onClick={() => setSelectedPost(post)}
                onPostUpdate={handlePostUpdate}
                onPatch={updatePostInList}
                onSchedule={openSchedule}
                onDelete={(p) => setDeleteTarget(p)}
              />
            ))
          )}
        </div>

        {/* ── Load More ── */}
        {!loading && pagination?.hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: "10px 32px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.20)",
                background: "rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.80)",
                fontSize: 13,
                fontWeight: 500,
                cursor: loadingMore ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? (
                "Loading…"
              ) : (
                <>
                  <ChevronDown size={15} />
                  Load More ({pagination.total - posts.length} remaining)
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Post Detail Modal ── */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onPostUpdate={handlePostUpdate}
          onPatch={updatePostInList}
          onSchedule={openSchedule}
          onDelete={(p) => setDeleteTarget(p)}
        />
      )}

      {/* ── Schedule Modal — opens on Schedule / Reschedule / Approve-&-Schedule
            (admin) or Suggest-Time-&-Send (member) from PostCard or
            PostDetailModal. Pre-fills the calendar from post.scheduledFor
            when present, or from requestedPublishTime for review/draft posts.
            brandId is required for the connected-platforms fetch inside the
            modal. ── */}
      {scheduleTarget && activeBrandId && (
        <ScheduleModal
          brandId={activeBrandId}
          imageUrl={
            scheduleTarget.post.aiImageUrl ||
            (scheduleTarget.post.imageUrls && scheduleTarget.post.imageUrls.length > 0
              ? scheduleTarget.post.imageUrls[0]
              : "")
          }
          caption={scheduleTarget.post.content}
          platform={scheduleTarget.post.platform}
          initialScheduledFor={
            scheduleTarget.post.scheduledFor
              ? new Date(scheduleTarget.post.scheduledFor)
              : scheduleTarget.post.requestedPublishTime
              ? new Date(scheduleTarget.post.requestedPublishTime)
              : null
          }
          onClose={() => setScheduleTarget(null)}
          onSave={handleScheduleSave}
          saving={scheduleSaving}
          isAdmin={isAdmin}
          onPublishNow={
            scheduleTarget.mode === "suggest-time-send"
              ? undefined
              : handleSchedulePublishNow
          }
          publishingNow={schedulePublishingNow}
          mode={scheduleTarget.mode === "suggest-time-send" ? "suggest" : "schedule"}
          onSuggestTime={
            scheduleTarget.mode === "suggest-time-send" ? handleSuggestTimeSend : undefined
          }
          suggesting={scheduleSuggesting}
        />
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <DeleteConfirmModal
          postId={deleteTarget._id}
          onCancel={() => setDeleteTarget(null)}
          onConfirmed={handleDeleteConfirmed}
        />
      )}
    </>
  );
}
