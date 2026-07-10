"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Trophy, BarChart3, Send, X, Sparkles, Image as ImageIcon, Video, Loader2, Smile, Globe, Users, ChevronDown, ChevronRight, Lock, CalendarClock, Star } from "lucide-react";
import { clsx } from "clsx";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { useDialog } from "@/components/hrms/dialog";
import confetti from "canvas-confetti";

interface MediaItem {
  type: "image" | "video";
  url: string;
  fileName: string;
  mimeType: string;
}

interface MediaUpload extends MediaItem {
  id: string;
  status: "uploading" | "done" | "error";
  localPreviewUrl?: string;
  error?: string;
}

const MAX_IMAGE_COUNT = 5;
const MAX_VIDEO_COUNT = 1;
const MAX_MEDIA_COUNT = 5;
const MAX_IMAGE_MB = 5;
const MAX_VIDEO_MB = 100;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Me {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  profilePhoto: string | null;
}

type Mode = "shoutout" | "kudos" | "poll" | null;

function fireConfetti() {
  const duration = 1200;
  const end = Date.now() + duration;
  const colors = ["#22c55e", "#4ade80", "#fbbf24", "#34d399", "#f472b6"];
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function ShoutoutComposer() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(null);

  const { data: meRes } = useQuery({
    queryKey: ["me", "shoutout"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const me = meRes?.data;

  const postMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/engage/social", body),
    onSuccess: (_d, vars) => {
      const isKudos = vars.type === "RecognitionPost";
      toast.success(isKudos ? "Kudos sent!" : "Posted", isKudos ? "Spreading the joy 🎉" : "Visible to your org.");
      if (isKudos) fireConfetti();
      qc.invalidateQueries({ queryKey: ["home", "feed"] });
      setMode(null);
    },
  });

  const kudosMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/engage/recognition", body),
    onSuccess: () => {
      toast.success("Kudos sent!", "Spreading the joy 🎉");
      fireConfetti();
      qc.invalidateQueries({ queryKey: ["home", "feed"] });
      setMode(null);
    },
  });

  const initials = me ? `${me.firstName[0] ?? ""}${me.lastName[0] ?? ""}`.toUpperCase() : "?";
  const firstName = me?.firstName ?? "there";

  const avatar = me?.profilePhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={me.profilePhoto} alt="" className="w-10 h-10 rounded-full ring-2 ring-white shadow object-cover shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white font-bold text-sm shadow shrink-0">
      {initials}
    </div>
  );

  return (
    <div className="surface-card overflow-hidden">
      {/* Trigger row: avatar + pill */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        {avatar}
        <button
          onClick={() => setMode("shoutout")}
          className="flex-1 text-left px-4 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200/80 text-sm text-gray-500 transition"
        >
          What&apos;s on your mind, {firstName}?
        </button>
      </div>

      {/* Quick action row */}
      <div className="grid grid-cols-3 border-t border-gray-100 px-2 py-1">
        <button
          onClick={() => setMode("shoutout")}
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition"
        >
          <ImageIcon size={13} className="text-emerald-500" /> Photo/video
        </button>
        <button
          onClick={() => setMode("kudos")}
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition"
        >
          <Trophy size={13} className="text-amber-500" /> Kudos
        </button>
        <button
          onClick={() => setMode("poll")}
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition"
        >
          <BarChart3 size={13} className="text-green-500" /> Poll
        </button>
      </div>

      {/* Shoutout modal */}
      <Modal
        open={mode === "shoutout"}
        onClose={() => setMode(null)}
        title="Create post"
        size="lg"
        bodyClassName="p-0 overflow-y-auto"
      >
        <ShoutoutForm
          me={me}
          submitting={postMut.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(content, attachments, visibility, scheduledAt) =>
            postMut.mutate({
              type: "Update", content, visibility,
              ...(attachments.length > 0 && { attachments }),
              ...(scheduledAt && { scheduledAt: new Date(scheduledAt).toISOString() }),
            })
          }
        />
      </Modal>

      {/* Kudos modal */}
      <Modal open={mode === "kudos"} onClose={() => setMode(null)} title="Give Kudos" size="md" bodyClassName="p-0 overflow-y-auto">
        <KudosForm
          submitting={kudosMut.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(body) => kudosMut.mutate(body)}
        />
      </Modal>

      {/* Poll modal */}
      <Modal open={mode === "poll"} onClose={() => setMode(null)} title="Create a poll" size="md" bodyClassName="p-0 overflow-y-auto">
        <PollForm
          submitting={postMut.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(question, options, allowMultiple) =>
            postMut.mutate({
              type: "Poll",
              content: question,
              visibility: "Organization",
              pollData: {
                question,
                options: options.map((text, i) => ({ id: `opt_${i}_${Date.now().toString(36)}`, text, votes: [] })),
                allowMultiple,
              },
            })
          }
        />
      </Modal>
    </div>
  );
}

type Visibility = "Organization" | "Department" | "Team" | "Custom";

const VISIBILITY_OPTIONS: { value: Visibility; label: string; Icon: LucideIcon; desc: string; visibleTo: string }[] = [
  { value: "Organization", label: "Organization", Icon: Globe, desc: "Anyone in your company",     visibleTo: "Only members of your organization can see this." },
  { value: "Department",   label: "Department",   Icon: Users, desc: "Just your department",       visibleTo: "Only people in your department can see this." },
  { value: "Team",         label: "Team",         Icon: Users, desc: "Just your team",             visibleTo: "Only people on your team can see this." },
];

const QUICK_EMOJIS = ["😀", "😂", "😍", "👏", "👍", "🎉", "🔥", "💯", "⭐", "✨", "🚀", "🎯"];

const MAX_LEN = 500;

function ShoutoutForm({ me, submitting, onCancel, onSubmit }: {
  me: Me | undefined;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (content: string, attachments: MediaItem[], visibility: Visibility, scheduledAt?: string) => void;
}) {
  const api = useApiClient();
  const toast = useToast();
  const dialog = useDialog();
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaUpload[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("Organization");
  const [showVisibility, setShowVisibility] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const visRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const imageCount = media.filter((item) => item.type === "image").length;
  const videoCount = media.filter((item) => item.type === "video").length;
  const totalCount = imageCount + videoCount;
  const remainingImages = Math.min(MAX_IMAGE_COUNT - imageCount, MAX_MEDIA_COUNT - totalCount);
  const uploadingCount = media.filter((m) => m.status === "uploading").length;
  const canAddImage = remainingImages > 0;
  const canAddVideo = videoCount < MAX_VIDEO_COUNT && totalCount < MAX_MEDIA_COUNT;

  const initials = me ? `${me.firstName[0] ?? ""}${me.lastName[0] ?? ""}`.toUpperCase() : "?";
  const visOpt = VISIBILITY_OPTIONS.find((v) => v.value === visibility) ?? VISIBILITY_OPTIONS[0];
  const VisibilityIcon = visOpt.Icon;
  const overLimit = content.length > MAX_LEN;

  // Outside-click closers
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (visRef.current && !visRef.current.contains(e.target as Node)) setShowVisibility(false);
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Fire-and-forget per-file uploads. Concurrent — does NOT block other UI.
  // Each file shows its own preview + status; the Post button waits only on
  // pending uploads (not on each other).
  const startUpload = (file: File, kind: "image" | "video") => {
    const localId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localPreviewUrl = URL.createObjectURL(file);

    setMedia((m) => [
      ...m,
      {
        id: localId,
        type: kind,
        status: "uploading",
        url: "",
        fileName: file.name,
        mimeType: file.type,
        localPreviewUrl,
      },
    ]);

    const fd = new FormData();
    fd.append("file", file);

    // Intentionally not awaited — runs in background.
    api.upload<{ url: string; fileName: string; fileType: string; fileSize: number }>(
      "/api/v1/hrms/uploads",
      fd,
    )
      .then((res) => {
        setMedia((m) =>
          m.map((item) =>
            item.id === localId
              ? {
                  ...item,
                  status: "done",
                  url: res.data.url,
                  fileName: res.data.fileName,
                  mimeType: res.data.fileType,
                }
              : item,
          ),
        );
      })
      .catch((err: Error) => {
        const msg = err?.message ?? "Upload failed";
        setMedia((m) =>
          m.map((item) =>
            item.id === localId ? { ...item, status: "error", error: msg } : item,
          ),
        );
        toast.error("Upload failed", `${file.name}: ${msg}`);
      });
  };

  const pickFiles = (files: FileList | null, kind: "image" | "video") => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    if (kind === "image") {
      const allowedByCount = list.slice(0, remainingImages);

      if (allowedByCount.length === 0) {
        const reason = imageCount >= MAX_IMAGE_COUNT
          ? `You can attach up to ${MAX_IMAGE_COUNT} images per post. Remove one before adding another.`
          : `A post can include at most ${MAX_MEDIA_COUNT} media items (images + video combined). Remove something to make room.`;
        dialog.alertDialog({
          variant: "warning",
          title: "Image limit reached",
          description: reason,
        });
        return;
      }
      if (allowedByCount.length < list.length) {
        const skipped = list.length - allowedByCount.length;
        dialog.alertDialog({
          variant: "warning",
          title: `Only ${MAX_IMAGE_COUNT} images per post`,
          description: `${skipped} ${skipped === 1 ? "image was" : "images were"} ignored. Your post can include at most ${MAX_IMAGE_COUNT} images.`,
        });
      }

      const oversized: string[] = [];
      for (const f of allowedByCount) {
        if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
          oversized.push(`${f.name} (${formatBytes(f.size)})`);
          continue;
        }
        startUpload(f, "image");
      }
      if (oversized.length > 0) {
        dialog.alertDialog({
          variant: "warning",
          title: oversized.length === 1 ? "Image too large" : "Some images are too large",
          description:
            `Images must be ${MAX_IMAGE_MB} MB or smaller. The following ${oversized.length === 1 ? "file was" : "files were"} skipped:\n\n` +
            oversized.map((n) => `• ${n}`).join("\n"),
        });
      }
      return;
    }

    // video — only one video per post, and at most MAX_MEDIA_COUNT items total.
    if (videoCount >= MAX_VIDEO_COUNT) {
      dialog.alertDialog({
        variant: "warning",
        title: "Only one video per post",
        description: "You can attach a single video per post. Remove the current video before adding another.",
      });
      return;
    }
    if (totalCount >= MAX_MEDIA_COUNT) {
      dialog.alertDialog({
        variant: "warning",
        title: "No room for a video",
        description: `This post already has ${MAX_MEDIA_COUNT} media items. Remove an image to make space for a video.`,
      });
      return;
    }

    // The video input is single-select, but guard anyway in case multiple are dragged in.
    const allowedVids = list.slice(0, MAX_VIDEO_COUNT - videoCount);
    if (allowedVids.length < list.length) {
      dialog.alertDialog({
        variant: "warning",
        title: "Only one video per post",
        description: `${list.length - allowedVids.length} video${list.length - allowedVids.length === 1 ? " was" : "s were"} ignored.`,
      });
    }

    const oversizedVids: string[] = [];
    for (const f of allowedVids) {
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
        oversizedVids.push(`${f.name} (${formatBytes(f.size)})`);
        continue;
      }
      startUpload(f, "video");
    }
    if (oversizedVids.length > 0) {
      dialog.alertDialog({
        variant: "warning",
        title: oversizedVids.length === 1 ? "Video too large" : "Some videos are too large",
        description:
          `Videos must be ${MAX_VIDEO_MB} MB or smaller. The following ${oversizedVids.length === 1 ? "file was" : "files were"} skipped:\n\n` +
          oversizedVids.map((n) => `• ${n}`).join("\n"),
      });
    }
  };

  const removeAt = (i: number) => {
    setMedia((m) => {
      const target = m[i];
      if (target?.localPreviewUrl) URL.revokeObjectURL(target.localPreviewUrl);
      return m.filter((_, idx) => idx !== i);
    });
  };
  const insertEmoji = (e: string) => { setContent((c) => (c + e).slice(0, MAX_LEN)); setShowEmoji(false); };

  // Clean up object URLs when the form unmounts.
  useEffect(() => {
    return () => {
      setMedia((m) => {
        m.forEach((item) => { if (item.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl); });
        return m;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasDoneMedia = media.some((m) => m.status === "done");
  const canPost =
    (content.trim().length > 0 || hasDoneMedia) &&
    !overLimit &&
    !submitting &&
    uploadingCount === 0;

  const handleSubmit = (sched?: string) => {
    if (!canPost) return;
    const ready: MediaItem[] = media
      .filter((m) => m.status === "done")
      .map(({ type, url, fileName, mimeType }) => ({ type, url, fileName, mimeType }));
    onSubmit(content.trim(), ready, visibility, sched);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="px-4 pt-4 pb-4">
      {/* Author + visibility */}
      <div className="flex items-center gap-3 mb-4">
        {me?.profilePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.profilePhoto} alt="" className="w-11 h-11 rounded-full ring-2 ring-white shadow object-cover" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white font-bold text-sm shadow">
            {initials}
          </div>
        )}
        <div>
          <p className="text-[13px] font-semibold text-gray-900">{me ? `${me.firstName} ${me.lastName}` : "You"}</p>
          <div className="relative" ref={visRef}>
            <button
              type="button"
              onClick={() => setShowVisibility((s) => !s)}
              className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-800 transition"
            >
              <VisibilityIcon size={12} /> {visOpt.label} <ChevronDown size={12} />
            </button>
            {showVisibility && (
              <div className="absolute left-0 top-full mt-1 w-60 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden z-30">
                {VISIBILITY_OPTIONS.map((v) => {
                  const Icon = v.Icon;
                  return (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => { setVisibility(v.value); setShowVisibility(false); }}
                      className={clsx(
                        "w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 transition",
                        visibility === v.value && "bg-green-50/60",
                      )}
                    >
                      <Icon size={14} className="text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-[12px] font-semibold text-gray-900">{v.label}</p>
                        <p className="text-[10px] text-gray-500">{v.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ringed textarea + floating counter & emoji */}
      <div className={clsx(
        "relative rounded-2xl bg-white ring-1 transition focus-within:ring-2",
        overLimit ? "ring-rose-300 focus-within:ring-rose-400" : "ring-gray-200 focus-within:ring-green-400",
      )}>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN + 50))}
          placeholder={`What's on your mind${me?.firstName ? `, ${me.firstName}` : ""}?`}
          rows={5}
          className="w-full px-4 pt-4 pb-10 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none text-xs leading-relaxed placeholder:text-gray-400"
        />
        <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
          <span className={clsx(
            "text-[12px] font-medium tabular-nums",
            overLimit ? "text-rose-600" : "text-gray-400",
          )}>
            {content.length} / {MAX_LEN}
          </span>
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className={clsx(
              "w-7 h-7 rounded-full ring-1 flex items-center justify-center transition",
              showEmoji ? "ring-amber-300 bg-amber-50 text-amber-600" : "ring-gray-200 text-gray-400 hover:text-amber-500 hover:bg-amber-50 hover:ring-amber-200",
            )}
            title="Insert emoji"
          >
            <Smile size={12} />
          </button>
        </div>

        {showEmoji && (
          <div
            ref={emojiRef}
            className="absolute right-2 bottom-12 w-[280px] bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 p-2 z-30"
          >
            <div className="grid grid-cols-6 gap-1">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="text-xl p-1.5 rounded-lg hover:bg-gray-100 hover:scale-125 transition"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-600 hover:underline w-full"
                title="More reactions coming soon"
              >
                <Star size={12} className="text-violet-500" /> More reactions
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Media preview grid */}
      {media.length > 0 && (
        <div className="mt-3">
          <div className={clsx(
            "grid gap-2 rounded-xl overflow-hidden",
            media.length === 1 ? "grid-cols-1" : media.length === 2 ? "grid-cols-2" : "grid-cols-3",
          )}>
            {media.map((m, i) => {
              // Prefer the local blob URL when available — it's instant and
              // works even if the server-side proxy URL hasn't been fetched yet
              // (the real `m.url` is what gets sent on Post).
              const src = m.localPreviewUrl ?? m.url;
              return (
                <div
                  key={m.id}
                  className={clsx(
                    "relative group rounded-lg overflow-hidden ring-1 bg-gray-50",
                    m.status === "error" ? "ring-rose-300" : "ring-gray-200",
                  )}
                >
                  {m.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={m.fileName}
                      className={clsx(
                        "w-full object-cover",
                        media.length === 1 ? "h-72" : "h-40",
                        m.status !== "done" && "opacity-70",
                      )}
                    />
                  ) : (
                    <video
                      src={src}
                      controls={m.status === "done"}
                      className={clsx(
                        "w-full object-cover bg-black",
                        media.length === 1 ? "h-72" : "h-40",
                        m.status !== "done" && "opacity-70",
                      )}
                    />
                  )}

                  {/* Status overlays */}
                  {m.status === "uploading" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-white">
                      <Loader2 size={22} className="animate-spin" />
                      <span className="mt-1 text-[11px] font-semibold">Uploading…</span>
                    </div>
                  )}
                  {m.status === "error" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-900/55 text-white p-2 text-center">
                      <span className="text-[11px] font-bold">Upload failed</span>
                      <span className="text-[10px] opacity-90 line-clamp-2 mt-0.5">{m.error}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition"
                    aria-label="Remove"
                  >
                    <X size={12} />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium uppercase tracking-wider">
                    {m.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => pickFiles(e.target.files, "image")} />
      <input ref={videoRef} type="file" accept="video/*" hidden onChange={(e) => pickFiles(e.target.files, "video")} />

      {/* "Add to your post" row */}
      <div className="mt-4 ring-1 ring-gray-200 rounded-xl px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-gray-700">Add to your post</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canAddImage}
              onClick={() => imageRef.current?.click()}
              title={
                canAddImage
                  ? `Up to ${MAX_IMAGE_COUNT} images, ${MAX_IMAGE_MB}MB each`
                  : imageCount >= MAX_IMAGE_COUNT
                    ? "Image limit reached"
                    : "Media limit reached"
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ImageIcon size={13} /> Image
            </button>
            <button
              type="button"
              disabled={!canAddVideo}
              onClick={() => videoRef.current?.click()}
              title={
                canAddVideo
                  ? `One video, up to ${MAX_VIDEO_MB}MB`
                  : videoCount >= MAX_VIDEO_COUNT
                    ? "Only one video per post"
                    : "Media limit reached"
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Video size={13} /> Video
            </button>
            <button
              type="button"
              onClick={() => setShowEmoji((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-amber-50 text-amber-600 text-xs font-medium transition"
            >
              <Smile size={13} /> Feeling
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>
            {imageCount}/{MAX_IMAGE_COUNT} images · {videoCount}/{MAX_VIDEO_COUNT} video
            <span className="text-gray-400"> · {MAX_IMAGE_MB}MB image · {MAX_VIDEO_MB}MB video</span>
          </span>
          {uploadingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
              <Loader2 size={11} className="animate-spin" />
              Uploading {uploadingCount}…
            </span>
          )}
        </div>
      </div>

      {/* Visibility info card */}
      <button
        type="button"
        onClick={() => setShowVisibility(true)}
        className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-green-50 to-green-50 ring-1 ring-green-100 text-left hover:from-green-100/70 hover:to-green-100/70 transition"
      >
        <div className="w-9 h-9 rounded-full bg-white ring-1 ring-green-200 flex items-center justify-center shrink-0">
          <Lock size={14} className="text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900">This post will be visible to your {visOpt.label.toLowerCase()}</p>
          <p className="text-[11px] text-gray-600">{visOpt.visibleTo}</p>
        </div>
        <ChevronRight size={16} className="text-gray-400 shrink-0" />
      </button>

      {/* Big Post button */}
      <button
        type="submit"
        disabled={!canPost}
        className="mt-4 w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-md"
      >
        {submitting ? (
          <><Loader2 size={13} className="animate-spin" /> Posting…</>
        ) : (
          <><Send size={13} /> Post</>
        )}
      </button>

      {/* OR divider */}
      <div className="my-3 text-center text-xs text-gray-400">or</div>

      {/* Schedule post */}
      {showSchedule ? (
        <div className="rounded-xl ring-1 ring-green-200 bg-green-50/40 p-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Schedule for</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full px-3 py-2 ring-1 ring-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button type="button" onClick={() => setShowSchedule(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
              Cancel
            </button>
            <button
              type="button"
              disabled={!scheduledAt || !canPost}
              onClick={() => handleSubmit(scheduledAt)}
              className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50"
            >
              Schedule
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSchedule(true)}
          className="w-full py-2.5 rounded-xl ring-1 ring-gray-200 hover:bg-green-50 hover:ring-green-200 text-green-600 text-xs font-medium transition inline-flex items-center justify-center gap-2"
        >
          <CalendarClock size={13} /> Schedule post
        </button>
      )}

      <button type="button" onClick={onCancel} className="mt-3 w-full py-2 text-xs text-gray-500 hover:text-gray-700 font-medium">
        Cancel
      </button>
    </form>
  );
}

function KudosForm({ submitting, onCancel, onSubmit }: {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const api = useApiClient();
  const { data: empRes } = useQuery({
    queryKey: ["kudos", "employees"],
    queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=500"),
  });
  const employees = empRes?.data ?? [];
  const [toEmployeeId, setToEmployeeId] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"Kudos" | "Badge" | "Award" | "Shoutout">("Kudos");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!toEmployeeId || !message.trim()) return;
        onSubmit({ toEmployeeId, message, type, isPublic: true });
      }}
      className="border-t border-gray-100 px-4 py-4 bg-gradient-to-b from-amber-50/40 to-white"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-amber-500" />
        <span className="text-[13px] font-semibold text-gray-900">Send Kudos</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">To *</label>
          <Select
            value={toEmployeeId}
            onChange={(v) => setToEmployeeId(v)}
            placeholder="Select teammate"
            className="w-full"
            searchable
            options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeCode})` }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
          <Select
            value={type}
            onChange={(v) => setType(v as typeof type)}
            className="w-full"
            options={[
              { value: "Kudos", label: "Kudos" },
              { value: "Badge", label: "Badge" },
              { value: "Award", label: "Award" },
              { value: "Shoutout", label: "Shoutout" },
            ]}
          />
        </div>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Tell them what they did great..."
        rows={3}
        className="mt-3 w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
      />
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          <X size={13} /> Cancel
        </button>
        <button type="submit" disabled={!toEmployeeId || !message.trim() || submitting} className="btn btn-primary btn-sm">
          <Sparkles size={13} /> {submitting ? "Sending…" : "Send Kudos"}
        </button>
      </div>
    </form>
  );
}

function PollForm({ submitting, onCancel, onSubmit }: {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (question: string, options: string[], allowMultiple: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const addOption = () => setOptions((o) => [...o, ""]);
  const setOption = (i: number, v: string) => setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const removeOption = (i: number) => setOptions((o) => o.filter((_, idx) => idx !== i));

  const submit = () => {
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOpts.length < 2) return;
    onSubmit(question.trim(), cleanOpts, allowMultiple);
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="border-t border-gray-100 px-4 py-4 bg-green-50/30"
    >
      <input
        autoFocus
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Your question"
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#166534]"
      />
      <div className="space-y-2 mt-3">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1 px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
            {options.length > 2 && (
              <button type="button" onClick={() => removeOption(i)} className="p-1 text-gray-400 hover:text-red-600">
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button type="button" onClick={addOption} className="text-xs text-[#22c55e] hover:underline">+ Add option</button>
        )}
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={allowMultiple}
          onChange={(e) => setAllowMultiple(e.target.checked)}
          className="rounded text-green-600 focus:ring-green-400"
        />
        Allow multiple choices
      </label>

      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          <X size={13} /> Cancel
        </button>
        <button type="submit" disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || submitting}
          className="btn btn-primary btn-sm">
          <BarChart3 size={13} /> {submitting ? "Creating…" : "Create poll"}
        </button>
      </div>
    </form>
  );
}
