"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import Link from "next/link";
import {
  MoreHorizontal, MessageSquare, Smile, Globe, Trophy, ThumbsUp, X, Pin,
  Megaphone, PartyPopper, Cake, UserPlus, Vote, CalendarDays, Send, Heart, Sparkles,
  Pencil, Trash2, Share2, ClipboardList, Lock, ChevronRight, CheckCircle2,
  ChevronLeft, Clock, XCircle,
} from "lucide-react";
import { clsx } from "clsx";

type ReactionKey = "like" | "love" | "haha" | "wow" | "sad" | "celebrate";
const REACTIONS: { key: ReactionKey; emoji: string; label: string; color: string }[] = [
  { key: "like",      emoji: "👍", label: "Like",      color: "text-[#166534]" },
  { key: "love",      emoji: "❤️", label: "Love",      color: "text-red-600" },
  { key: "haha",      emoji: "😂", label: "Haha",      color: "text-amber-600" },
  { key: "wow",       emoji: "😮", label: "Wow",       color: "text-amber-600" },
  { key: "sad",       emoji: "😢", label: "Sad",       color: "text-sky-600" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate", color: "text-pink-600" },
];

interface ReactionPickerProps {
  selected: ReactionKey | null;
  count: number;
  onPick: (key: ReactionKey) => void;
  onToggleClear: () => void;
  disabled?: boolean;
}

function ReactionPicker({ selected, count, onPick, onToggleClear, disabled }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const current = selected ? REACTIONS.find((r) => r.key === selected) : null;

  return (
    <div ref={ref} className="relative" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (selected) onToggleClear(); else onPick("like"); }}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        className={clsx(
          "w-full flex items-center justify-center gap-2 py-1 px-2.5 text-xs font-normal rounded-lg transition disabled:opacity-60",
          current ? `${current.color} bg-gray-50 font-semibold` : "text-gray-600 hover:bg-gray-50",
        )}
      >
        {current ? <span className="text-base leading-none">{current.emoji}</span> : <Smile size={12} />}
        {current ? current.label : "React"}
        {count > 0 && <span className="text-xs text-gray-500 font-normal">({count})</span>}
      </button>

      {open && !disabled && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center gap-1 px-2 py-1.5 bg-white rounded-full shadow-lg border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-150"
        >
          {REACTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { onPick(r.key); setOpen(false); }}
              title={r.label}
              className={clsx(
                "text-2xl leading-none p-1 rounded-full transition-transform hover:scale-125 hover:-translate-y-0.5",
                selected === r.key && "ring-2 ring-[#166534]/30 bg-[#166534]/5",
              )}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PostAttachment {
  type: "image" | "video";
  url: string;
  fileName?: string;
  mimeType?: string;
}

interface PollOption {
  id: string;
  text: string;
  votes: string[];
}

interface PollData {
  question: string;
  options: PollOption[];
  allowMultiple?: boolean;
  closesAt?: string | null;
}

interface Post {
  id: string;
  type: "Update" | "Announcement" | "RecognitionPost" | "Birthday" | "WorkAnniversary" | "NewJoiner" | "Poll" | "Event";
  content: string;
  createdAt: string;
  visibility: string;
  isPinned: boolean;
  approvalStatus: "Pending" | "Approved" | "Rejected";
  rejectionReason: string | null;
  likes: string[] | null;
  attachments: PostAttachment[] | null;
  pollData: PollData | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    profilePhoto: string | null;
    jobTitle: string | null;
  } | null;
  comments: { id: string; content: string; createdAt: string; employee: { id: string; firstName: string; lastName: string } | null }[];
  _count: { comments: number };
}

interface Recognition {
  id: string;
  type: "Appreciation" | "Achievement" | "Teamwork" | "Innovation";
  message: string;
  createdAt: string;
  fromEmployee: { id: string; firstName: string; lastName: string; profilePhoto: string | null } | null;
  toEmployee: { id: string; firstName: string; lastName: string; profilePhoto: string | null; jobTitle: string | null } | null;
}

interface MySurvey {
  id: string;
  title: string;
  type: string;
  isAnonymous: boolean;
  startDate: string;
  endDate: string;
  questionCount: number;
  hasResponded: boolean;
}

function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface PostTypeTheme {
  label: string;
  Icon: LucideIcon;
  badgeBg: string;
  badgeRing: string;
  iconColor: string;
  accentBar: string;
}

const POST_TYPE_THEME: Record<Post["type"], PostTypeTheme> = {
  Update:           { label: "Update",          Icon: Sparkles,     badgeBg: "bg-slate-50 text-slate-700",     badgeRing: "ring-slate-200",   iconColor: "text-slate-500",   accentBar: "from-slate-400/0 to-slate-400/0" },
  Announcement:     { label: "Announcement",    Icon: Megaphone,    badgeBg: "bg-green-50 text-green-700",       badgeRing: "ring-green-200",    iconColor: "text-green-600",    accentBar: "from-green-500 to-green-500" },
  RecognitionPost:  { label: "Recognition",     Icon: Trophy,       badgeBg: "bg-amber-50 text-amber-700",     badgeRing: "ring-amber-200",   iconColor: "text-amber-600",   accentBar: "from-amber-400 to-orange-400" },
  Birthday:         { label: "Birthday",        Icon: Cake,         badgeBg: "bg-pink-50 text-pink-700",       badgeRing: "ring-pink-200",    iconColor: "text-pink-500",    accentBar: "from-pink-400 to-rose-400" },
  WorkAnniversary:  { label: "Work Anniversary",Icon: PartyPopper,  badgeBg: "bg-violet-50 text-violet-700",   badgeRing: "ring-violet-200",  iconColor: "text-violet-500",  accentBar: "from-violet-500 to-fuchsia-500" },
  NewJoiner:        { label: "New Joiner",      Icon: UserPlus,     badgeBg: "bg-emerald-50 text-emerald-700", badgeRing: "ring-emerald-200", iconColor: "text-emerald-600", accentBar: "from-emerald-400 to-teal-500" },
  Poll:             { label: "Poll",            Icon: Vote,         badgeBg: "bg-sky-50 text-sky-700",         badgeRing: "ring-sky-200",     iconColor: "text-sky-600",     accentBar: "from-sky-500 to-cyan-500" },
  Event:            { label: "Event",           Icon: CalendarDays, badgeBg: "bg-purple-50 text-purple-700",   badgeRing: "ring-purple-200",  iconColor: "text-purple-600",  accentBar: "from-purple-500 to-fuchsia-500" },
};

const AVATAR_GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-green-500 to-green-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-violet-500 to-fuchsia-600",
  "from-sky-500 to-cyan-600",
];

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

export function SocialFeed() {
  const api = useApiClient();
  const { data: postsRes } = useQuery({
    queryKey: ["home", "feed", "posts"],
    queryFn: () => api.get<Post[]>("/api/v1/hrms/engage/social?limit=10"),
    staleTime: 15_000,
  });
  const { data: recRes } = useQuery({
    queryKey: ["home", "feed", "recognition"],
    queryFn: () => api.get<Recognition[]>("/api/v1/hrms/engage/recognition?limit=5"),
    staleTime: 15_000,
  });
  const { data: surRes } = useQuery({
    queryKey: ["home", "feed", "surveys"],
    queryFn: () => api.get<MySurvey[]>("/api/v1/hrms/engage/surveys/my"),
    staleTime: 15_000,
  });

  const posts = postsRes?.data ?? [];
  const recognitions = recRes?.data ?? [];
  const surveys = (surRes?.data ?? []).filter((s) => !s.hasResponded);

  // Merge + sort
  type FeedItem =
    | { kind: "post"; data: Post; createdAt: string }
    | { kind: "recognition"; data: Recognition; createdAt: string }
    | { kind: "survey"; data: MySurvey; createdAt: string };

  // Pending surveys pinned to top (closing-soonest first), then posts + recognition by createdAt desc
  const surveyItems: FeedItem[] = surveys
    .map((s) => ({ kind: "survey" as const, data: s, createdAt: s.startDate }))
    .sort((a, b) => new Date(a.data.endDate).getTime() - new Date(b.data.endDate).getTime());

  const socialItems: FeedItem[] = [
    ...posts.map((p) => ({ kind: "post" as const, data: p, createdAt: p.createdAt })),
    ...recognitions.map((r) => ({ kind: "recognition" as const, data: r, createdAt: r.createdAt })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const items: FeedItem[] = [...surveyItems, ...socialItems];

  if (items.length === 0) {
    return (
      <div className="surface-card py-14 text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-50 to-green-50 ring-1 ring-green-100 mx-auto mb-3 flex items-center justify-center">
          <Sparkles size={20} className="text-green-500" />
        </div>
        <p className="text-[13px] font-semibold text-gray-900">Nothing on the wall yet</p>
        <p className="text-xs text-gray-500 mt-1">Be the first — share an update, kudos or poll above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-sm">
            <Sparkles size={14} className="text-white" />
          </div>
          <h3 className="text-[13px] font-semibold text-gray-900">Social Wall</h3>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">{items.length}</span>
        </div>
      </div>
      {items.map((it) => {
        if (it.kind === "post") return <PostCard key={`p-${it.data.id}`} post={it.data} />;
        if (it.kind === "recognition") return <KudosCard key={`r-${it.data.id}`} recognition={it.data} />;
        return <SurveyCard key={`s-${it.data.id}`} survey={it.data} />;
      })}
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const { employee: me } = useDashboardConfig();
  const myId = me?.id;
  const emp = post.employee;
  const initials = emp ? `${emp.firstName[0] ?? ""}${emp.lastName[0] ?? ""}`.toUpperCase() : "?";
  const [showComments, setShowComments] = useState(post._count.comments > 0);
  const [comment, setComment] = useState("");

  const commentMut = useMutation({
    mutationFn: (content: string) => api.post(`/api/v1/hrms/engage/social/${post.id}/comments`, { content }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["home", "feed", "posts"] });
    },
  });

  const reactMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/engage/social/${post.id}`, { action: "like" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home", "feed", "posts"] }),
  });

  const editMut = useMutation({
    mutationFn: (content: string) => api.patch(`/api/v1/hrms/engage/social/${post.id}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home", "feed", "posts"] });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      setIsEditing(false);
      toast.success("Post updated");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/engage/social/${post.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home", "feed", "posts"] });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Post deleted");
    },
  });

  const likes = Array.isArray(post.likes) ? post.likes : [];
  const liked = !!myId && likes.includes(myId);
  const [myReaction, setMyReaction] = useState<ReactionKey | null>(liked ? "like" : null);
  // myId resolves asynchronously (dashboard config) and the feed refetches after
  // each like, so `liked` can flip true *after* this card first mounts. Re-sync
  // the reaction highlight to the persisted state, otherwise the user's own like
  // looks like it disappears on refresh even though it's saved server-side.
  useEffect(() => {
    setMyReaction(liked ? "like" : null);
  }, [liked]);
  const [showLikers, setShowLikers] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwner = !!myId && emp?.id === myId;
  const isPoll = post.type === "Poll";

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const pickReaction = (k: ReactionKey) => {
    if (!liked) reactMut.mutate();
    setMyReaction(k);
  };
  const clearReaction = () => {
    if (liked) reactMut.mutate();
    setMyReaction(null);
  };

  const theme = POST_TYPE_THEME[post.type];
  const TypeIcon = theme.Icon;
  const grad = gradientFor(emp?.id ?? post.id);

  return (
    <div className="surface-card overflow-hidden relative transition hover:shadow-md">
      {post.isPinned && (
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[11px] font-medium z-10">
          <Pin size={10} fill="currentColor" /> Pinned
        </div>
      )}
      {post.type !== "Update" && (
        <div className={clsx("h-1 bg-gradient-to-r", theme.accentBar)} />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {emp?.profilePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emp.profilePhoto} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow" />
            ) : (
              <div className={clsx("w-11 h-11 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm ring-2 ring-white shadow", grad)}>
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{emp ? `${emp.firstName} ${emp.lastName}` : "Unknown"}</p>
                {post.type !== "Update" && (
                  <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1", theme.badgeBg, theme.badgeRing)}>
                    <TypeIcon size={10} className={theme.iconColor} /> {theme.label}
                  </span>
                )}
                {post.approvalStatus === "Pending" && (
                  <span title="Only you (and moderators) can see this until it's approved"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 bg-amber-50 text-amber-700 ring-amber-200">
                    <Clock size={10} /> Pending approval
                  </span>
                )}
                {post.approvalStatus === "Rejected" && (
                  <span title={post.rejectionReason ?? undefined}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 bg-red-50 text-red-700 ring-red-200">
                    <XCircle size={10} /> Rejected
                  </span>
                )}
              </div>
              {emp?.jobTitle && <p className="text-[11px] text-gray-500 truncate">{emp.jobTitle}</p>}
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                {timeAgo(post.createdAt)} <span>·</span> <Globe size={10} />
              </p>
              {post.approvalStatus === "Rejected" && post.rejectionReason && (
                <p className="text-[11px] text-red-600 mt-0.5">Reason: {post.rejectionReason}</p>
              )}
            </div>
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"
            >
              <MoreHorizontal size={12} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden z-20">
                {isOwner ? (
                  <>
                    <button
                      onClick={() => { setEditContent(post.content); setIsEditing(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-gray-700 hover:bg-slate-50 hover:text-green-600 transition"
                    >
                      <Pencil size={13} /> Edit post
                    </button>
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        const ok = await dialog.confirm({
                          title: "Delete this post?",
                          description: "This action cannot be undone.",
                          variant: "danger",
                          confirmLabel: "Delete",
                        });
                        if (ok) deleteMut.mutate();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 size={13} /> Delete post
                    </button>
                  </>
                ) : (
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-gray-500" disabled>
                    Author-only actions
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="mt-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs bg-gray-50 ring-1 ring-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300 focus:bg-white transition resize-none"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => { setIsEditing(false); setEditContent(post.content); }}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!editContent.trim() || editContent.trim() === post.content || editMut.isPending}
                onClick={() => editMut.mutate(editContent.trim())}
                className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {editMut.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-800 whitespace-pre-line leading-relaxed">
            {post.content}
          </div>
        )}

        {post.attachments && post.attachments.length > 0 && (
          <MediaGrid items={post.attachments} />
        )}

        {post.pollData && <InteractivePoll postId={post.id} poll={post.pollData} />}

        {(likes.length > 0 || post._count.comments > 0) && (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            {likes.length > 0 ? (
              <button
                onClick={() => setShowLikers(true)}
                className="inline-flex items-center gap-2 hover:text-green-600 hover:underline transition"
                title="View who liked this"
              >
                <span className="flex -space-x-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white ring-2 ring-white">
                    <ThumbsUp size={10} fill="currentColor" />
                  </span>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white ring-2 ring-white">
                    <Heart size={10} fill="currentColor" />
                  </span>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 ring-2 ring-white text-[10px]">😂</span>
                </span>
                <span><span className="font-semibold text-gray-700">{likes.length}</span> {likes.length === 1 ? "person" : "people"}</span>
              </button>
            ) : <span />}
            {post._count.comments > 0 && (
              <button
                onClick={() => setShowComments((s) => !s)}
                className="hover:text-green-600 hover:underline transition"
              >
                {post._count.comments} {post._count.comments === 1 ? "comment" : "comments"}
              </button>
            )}
          </div>
        )}

        <div className="mt-2 grid grid-cols-3 border-t border-gray-100 pt-1 gap-1">
          <ReactionPicker
            selected={myReaction}
            count={0}
            onPick={pickReaction}
            onToggleClear={clearReaction}
            disabled={reactMut.isPending}
          />
          <button
            onClick={() => setShowComments((s) => !s)}
            className={clsx(
              "flex items-center justify-center gap-2 py-1 px-2.5 text-xs font-normal rounded-lg transition",
              showComments ? "text-green-600 bg-green-50/60" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
            )}
          >
            <MessageSquare size={12} /> Comment
          </button>
          <button
            onClick={async () => {
              const url = `${window.location.origin}/dashboard?postId=${post.id}`;
              try {
                if (navigator.share) {
                  await navigator.share({ title: "Shared from social wall", text: post.content.slice(0, 120), url });
                } else {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copied", "Paste it anywhere to share.");
                }
              } catch { /* user cancelled */ }
            }}
            className="flex items-center justify-center gap-2 py-1 px-2.5 text-xs font-normal text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition"
          >
            <Share2 size={12} /> Share
          </button>
        </div>

        {showComments && (
          <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
            {post.comments.map((c) => {
              const cInitials = c.employee ? `${c.employee.firstName[0] ?? ""}${c.employee.lastName[0] ?? ""}`.toUpperCase() : "?";
              const cGrad = gradientFor(c.employee?.id ?? c.id);
              return (
                <div key={c.id} className="flex items-start gap-2">
                  <div className={clsx("w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-white shadow-sm", cGrad)}>
                    {cInitials}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                    <p className="text-xs font-bold text-gray-900">
                      {c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : "Unknown"}
                      <span className="text-gray-400 font-normal ml-2">{timeAgo(c.createdAt)}</span>
                    </p>
                    <p className="text-xs text-gray-700 mt-0.5">{c.content}</p>
                  </div>
                </div>
              );
            })}
            <form
              onSubmit={(e) => { e.preventDefault(); if (comment.trim()) commentMut.mutate(comment); }}
              className="flex items-center gap-2 pt-1"
            >
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 px-4 py-2 bg-gray-50 ring-1 ring-gray-200 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-green-300 focus:bg-white transition"
              />
              <button
                type="submit"
                disabled={!comment.trim() || commentMut.isPending}
                className="w-9 h-9 rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white flex items-center justify-center transition shrink-0"
                aria-label="Post comment"
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        )}
      </div>

      {showLikers && <LikersModal postId={post.id} count={likes.length} onClose={() => setShowLikers(false)} />}
    </div>
  );
}

function InteractivePoll({ postId, poll }: { postId: string; poll: PollData }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { employee: me } = useDashboardConfig();
  const myId = me?.id;

  const totalVotes = poll.options.reduce((s, o) => s + (Array.isArray(o.votes) ? o.votes.length : 0), 0);
  const myVotes = poll.options.filter((o) => Array.isArray(o.votes) && !!myId && o.votes.includes(myId)).map((o) => o.id);
  const closed = !!poll.closesAt && new Date(poll.closesAt).getTime() < Date.now();

  const voteMut = useMutation({
    mutationFn: (optionId: string) => api.post(`/api/v1/hrms/engage/social/${postId}/vote`, { optionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home", "feed", "posts"] });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
  });

  return (
    <div className="mt-3 rounded-xl ring-1 ring-sky-200 bg-gradient-to-br from-sky-50/60 to-cyan-50/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
          <Vote size={14} className="text-sky-600" />
        </div>
        <p className="text-[13px] font-semibold text-gray-900 flex-1">{poll.question}</p>
        {closed && (
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-[11px] font-medium uppercase tracking-wider">
            Closed
          </span>
        )}
      </div>
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const votes = Array.isArray(opt.votes) ? opt.votes.length : 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const mine = myVotes.includes(opt.id);
          const leader = totalVotes > 0 && votes === Math.max(...poll.options.map((o) => (Array.isArray(o.votes) ? o.votes.length : 0)));
          return (
            <button
              key={opt.id}
              type="button"
              disabled={closed || voteMut.isPending}
              onClick={() => voteMut.mutate(opt.id)}
              className={clsx(
                "relative w-full overflow-hidden rounded-lg ring-1 transition text-left disabled:cursor-not-allowed",
                mine
                  ? "ring-2 ring-green-500 bg-white"
                  : "ring-gray-200 bg-white hover:ring-green-300 hover:bg-green-50/40",
              )}
            >
              <div
                className={clsx(
                  "absolute inset-y-0 left-0 transition-all duration-300",
                  mine ? "bg-green-100/60" : leader && totalVotes > 0 ? "bg-sky-100/50" : "bg-gray-100/60",
                )}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {mine && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-600 text-white shrink-0">
                      <CheckIcon />
                    </span>
                  )}
                  <span className={clsx("text-[13px] truncate", mine ? "font-bold text-green-700" : "font-medium text-gray-800")}>
                    {opt.text}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={clsx("text-xs font-semibold tabular-nums", mine ? "text-green-700" : "text-gray-600")}>{pct}%</span>
                  <span className="text-[11px] text-gray-400 tabular-nums">({votes})</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}{poll.allowMultiple ? " · multiple choice" : ""}</span>
        {!closed && <span>Click to vote · click again to remove</span>}
      </div>
    </div>
  );
}

function CheckIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,5 4,7 8,3" /></svg>;
}

function MediaGrid({ items }: { items: PostAttachment[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const n = items.length;
  const cls = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : n === 3 ? "grid-cols-3" : "grid-cols-2";
  const display = items.slice(0, 4);
  const more = n - display.length;

  return (
    <>
      <div className={clsx("mt-3 grid gap-1.5 rounded-2xl overflow-hidden", cls)}>
        {display.map((m, i) => {
          const showMoreOverlay = i === display.length - 1 && more > 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className={clsx(
                "relative bg-gray-100 cursor-zoom-in group focus:outline-none focus:ring-2 focus:ring-green-400",
                n === 1 && "h-80",
                n === 2 && "h-56",
                n >= 3 && "h-44",
              )}
              aria-label={`Open ${m.type} ${i + 1} of ${n}`}
            >
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.fileName ?? ""} className="w-full h-full object-cover transition group-hover:opacity-95" />
              ) : (
                <>
                  {/* Show video as a poster-like preview in the grid — full controls are in the lightbox */}
                  <video src={m.url} className="w-full h-full object-cover bg-black pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-black/55 ring-1 ring-white/30 flex items-center justify-center backdrop-blur-sm group-hover:scale-105 transition">
                      <PlayIcon />
                    </div>
                  </div>
                </>
              )}
              {showMoreOverlay && (
                <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-3xl font-bold">
                  +{more}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={items}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function MediaLightbox({
  items,
  startIndex,
  onClose,
}: {
  items: PostAttachment[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [mounted, setMounted] = useState(false);
  const total = items.length;

  const prev = () => setIndex((i) => (i - 1 + total) % total);
  const next = () => setIndex((i) => (i + 1) % total);

  // Mount-flag so the portal only renders client-side (avoids SSR document access).
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    // Prevent background scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  const current = items[index];

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
    >
      {/* Counter (top-left) */}
      <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white text-sm font-semibold tabular-nums">
        {index + 1} / {total}
      </span>

      {/* Close (top-right) — large, high-contrast, always visible */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white text-gray-900 hover:bg-gray-100 shadow-lg ring-1 ring-black/10 flex items-center justify-center transition focus:outline-none focus:ring-2 focus:ring-green-400"
        aria-label="Close"
        title="Close (Esc)"
      >
        <X size={22} strokeWidth={2.5} />
      </button>

      {/* Prev */}
      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-sm text-white flex items-center justify-center transition"
          aria-label="Previous"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Main slide */}
      <div
        className="relative max-w-[92vw] max-h-[80vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {current.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.fileName ?? ""}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        ) : (
          <video
            src={current.url}
            controls
            autoPlay
            className="max-w-full max-h-[80vh] rounded-lg bg-black"
          />
        )}
      </div>

      {/* Next */}
      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-sm text-white flex items-center justify-center transition"
          aria-label="Next"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Thumbnail strip */}
      {total > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-2 rounded-xl bg-white/10 backdrop-blur-sm max-w-[90vw] overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={clsx(
                "relative w-12 h-12 rounded-md overflow-hidden shrink-0 ring-1 transition",
                i === index ? "ring-2 ring-white" : "ring-white/20 hover:ring-white/60 opacity-70 hover:opacity-100",
              )}
              aria-label={`Go to ${m.type} ${i + 1}`}
            >
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-black flex items-center justify-center">
                  <PlayIcon />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* File name caption */}
      {current.fileName && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white/70 text-xs font-medium px-3 py-1 rounded bg-black/40 backdrop-blur-sm">
          {current.fileName}
        </div>
      )}
    </div>
  );

  // Portal to document.body so the lightbox escapes any sticky/transform
  // ancestor and reliably covers the entire viewport (including the home
  // page's sticky top bar at z-30).
  return createPortal(content, document.body);
}

interface Liker {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
  title: string | null;
}

function LikersModal({ postId, count, onClose }: { postId: string; count: number; onClose: () => void }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["post-likers", postId],
    queryFn: () => api.get<Liker[]>(`/api/v1/hrms/engage/social/${postId}/likers`),
    staleTime: 30_000,
  });
  const likers = data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white">
              <ThumbsUp size={11} fill="currentColor" />
            </span>
            <h3 className="text-[13px] font-semibold text-gray-900">{count} {count === 1 ? "Like" : "Likes"}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">
            <X size={12} />
          </button>
        </div>
        <div className="max-h-80 overflow-auto py-2">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-gray-500">Loading…</div>
          ) : likers.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">No likes yet</div>
          ) : (
            likers.map((p) => {
              const initials = `${(p.firstName?.[0] ?? "").toUpperCase()}${(p.lastName?.[0] ?? "").toUpperCase()}`;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
                  {p.profilePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.profilePhoto} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-[11px] font-bold text-white">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{p.firstName} {p.lastName}</p>
                    {p.title && <p className="text-[11px] text-gray-500 truncate">{p.title}</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function KudosCard({ recognition }: { recognition: Recognition }) {
  const to = recognition.toEmployee;
  const from = recognition.fromEmployee;
  const fromInit = from ? `${from.firstName[0] ?? ""}${from.lastName[0] ?? ""}`.toUpperCase() : "?";
  const toInit = to ? `${to.firstName[0] ?? ""}${to.lastName[0] ?? ""}`.toUpperCase() : "?";
  const [myReaction, setMyReaction] = useState<ReactionKey | null>(null);

  return (
    <div className="surface-card p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {from?.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={from.profilePhoto} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm">
              {fromInit}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate">{from ? `${from.firstName} ${from.lastName}` : "Someone"}</p>
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
              {timeAgo(recognition.createdAt)} <span>·</span> <Globe size={10} />
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700 shrink-0">
          <Trophy size={10} /> {recognition.type}
        </span>
      </div>

      {/* Message */}
      <p className="text-xs text-gray-800 mt-3 leading-relaxed">
        Great job, <span className="font-bold">{to ? `${to.firstName} ${to.lastName}` : "teammate"}</span> — {recognition.message}
      </p>

      {/* Recipient pill */}
      {to && (
        <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 ring-1 ring-gray-100">
          {to.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={to.profilePhoto} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-700">
              {toInit}
            </div>
          )}
          <span className="text-xs font-semibold text-gray-700">For {to.firstName}</span>
          {to.jobTitle && <span className="text-[11px] text-gray-400">· {to.jobTitle}</span>}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 border-t border-gray-100 mt-4 -mx-5 -mb-5">
        <div className="border-r border-gray-100 p-1">
          <ReactionPicker
            selected={myReaction}
            count={myReaction ? 1 : 0}
            onPick={(k) => setMyReaction(k)}
            onToggleClear={() => setMyReaction(null)}
          />
        </div>
        <button className="flex items-center justify-center gap-2 py-1 px-2.5 text-xs font-normal text-gray-600 hover:text-[#166534] hover:bg-gray-50 transition">
          <MessageSquare size={12} /> Comment
        </button>
      </div>
    </div>
  );
}

function ConfettiDots() {
  // Static decorative dots — animated via CSS
  const dots = [
    { x: 12, y: 18, color: "bg-red-400", size: "w-3 h-3" },
    { x: 78, y: 14, color: "bg-pink-400", size: "w-2.5 h-2.5" },
    { x: 88, y: 38, color: "bg-rose-500", size: "w-3 h-3" },
    { x: 22, y: 42, color: "bg-amber-400", size: "w-2 h-2" },
    { x: 8, y: 70, color: "bg-pink-500", size: "w-2.5 h-2.5" },
    { x: 92, y: 75, color: "bg-amber-500", size: "w-3 h-3" },
    { x: 65, y: 22, color: "bg-amber-300", size: "w-2 h-2" },
    { x: 30, y: 78, color: "bg-yellow-400", size: "w-2.5 h-2.5" },
    { x: 70, y: 82, color: "bg-amber-300", size: "w-2 h-2" },
    { x: 50, y: 12, color: "bg-pink-300", size: "w-2 h-2" },
  ];
  return (
    <>
      {dots.map((d, i) => (
        <span
          key={i}
          className={clsx("absolute rounded-full", d.color, d.size)}
          style={{ top: `${d.y}%`, left: `${d.x}%` }}
        />
      ))}
    </>
  );
}

function SurveyCard({ survey }: { survey: MySurvey }) {
  const left = Math.max(0, Math.ceil((new Date(survey.endDate).getTime() - Date.now()) / 86400000));
  const closingSoon = left <= 3;

  return (
    <article className="surface-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
          <ClipboardList size={18} className="text-green-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wider bg-green-50 text-green-700">
              Survey
            </span>
            <span className="text-[11px] text-gray-500">{survey.type.replace("Survey", "")}</span>
            {survey.isAnonymous && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <Lock size={9} /> Anonymous
              </span>
            )}
            {closingSoon && (
              <span className="text-[11px] font-semibold text-amber-600">
                · {left === 0 ? "Closes today" : `${left}d left`}
              </span>
            )}
          </div>

          <h3 className="text-[13px] font-semibold text-gray-900 mt-1.5 leading-snug">
            {survey.title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {survey.questionCount} {survey.questionCount === 1 ? "question" : "questions"} · Closes{" "}
            {new Date(survey.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </p>

          <p className="text-xs text-gray-600 mt-2.5">
            Your input is requested. Takes a minute.
          </p>

          <div className="flex items-center gap-2 mt-3.5">
            <Link
              href={`/engage/surveys/${survey.id}/take`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-[#15803d] transition"
            >
              <CheckCircle2 size={13} /> Take survey
            </Link>
            <Link
              href="/engage/surveys/my"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              All surveys <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
