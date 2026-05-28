"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, ArrowRight, Image as ImageIcon, Video, Sparkles, X, Package, Briefcase } from "lucide-react";
import PostIdeaCard from "@/components/posts/PostIdeaCard";
import GeneratedImageCard from "@/components/posts/GeneratedImageCard";
import ScheduleModal from "@/components/posts/ScheduleModal";
import SelectMediaModal, { type AttachmentSelection } from "@/components/posts/SelectMediaModal";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostIdea {
  title: string;
  description: string;
}

interface WizardData {
  prompt: string;
  objective: string;
  includeLogo: boolean;
  mediaType: "image" | "video";
  ideas: PostIdea[];
  selectedIdeaIndex: number | null;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  // Optional product / service / asset attachment chosen via the
  // SelectMediaModal opened from the Step 1 "Image" button. Only one
  // can be set at a time (mutual exclusion is enforced in the modal).
  attachment: AttachmentSelection | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OBJECTIVES = [
  { key: "Promotional", label: "Promotional" },
  { key: "Engagement", label: "Engagement" },
  { key: "Announcement", label: "Announcement" },
  { key: "Brand Awareness", label: "Brand Awareness" },
  { key: "Festival/Event", label: "Festival/Event" },
];

const STEPS = ["Concept", "Ideas", "Create", "Schedule"];

// User-facing copy. The backend's WS step names and any technical messages
// it emits never reach the user — every event is mapped through this table.
const STEP_MESSAGES: Record<string, string> = {
  generating: "Crafting your image with AI...",
  compositing: "Adding your brand elements...",
  uploading: "Almost there...",
  done: "Your post is ready!",
};

// Heartbeat events cycle through these four messages so the user sees motion
// instead of a frozen status line during long Gemini calls.
const HEARTBEAT_MESSAGES = [
  "Still working on your post...",
  "Applying finishing touches...",
  "Making it perfect for your brand...",
  "Great things take a moment...",
];

// Hard ceiling on socket inactivity. The server's heartbeat fires every 5–8s,
// so 10 minutes of total silence means the connection has genuinely dropped.
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Detect a Gemini outage / capacity event from the WebSocket error frame.
 *
 * Primary signal: `event.code === "AI_BUSY"` set by the FastAPI Celery
 * task when the underlying exception is a `GeminiUnavailableError` or a
 * 180s timeout (almost always Gemini saturation).
 *
 * Fallback signals (text heuristic): older worker builds + edge cases
 * where the code field isn't set. Matches the words Gemini's own SDK
 * tends to surface — "unavailable", "high demand", "timed out", "503",
 * "ResourceExhausted". Keeps the friendly message reachable even when
 * the worker hasn't been redeployed yet.
 */
function isAiBusyEvent(event: { code?: string; error?: string }): boolean {
  if (event?.code === "AI_BUSY") return true;
  const msg = typeof event?.error === "string" ? event.error : "";
  return /unavailable|high\s+demand|busy|timed?\s*out|timeout|\b503\b|ResourceExhausted/i.test(
    msg,
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function WizardProgress({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {STEPS.map((label, i) => {
        const done = i + 1 < step;
        const active = i + 1 === step;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                height: 6,
                width: active ? 40 : done ? 32 : 32,
                borderRadius: 9999,
                background: active
                  ? "#ffffff"
                  : done
                  ? "rgba(255,255,255,0.50)"
                  : "rgba(255,255,255,0.15)",
                transition: "all 0.25s",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glass input / textarea style helpers
// ---------------------------------------------------------------------------

const glassInputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  color: "#ffffff",
  fontSize: 14,
  padding: "12px 14px",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  lineHeight: 1.6,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CreatePostPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [activeBrand, setActiveBrand] = useState<any>(null);

  const [data, setData] = useState<WizardData>({
    prompt: "",
    objective: "Promotional",
    includeLogo: false,
    mediaType: "image",
    ideas: [],
    selectedIdeaIndex: null,
    imageUrl: "",
    caption: "",
    hashtags: [],
    attachment: null,
  });

  // Toggles the SelectMediaModal opened from the "Image" button below the
  // Describe Concept textarea. The modal owns selection state internally;
  // we only commit on Select.
  const [mediaModalOpen, setMediaModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  // Soft warning when the active brand is missing one or more colors.
  // Generation still proceeds — neutral fallbacks fill the missing slots.
  const [colorWarning, setColorWarning] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateMsg, setRegenerateMsg] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  // Active when the member's "Suggest & Send for Review" button is in flight.
  const [submittingForReview, setSubmittingForReview] = useState(false);
  // Active when the admin's "Post Now" button (in ScheduleModal) is in flight.
  const [publishingNow, setPublishingNow] = useState(false);

  // Scheduling date carried in from a calendar-cell click
  // (/dashboard/posts/create?scheduledDate=YYYY-MM-DD). When present, Step 4's
  // ScheduleModal opens locked to this date — the user only picks a time.
  const [lockedScheduledDate, setLockedScheduledDate] = useState<Date | null>(null);

  // Read the calendar-supplied scheduledDate once on mount. Parsed from
  // window.location rather than useSearchParams to avoid the Suspense-boundary
  // requirement that would otherwise trip `next build`.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("scheduledDate");
    if (!raw) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    // Default to noon so the modal opens on the right day regardless of TZ;
    // the time is irrelevant since lockDate clears the pre-selected slot.
    const dt = new Date(y, mo, d, 12, 0, 0, 0);
    // Reject impossible dates (e.g. 2026-02-31 rolling over to March).
    if (Number.isNaN(dt.getTime()) || dt.getMonth() !== mo || dt.getDate() !== d) return;
    setLockedScheduledDate(dt);
  }, []);

  // Per-brand role drives Step 4 mode (admin: schedule; member: suggest).
  const activeBrandIdForRole = activeBrand?._id ?? activeBrand?.id ?? null;
  const { isAdmin } = useWorkspaceRole(activeBrandIdForRole);

  // WebSocket refs — kept so we can close on unmount or when starting a new run
  const generateWsRef = useRef<WebSocket | null>(null);
  const regenerateWsRef = useRef<WebSocket | null>(null);

  // Inactivity timers — fire once after INACTIVITY_TIMEOUT_MS of socket silence
  const generateInactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenerateInactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Heartbeat-message cursors — advance per heartbeat event, per flow
  const generateHeartbeatIdxRef = useRef(0);
  const regenerateHeartbeatIdxRef = useRef(0);

  // Cleanup any open sockets / pending timers on unmount
  useEffect(() => {
    return () => {
      generateWsRef.current?.close();
      regenerateWsRef.current?.close();
      if (generateInactivityRef.current) clearTimeout(generateInactivityRef.current);
      if (regenerateInactivityRef.current) clearTimeout(regenerateInactivityRef.current);
    };
  }, []);

  // ── Attachment payload builders ─────────────────────────────────────────
  // Convert the modal's AttachmentSelection into the wire shape that the
  // FastAPI generate-image route accepts. Only the matching field is
  // populated; the others are undefined so they fall through Pydantic's
  // Optional fields and don't bloat the request.
  const buildAttachmentPayload = useCallback((
    sel: AttachmentSelection | null,
  ): {
    attachedOffering?: Record<string, unknown>;
    attachedAsset?: Record<string, unknown>;
  } => {
    if (!sel) return {};
    if (sel.kind === "offering") {
      const o = sel.offering;
      // The offering's own free-string `type` (product / service / menu_item /
      // treatment / …) flows through verbatim — Python's
      // _build_attachment_directive branches on it for type-specific prompts.
      return {
        attachedOffering: {
          type: o.type || "product",
          name: o.name,
          description: o.description ?? null,
          price: o.price ?? null,
          currency: o.currency ?? null,
          duration: o.duration ?? null,
          category: o.category ?? null,
          tags: o.tags ?? [],
          imageUrl: o.imageUrls?.[0] ?? null,
        },
      };
    }
    // asset
    const a = sel.asset;
    return {
      attachedAsset: {
        url: a.url,
        name: a.name,
        type: a.type,
      },
    };
  }, []);

  // Fetch active brand on mount
  useEffect(() => {
    (async () => {
      const activeRes = await fetch("/api/user/active-brand", { credentials: "include" });
      const activeData = unwrap(await activeRes.json().catch(() => ({})));
      const brandId = activeData.activeBrandId ?? activeData.brandId;
      if (brandId) {
        const detailRes = await fetch(`/api/brands/${brandId}`, { credentials: "include" });
        if (detailRes.ok) {
          const d = unwrap(await detailRes.json());
          const b = d.brand ?? null;
          setActiveBrand(b);
          if (b) {
            const missing =
              !b.primaryColors?.[0] || !b.secondaryColors?.[0] || !b.accentColor;
            setColorWarning(missing);
          }
        }
      }
    })();
  }, []);

  // ── Step 1 handlers ────────────────────────────────────────────────────────

  const handleGenerateIdeas = async () => {
    setError("");
    setLoading(true);
    setLoadingMsg("Generating ideas…");

    try {
      const res = await fetch("/api/posts/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandName: activeBrand?.name ?? "Brand",
          brandAbout: activeBrand?.about,
          brandVoice: activeBrand?.brandVoice,
          primaryColor: activeBrand?.primaryColors?.[0],
          prompt: data.prompt,
          objective: data.objective,
        }),
      });

      const result = unwrap(await res.json());
      if (!res.ok) {
        setError(result.error ?? "Failed to generate ideas.");
        return;
      }

      setData((d) => ({ ...d, ideas: result.ideas ?? [], selectedIdeaIndex: null }));
      setStep(2);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  // ── Step 2 handlers ────────────────────────────────────────────────────────

  const handleGenerateImage = useCallback(async () => {
    if (data.selectedIdeaIndex === null) return;
    setError("");
    setLoading(true);
    setLoadingMsg(STEP_MESSAGES.generating);

    // Tear down any leftover WS / timer from a previous attempt
    generateWsRef.current?.close();
    generateWsRef.current = null;
    if (generateInactivityRef.current) {
      clearTimeout(generateInactivityRef.current);
      generateInactivityRef.current = null;
    }
    generateHeartbeatIdxRef.current = 0;

    const idea = data.ideas[data.selectedIdeaIndex];

    // Brand colors are sent as a strict { primary, secondary, accent } object.
    // Missing slots get neutral fallbacks so generation isn't blocked — the
    // user still sees the warning banner pointing them to Brand Settings.
    const primary = activeBrand?.primaryColors?.[0] || "#0A0A0A";
    const secondary = activeBrand?.secondaryColors?.[0] || "#FFFFFF";
    const accent = activeBrand?.accentColor || "#FF6B35";

    let res: Response;
    try {
      res = await fetch("/api/posts/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandName: activeBrand?.name ?? "Brand",
          brandAbout: activeBrand?.about,
          brandVoice: activeBrand?.brandVoice,
          colors: {
            primary,
            secondary,
            accent,
          },
          logoUrl: activeBrand?.logoUrl,
          selectedIdeaTitle: idea.title,
          selectedIdeaDescription: idea.description,
          prompt: data.prompt,
          objective: data.objective,
          includeLogo: data.includeLogo,
          // Optional product / service / library-asset attachment from the
          // SelectMediaModal — at most one is present (mutual exclusion).
          ...buildAttachmentPayload(data.attachment),
        }),
      });
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      setLoadingMsg("");
      return;
    }

    const result = unwrap(await res.json().catch(() => ({})));
    if (!res.ok || !result.jobId || !result.wsToken || !result.wsUrl) {
      setError(result.error ?? "Failed to start image generation.");
      setLoading(false);
      setLoadingMsg("");
      return;
    }

    const wsUrl = `${result.wsUrl}/ws/post/${result.jobId}?ws_token=${result.wsToken}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setError("Could not open progress stream.");
      setLoading(false);
      setLoadingMsg("");
      return;
    }
    generateWsRef.current = ws;

    // Reset the inactivity timer on every server message (incl. heartbeats).
    // If the socket goes 10 minutes without saying anything, we declare it
    // dead and surface a friendly error.
    const resetGenerateInactivity = () => {
      if (generateInactivityRef.current) {
        clearTimeout(generateInactivityRef.current);
      }
      generateInactivityRef.current = setTimeout(() => {
        generateInactivityRef.current = null;
        try { ws.close(1000); } catch { /* already closed */ }
        setError("Lost connection to AI service. Please try again.");
        setLoading(false);
        setLoadingMsg("");
      }, INACTIVITY_TIMEOUT_MS);
    };
    resetGenerateInactivity();

    ws.onmessage = (evt) => {
      let event: any;
      try { event = JSON.parse(evt.data); } catch { return; }

      // Any inbound message — keep the connection considered alive.
      resetGenerateInactivity();

      if (event.step === "done") {
        if (generateInactivityRef.current) clearTimeout(generateInactivityRef.current);
        generateInactivityRef.current = null;
        ws.close(1000);
        const r = event.result ?? {};
        setData((d) => ({
          ...d,
          imageUrl: r.imageUrl ?? "",
          caption: r.caption ?? "",
          hashtags: r.hashtags ?? [],
        }));
        setLoadingMsg(STEP_MESSAGES.done);
        setLoading(false);
        setStep(3);
      } else if (event.step === "error") {
        if (generateInactivityRef.current) clearTimeout(generateInactivityRef.current);
        generateInactivityRef.current = null;
        ws.close(1000);
        // Map known error codes to user-facing messages. The "AI_BUSY"
        // code is set by tasks.py when the underlying failure is a
        // Gemini outage / 503 / timeout — telling the user to "retry in
        // a few seconds" reduces frustration vs. a generic "try again".
        // Anything else collapses to the safe generic message — backend
        // error strings are never echoed verbatim.
        setError(isAiBusyEvent(event)
          ? "AI image service is temporarily busy (high demand). Please retry in a few seconds — this usually resolves quickly."
          : "We couldn't finish that one. Please try again.");
        setLoading(false);
        setLoadingMsg("");
      } else if (event.step === "heartbeat") {
        const idx = generateHeartbeatIdxRef.current % HEARTBEAT_MESSAGES.length;
        setLoadingMsg(HEARTBEAT_MESSAGES[idx]);
        generateHeartbeatIdxRef.current = idx + 1;
      } else if (event.step && STEP_MESSAGES[event.step]) {
        setLoadingMsg(STEP_MESSAGES[event.step]);
      }
      // Unknown step or backend-supplied event.message → ignore. The user only
      // ever sees strings from STEP_MESSAGES / HEARTBEAT_MESSAGES.
    };

    ws.onclose = (evt) => {
      generateWsRef.current = null;
      // Abnormal close while still loading → only surface the error if the
      // inactivity timer hasn't already fired (which clears the ref). The
      // server normally sends "done"/"error" before closing; a transient drop
      // before the inactivity threshold should not blame the user.
      if (
        evt.code !== 1000 &&
        evt.code !== 1001 &&
        generateInactivityRef.current !== null
      ) {
        if (generateInactivityRef.current) clearTimeout(generateInactivityRef.current);
        generateInactivityRef.current = null;
        setLoading((stillLoading) => {
          if (stillLoading) {
            setError("Lost connection to AI service. Please try again.");
            setLoadingMsg("");
          }
          return false;
        });
      }
    };
  }, [data.selectedIdeaIndex, data.ideas, data.prompt, data.objective, data.includeLogo, activeBrand]);

  // ── Step 3 handlers ────────────────────────────────────────────────────────

  const handleRegenerate = useCallback(
    async (modificationPrompt: string) => {
      setIsRegenerating(true);
      setRegenerateMsg(STEP_MESSAGES.generating);
      setError("");

      regenerateWsRef.current?.close();
      regenerateWsRef.current = null;
      if (regenerateInactivityRef.current) {
        clearTimeout(regenerateInactivityRef.current);
        regenerateInactivityRef.current = null;
      }
      regenerateHeartbeatIdxRef.current = 0;

      let res: Response;
      try {
        res = await fetch("/api/posts/regenerate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            imageUrl: data.imageUrl,
            modificationPrompt,
            brandName: activeBrand?.name,
            logoUrl: activeBrand?.logoUrl ?? null,
          }),
        });
      } catch {
        setError("Network error during regeneration.");
        setIsRegenerating(false);
        setRegenerateMsg("");
        return;
      }

      const result = unwrap(await res.json().catch(() => ({})));
      if (!res.ok || !result.jobId || !result.wsToken || !result.wsUrl) {
        setError(result.error ?? "Failed to start regeneration.");
        setIsRegenerating(false);
        setRegenerateMsg("");
        return;
      }

      const wsUrl = `${result.wsUrl}/ws/regenerate/${result.jobId}?ws_token=${result.wsToken}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setError("Could not open progress stream.");
        setIsRegenerating(false);
        setRegenerateMsg("");
        return;
      }
      regenerateWsRef.current = ws;

      const resetRegenerateInactivity = () => {
        if (regenerateInactivityRef.current) {
          clearTimeout(regenerateInactivityRef.current);
        }
        regenerateInactivityRef.current = setTimeout(() => {
          regenerateInactivityRef.current = null;
          try { ws.close(1000); } catch { /* already closed */ }
          setError("Lost connection to AI service. Please try again.");
          setIsRegenerating(false);
          setRegenerateMsg("");
        }, INACTIVITY_TIMEOUT_MS);
      };
      resetRegenerateInactivity();

      ws.onmessage = (evt) => {
        let event: any;
        try { event = JSON.parse(evt.data); } catch { return; }

        resetRegenerateInactivity();

        if (event.step === "done") {
          if (regenerateInactivityRef.current) clearTimeout(regenerateInactivityRef.current);
          regenerateInactivityRef.current = null;
          ws.close(1000);
          const r = event.result ?? {};
          if (r.imageUrl) {
            setData((d) => ({ ...d, imageUrl: r.imageUrl }));
          }
          setRegenerateMsg(STEP_MESSAGES.done);
          setIsRegenerating(false);
        } else if (event.step === "error") {
          if (regenerateInactivityRef.current) clearTimeout(regenerateInactivityRef.current);
          regenerateInactivityRef.current = null;
          ws.close(1000);
          setError(isAiBusyEvent(event)
            ? "AI image service is temporarily busy (high demand). Please retry in a few seconds — this usually resolves quickly."
            : "We couldn't apply that edit. Please try again.");
          setIsRegenerating(false);
          setRegenerateMsg("");
        } else if (event.step === "heartbeat") {
          const idx = regenerateHeartbeatIdxRef.current % HEARTBEAT_MESSAGES.length;
          setRegenerateMsg(HEARTBEAT_MESSAGES[idx]);
          regenerateHeartbeatIdxRef.current = idx + 1;
        } else if (event.step && STEP_MESSAGES[event.step]) {
          setRegenerateMsg(STEP_MESSAGES[event.step]);
        }
      };

      ws.onclose = (evt) => {
        regenerateWsRef.current = null;
        if (
          evt.code !== 1000 &&
          evt.code !== 1001 &&
          regenerateInactivityRef.current !== null
        ) {
          if (regenerateInactivityRef.current) clearTimeout(regenerateInactivityRef.current);
          regenerateInactivityRef.current = null;
          setIsRegenerating((stillRegen) => {
            if (stillRegen) {
              setError("Lost connection to AI service. Please try again.");
              setRegenerateMsg("");
            }
            return false;
          });
        }
      };
    },
    [data.imageUrl, activeBrand],
  );

  // ── Step 4: Save ────────────────────────────────────────────────────────────

  // Returns null on success (caller will be unmounted by router.push), or
  // an error string on failure so the modal can render it inline.
  const handleSave = async (
    scheduledFor: Date | null,
    platform: string,
  ): Promise<string | null> => {
    setSaving(true);
    try {
      const brandId = activeBrand?._id ?? activeBrand?.id;
      if (!brandId) {
        setSaving(false);
        return "No active brand. Create or select a brand first.";
      }
      const caption = (data.caption || "").trim() || "Untitled post";

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandId,
          content: caption,
          platform,
          imageUrl: data.imageUrl,
          scheduledFor: scheduledFor?.toISOString() ?? null,
          // The API derives status from scheduledFor; we send it explicitly
          // for "Save to Library" so future API consumers can rely on it too.
          status: scheduledFor ? undefined : "draft",
          // Original wizard prompt — surfaced in the Content Hub
          // PostDetailModal "Prompt" section.
          prompt: data.prompt,
          // Persist the attachment ref so a future regeneration / Content
          // Hub view can show "this post was generated with X attached".
          ...buildAttachmentPayload(data.attachment),
        }),
      });
      const result = unwrap(await res.json().catch(() => ({})));
      if (!res.ok) {
        setSaving(false);
        return result.error ?? "Failed to save post.";
      }
      const params = scheduledFor ? "?saved=scheduled" : "?saved=library";
      router.push(`/dashboard/content-hub${params}`);
      return null;
    } catch {
      setSaving(false);
      return "Network error while saving.";
    }
  };

  // Admin-only Step 4 action: create the post as a draft, then immediately
  // publish it via /publish-now. Two-step (create → publish-now) so the
  // create flow can reuse the same publish-now route the Content Hub uses
  // for retries; the brief "draft" intermediate state is invisible to the
  // user because we navigate away on success.
  const handlePublishNowFromCreate = async (platform: string): Promise<string | null> => {
    setPublishingNow(true);
    try {
      const brandId = activeBrand?._id ?? activeBrand?.id;
      if (!brandId) {
        setPublishingNow(false);
        return "No active brand. Create or select a brand first.";
      }
      const caption = (data.caption || "").trim() || "Untitled post";

      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandId,
          content: caption,
          // The user's selected platform from the ScheduleModal pill. Drives
          // which publisher fires — publish-now reads post.platform, so the
          // old hardcoded "instagram" sent every Post Now to IG even when the
          // user picked Facebook. Also passed explicitly to publish-now below.
          platform,
          imageUrl: data.imageUrl,
          status: "draft",
          prompt: data.prompt,
          ...buildAttachmentPayload(data.attachment),
        }),
      });
      const createJson = unwrap(await createRes.json().catch(() => ({})));
      if (!createRes.ok || !createJson?.post?._id) {
        setPublishingNow(false);
        return createJson?.error ?? "Failed to save post before publishing.";
      }

      const postId = createJson.post._id as string;
      const publishRes = await fetch(`/api/posts/${postId}/publish-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ platform }),
      });
      const publishJson = unwrap(await publishRes.json().catch(() => ({})));
      if (!publishRes.ok || !publishJson?.success) {
        // Post is now sitting in the user's library as draft (or failed,
        // depending on what publish-now wrote). Send them to the Content
        // Hub so they can see the failure state and retry from there.
        setPublishingNow(false);
        const reason =
          publishJson?.error ??
          publishJson?.post?.failedReason ??
          "Publishing failed. The post is saved as a draft you can retry from the Content Hub.";
        return reason;
      }

      router.push("/dashboard/content-hub?saved=published");
      return null;
    } catch {
      setPublishingNow(false);
      return "Network error while publishing.";
    }
  };

  // Member-only Step 4 action: create the post as a draft, then submit it
  // for review with the chosen time as requestedPublishTime. Two-step so
  // the existing /api/posts (create) and /submit-review routes stay
  // single-purpose and the admin-confirmed scheduledFor field is never
  // populated by a non-admin caller.
  const handleSuggestTimeSubmit = async (
    when: Date,
    platform: string,
  ): Promise<string | null> => {
    setSubmittingForReview(true);
    try {
      const brandId = activeBrand?._id ?? activeBrand?.id;
      if (!brandId) {
        setSubmittingForReview(false);
        return "No active brand. Create or select a brand first.";
      }
      const caption = (data.caption || "").trim() || "Untitled post";

      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandId,
          content: caption,
          platform,
          imageUrl: data.imageUrl,
          // No scheduledFor — server enforces draft for members anyway.
          prompt: data.prompt,
          ...buildAttachmentPayload(data.attachment),
        }),
      });
      const createData = unwrap(await createRes.json().catch(() => ({})));
      if (!createRes.ok || !createData.post?._id) {
        setSubmittingForReview(false);
        return createData.error ?? "Failed to save post.";
      }
      const postId = createData.post._id;

      const submitRes = await fetch(`/api/posts/${postId}/submit-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requestedPublishTime: when.toISOString() }),
      });
      const submitData = unwrap(await submitRes.json().catch(() => ({})));
      if (!submitRes.ok) {
        setSubmittingForReview(false);
        return submitData.error ?? "Failed to submit for review.";
      }

      router.push(`/dashboard/content-hub?saved=review`);
      return null;
    } catch {
      setSubmittingForReview(false);
      return "Network error while submitting.";
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const canGoNext = (() => {
    if (step === 1) return data.prompt.trim().length > 0 && !loading;
    if (step === 2) return data.selectedIdeaIndex !== null && !loading;
    if (step === 3) return !!data.imageUrl && !isRegenerating;
    return false;
  })();

  // ── Step renders ──────────────────────────────────────────────────────────

  function Step1() {
    const att = data.attachment;
    const attLabel =
      att?.kind === "offering"
        ? att.offering.name
        : att?.kind === "asset"
        ? att.asset.name
        : null;
    const attThumb =
      att?.kind === "offering"
        ? att.offering.imageUrls?.[0]
        : att?.kind === "asset"
        ? att.asset.thumbnailUrl ?? att.asset.url
        : null;
    const attIcon =
      att?.kind === "offering"
        ? att.offering.type === "service" || att.offering.type === "treatment"
          ? <Briefcase size={14} />
          : <Package size={14} />
        : att?.kind === "asset"
        ? <ImageIcon size={14} />
        : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle}>Describe your post concept</label>
          <textarea
            value={data.prompt}
            onChange={(e) => setData((d) => ({ ...d, prompt: e.target.value }))}
            placeholder="Describe what you want to post about…"
            rows={5}
            style={glassInputStyle}
          />
        </div>

        {/* Image / attach button + selected-attachment preview pill.
            Mirrors v1's bottom-bar entry point: clicking opens the
            SelectMediaModal where the user picks a brand-library asset,
            a product, or a service. Selection is mutually exclusive
            across the three tabs (CLAUDE.md "Asset vs Catalog" rule). */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setMediaModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 14px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <ImageIcon size={14} />
            {att ? "Change attachment" : "Image"}
          </button>

          {att && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 10px 4px 4px",
                borderRadius: 9999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
                maxWidth: 260,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.10)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {attThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>{attIcon}</span>
                )}
              </div>
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {attLabel}
              </span>
              <button
                type="button"
                onClick={() => setData((d) => ({ ...d, attachment: null }))}
                aria-label="Remove attachment"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.70)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Post Objective */}
        <div>
          <label style={labelStyle}>Post Objective</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {OBJECTIVES.map((obj) => {
              const active = data.objective === obj.key;
              return (
                <button
                  key={obj.key}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, objective: obj.key }))}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 9999,
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    border: active ? "none" : "1px solid rgba(255,255,255,0.18)",
                    background: active ? "#ffffff" : "rgba(255,255,255,0.07)",
                    color: active ? "#0a0a0a" : "rgba(255,255,255,0.65)",
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {obj.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Include Logo */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={data.includeLogo}
            onChange={(e) => setData((d) => ({ ...d, includeLogo: e.target.checked }))}
            style={{ width: 16, height: 16, accentColor: "#ffffff", cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
            Include brand logo in image
          </span>
        </label>
      </div>
    );
  }

  function Step2() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: 0 }}>
          Select a concept to generate your post
        </p>
        <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
          {data.ideas.map((idea, i) => (
            <PostIdeaCard
              key={i}
              idea={idea}
              index={i}
              selected={data.selectedIdeaIndex === i}
              onClick={() => setData((d) => ({ ...d, selectedIdeaIndex: i }))}
            />
          ))}
        </div>
      </div>
    );
  }

  function Step3() {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 20, alignSelf: "flex-start" }}>
          Select a variant to proceed
        </p>
        <GeneratedImageCard
          imageUrl={data.imageUrl}
          caption={data.caption}
          hashtags={data.hashtags}
          onCaptionChange={(caption) => setData((d) => ({ ...d, caption }))}
          onRegenerate={handleRegenerate}
          isRegenerating={isRegenerating}
          regenerateMsg={regenerateMsg}
        />
      </div>
    );
  }

  // ── Loading overlay ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          minHeight: 400,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            border: "3px solid rgba(255,255,255,0.15)",
            borderTop: "3px solid #ffffff",
            borderRadius: "50%",
            animation: "qs-spin 0.8s linear infinite",
          }}
        />
        <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 15 }}>{loadingMsg}</p>
        <style>{`@keyframes qs-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 0 48px" }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Back button — present on every step. Destination per step:
                  Step 1 → /dashboard
                  Step 2 → Step 1
                  Step 3 → Step 2
                The schedule modal (logical Step 4) has its own Back button
                that closes the modal and leaves the user on Step 3. */}
            <button
              type="button"
              onClick={() => {
                if (step === 1) router.push("/dashboard");
                else if (step === 2) setStep(1);
                else if (step === 3) setStep(2);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.55)",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: "#ffffff", margin: 0 }}>
              Create Post
            </h1>

            {/* Image / Video tab */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                padding: 3,
                borderRadius: 9999,
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {(["image", "video"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, mediaType: t }))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 12px",
                    borderRadius: 9999,
                    border: "none",
                    background: data.mediaType === t ? "#ffffff" : "transparent",
                    color: data.mediaType === t ? "#0a0a0a" : "rgba(255,255,255,0.55)",
                    fontSize: 12,
                    fontWeight: data.mediaType === t ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {t === "image" ? <ImageIcon size={12} /> : <Video size={12} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar — schedule modal counts as logical step 4. */}
          <WizardProgress step={showSchedule ? 4 : step} />
        </div>

        {/* Step content card */}
        <div
          // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
          style={{
            background: "rgba(33, 33, 33, 0.14)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 16,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            padding: 24,
          }}
        >
          {/* Step title */}
          <p style={{ fontSize: 18, fontWeight: 600, color: "#ffffff", marginBottom: 20 }}>
            {step === 1 && "Describe Concept"}
            {step === 2 && "Post Ideas"}
            {step === 3 && "Create Post"}
          </p>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#EF4444",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Color-incomplete warning — informational, never blocks generation */}
          {colorWarning && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.30)",
                color: "#F59E0B",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              <span>
                This brand is missing one or more brand colors. Generation will
                use neutral fallbacks until you set them.
              </span>
              <a
                href="/dashboard/settings?tab=workspace"
                style={{
                  color: "#F59E0B",
                  fontWeight: 600,
                  textDecoration: "underline",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Fix in Brand Settings →
              </a>
            </div>
          )}

          {/* Steps are invoked as functions ({Step1()}), not rendered as
              components (<Step1 />). Because Step1/2/3 are declared inside
              CreatePostPage, every parent re-render produces a new function
              reference. React would treat <Step1 /> as a fresh component
              type each render and unmount/remount the textarea, killing
              focus on every keystroke. Calling them inlines the returned
              JSX into the parent's tree, so the textarea is reconciled by
              position and stays mounted. */}
          {step === 1 && Step1()}
          {step === 2 && Step2()}
          {step === 3 && Step3()}
        </div>

        {/* CTA button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          {step === 3 ? (
            <button
              type="button"
              onClick={() => setShowSchedule(true)}
              disabled={!canGoNext}
              style={ctaStyle(canGoNext)}
            >
              Continue to Post →
            </button>
          ) : (
            <button
              type="button"
              onClick={step === 1 ? handleGenerateIdeas : handleGenerateImage}
              disabled={!canGoNext}
              style={ctaStyle(canGoNext)}
            >
              {step === 1 ? (
                <>
                  <Sparkles size={15} style={{ flexShrink: 0 }} />
                  Generate Ideas →
                </>
              ) : (
                <>
                  <Sparkles size={15} style={{ flexShrink: 0 }} />
                  Generate Post →
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Schedule modal — open even if activeBrand failed to load,
          so the user can still save the post to library.

          Mode is role-driven:
            admin / approver → "schedule" (Save to Library + Save & Schedule
                               + optional Post Now)
            member           → "suggest"  (Save to Library + Suggest & Send
                               for Review). The member can pick a platform
                               on the pills as informational metadata; the
                               actual scheduledFor is set later by the admin
                               on approval. */}
      {showSchedule && (
        <ScheduleModal
          brandId={activeBrand?._id ?? activeBrand?.id ?? ""}
          imageUrl={data.imageUrl}
          caption={data.caption}
          // Pre-fill + lock the date when arriving from a calendar-cell click.
          initialScheduledFor={lockedScheduledDate}
          lockDate={!!lockedScheduledDate}
          onClose={() => setShowSchedule(false)}
          onSave={handleSave}
          saving={saving}
          isAdmin={isAdmin}
          mode={isAdmin ? "schedule" : "suggest"}
          // Admin-only "Post Now" — the modal renders a Zap-icon button
          // alongside Save & Schedule when this prop is provided AND
          // isAdmin is true. Member flow ("suggest" mode) hides it.
          onPublishNow={isAdmin ? handlePublishNowFromCreate : undefined}
          publishingNow={publishingNow}
          onSuggestTime={isAdmin ? undefined : handleSuggestTimeSubmit}
          suggesting={submittingForReview}
        />
      )}

      {/* Select Media modal — Library / Product / Service tabs.
          Opened from the "Image" button in Step 1. The modal owns its
          internal state; we receive the final selection on Select. */}
      {mediaModalOpen && (
        <SelectMediaModal
          brandId={activeBrand?._id ?? activeBrand?.id ?? ""}
          initial={data.attachment}
          onClose={() => setMediaModalOpen(false)}
          onSelect={(sel) => {
            setData((d) => ({ ...d, attachment: sel }));
            setMediaModalOpen(false);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "rgba(255,255,255,0.60)",
  marginBottom: 8,
};

function ctaStyle(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "11px 24px",
    borderRadius: 10,
    border: "none",
    background: enabled ? "#ffffff" : "rgba(255,255,255,0.18)",
    color: enabled ? "#0a0a0a" : "rgba(255,255,255,0.35)",
    fontSize: 14,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    transition: "all 0.15s",
  };
}
