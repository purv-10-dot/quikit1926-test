"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useActiveBrandId } from "@/hooks/useActiveBrandId";
import {
  Plus,
  Copy,
  ChevronDown,
  X,
  Calendar,
  Clock,
  Repeat,
  Target,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  Eye,
  RefreshCw,
  Image as ImageIcon,
  Package,
  Briefcase,
} from "lucide-react";
import {
  CAMPAIGN_TEMPLATES,
  type CampaignTemplate,
} from "@/lib/constants/campaign-templates";
import SelectMediaModal, { type AttachmentSelection } from "@/components/posts/SelectMediaModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  _id: string;
  brandId: string;
  name: string;
  objective: string;
  status: "draft" | "active" | "paused" | "completed" | "failed";
  frequency: string;
  weeklyDay?: number | null;
  monthlyDate?: number | null;
  postTime: string;
  startDate: string;
  endDate: string;
  totalPosts: number;
  generatedPosts: number;
  describeConcept?: string | null;
  brandColors?: { primary?: string; secondary?: string; accent?: string };
  productIds?: string[];
  serviceIds?: string[];
  templateId?: string | null;
  clonedFromId?: string | null;
  // Resume-on-mount detection — set by /api/campaigns/generate when a
  // Celery task is queued. Together with `lastGeneratedAt` they tell
  // the campaigns page that a worker is (or recently was) producing
  // posts for this campaign so it can re-attach a poller after the
  // user navigates back. See "Resume in-progress generations" effect.
  celeryTaskId?: string | null;
  lastGeneratedAt?: string | null;
  createdAt: string;
}

interface CampaignFormData {
  name: string;
  objective: string;
  startDate: string;
  endDate: string;
  frequency: string;
  weeklyDay: string;
  monthlyDate: string;
  postTime: string;
  describeConcept: string;
  includeLogo: boolean;
  totalPosts: number;
  // Optional product / service / asset attachment chosen via the
  // SelectMediaModal opened from the modal's "Image" button. Mutually
  // exclusive — at most one is set.
  attachment: AttachmentSelection | null;
  // clone-only
  useSameProducts: boolean;
}

// ---------------------------------------------------------------------------
// Generation state — one slot per campaign card
// ---------------------------------------------------------------------------

type GenerationState =
  | { status: "idle" }
  | { status: "running"; current: number; total: number; message: string }
  | { status: "done"; total: number }
  | { status: "error"; message: string };

// User-facing copy. Backend WS step names + technical messages never reach
// the user — every event is mapped through this table.
const STEP_MESSAGES: Record<string, string> = {
  started: "Creating your campaign posts...",
  generating: "Creating your campaign posts...",
  done: "Your campaign is ready!",
};

// Heartbeat events cycle through these so the user sees motion during
// long Gemini calls. Same pattern as posts/create page.
const HEARTBEAT_MESSAGES = [
  "Still working on your campaign...",
  "Crafting each post for your brand...",
  "Almost there — image generation in progress...",
  "Great campaigns take a moment...",
];

// Hard ceiling on socket inactivity. Server emits a heartbeat every 5-8s,
// so 10 minutes of silence means the connection has genuinely dropped.
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

// Polling fallback — kicks in when the WS closes without delivering `done`
// (Redis pub/sub is fire-and-forget; messages can race the subscriber).
const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBJECTIVES = [
  "Promotional",
  "Engagement",
  "Announcement",
  "Brand Awareness",
  "Festival/Event",
];

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "alternate", label: "Alternate Days" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
})();

function calcTotalPosts(
  frequency: string,
  startDate: string,
  endDate: string
): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / 86_400_000)
  );
  switch (frequency) {
    case "daily":
      return days;
    case "alternate":
      return Math.floor(days / 2);
    case "weekly":
      return Math.floor(days / 7);
    case "monthly":
      return Math.ceil(days / 30);
    default:
      return Math.floor(days / 7);
  }
}

function statusColor(status: Campaign["status"]): string {
  switch (status) {
    case "active":
      return "#22C55E";
    case "completed":
      return "#3B82F6";
    case "paused":
      return "#F59E0B";
    case "failed":
      return "#EF4444";
    default:
      return "#6B7280";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function freqLabel(c: Campaign): string {
  if (c.frequency === "weekly" && c.weeklyDay != null) {
    return `Weekly · ${DAYS_OF_WEEK[c.weeklyDay]}`;
  }
  if (c.frequency === "monthly" && c.monthlyDate != null) {
    return `Monthly · ${c.monthlyDate}th`;
  }
  return FREQUENCIES.find((f) => f.value === c.frequency)?.label ?? c.frequency;
}

// ---------------------------------------------------------------------------
// CampaignCard
// ---------------------------------------------------------------------------

function CampaignCard({
  campaign,
  genState,
  onClone,
  onGenerate,
  onRetry,
}: {
  campaign: Campaign;
  genState: GenerationState;
  onClone: (c: Campaign) => void;
  onGenerate: (c: Campaign) => void;
  onRetry: (c: Campaign) => void;
}) {
  // Live progress while generating; otherwise fall back to the persisted
  // generatedPosts/totalPosts values from MongoDB.
  const liveCurrent = genState.status === "running" ? genState.current : null;
  const liveTotal =
    genState.status === "running" || genState.status === "done"
      ? genState.total
      : null;
  const displayCurrent = liveCurrent ?? campaign.generatedPosts;
  const displayTotal = liveTotal ?? campaign.totalPosts;
  const pct =
    displayTotal > 0
      ? Math.round((displayCurrent / displayTotal) * 100)
      : 0;

  return (
    <div
      // Primary glass card tokens — design-tokens.md §1.
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {campaign.name}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
            {campaign.objective}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Status badge */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(255,255,255,0.08)",
              border: `1px solid ${statusColor(campaign.status)}40`,
              borderRadius: 20,
              padding: "3px 10px",
              fontSize: 11,
              color: statusColor(campaign.status),
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor(campaign.status),
                display: "inline-block",
              }}
            />
            {campaign.status}
          </span>

          {/* Clone button */}
          <button
            onClick={() => onClone(campaign)}
            title="Clone campaign"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "5px 8px",
              color: "rgba(255,255,255,0.65)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
            }}
          >
            <Copy size={13} />
            Clone
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MetaPill icon={<Repeat size={11} />} text={freqLabel(campaign)} />
        <MetaPill
          icon={<Calendar size={11} />}
          text={`${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)}`}
        />
        <MetaPill icon={<Clock size={11} />} text={campaign.postTime} />
        <MetaPill
          icon={<FileText size={11} />}
          text={`${campaign.generatedPosts}/${campaign.totalPosts} posts`}
        />
      </div>

      {/* Progress bar */}
      {campaign.totalPosts > 0 && (
        <div>
          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.10)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: "linear-gradient(90deg,#22C55E,#3B82F6)",
                borderRadius: 4,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 4 }}
          >
            {pct}% generated
          </div>
        </div>
      )}

      {/* Brand color swatches */}
      {campaign.brandColors && (
        <div style={{ display: "flex", gap: 6 }}>
          {(["primary", "secondary", "accent"] as const).map((k) => {
            const hex = campaign.brandColors?.[k];
            if (!hex) return null;
            return (
              <div
                key={k}
                title={`${k}: ${hex}`}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: hex,
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              />
            );
          })}
        </div>
      )}

      {/* Action row — Generate / live progress / View Posts / Retry. */}
      <CampaignCardActions
        campaign={campaign}
        genState={genState}
        onGenerate={onGenerate}
        onRetry={onRetry}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CampaignCardActions — Generate Posts button + live progress + completion
// ---------------------------------------------------------------------------

function CampaignCardActions({
  campaign,
  genState,
  onGenerate,
  onRetry,
}: {
  campaign: Campaign;
  genState: GenerationState;
  onGenerate: (c: Campaign) => void;
  onRetry: (c: Campaign) => void;
}) {
  if (genState.status === "running") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "rgba(255,255,255,0.70)",
          }}
        >
          <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
          <span>{genState.message}</span>
        </div>
        {/* Constant reassurance shown for the full duration of the run.
            The email completion path is the durable signal — the live
            spinner is bonus info for users who keep the page open. */}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", lineHeight: 1.4 }}>
          Generation started! We'll email you when ready. Feel free to keep working.
        </span>
      </div>
    );
  }

  if (genState.status === "done") {
    return (
      <Link
        href={`/dashboard/content-hub?campaignId=${campaign._id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "9px 16px",
          fontSize: 12,
          fontWeight: 600,
          color: "#0A0A0A",
          textDecoration: "none",
          alignSelf: "flex-start",
        }}
      >
        <Eye size={13} />
        View Posts
      </Link>
    );
  }

  if (genState.status === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12,
            color: "#EF4444",
          }}
        >
          <AlertCircle size={13} />
          {genState.message}
        </div>
        <button
          onClick={() => onRetry(campaign)}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 500,
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  // idle — show Generate Posts only on draft campaigns; for already-active
  // or completed campaigns, do nothing (user can clone or view existing posts).
  if (campaign.status !== "draft") return null;

  return (
    <button
      onClick={() => onGenerate(campaign)}
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        background: "#fff",
        border: "none",
        borderRadius: 10,
        padding: "9px 16px",
        fontSize: 12,
        fontWeight: 600,
        color: "#0A0A0A",
        cursor: "pointer",
      }}
    >
      <Sparkles size={13} />
      Generate Posts
    </button>
  );
}

function MetaPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        color: "rgba(255,255,255,0.50)",
      }}
    >
      {icon}
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TemplateCard
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onClick,
}: {
  template: CampaignTemplate;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      // Primary glass card tokens — design-tokens.md §1. Hover state
      // brightens the dark-tinted base instead of switching to a
      // white-tinted background (anti-pattern).
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        padding: "18px 20px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(33, 33, 33, 0.22)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "rgba(255, 255, 255, 0.25)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(33, 33, 33, 0.14)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "rgba(255, 255, 255, 0.10)";
      }}
    >
      {/* Icon + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{template.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>
          {template.name}
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {template.description}
      </p>

      {/* Tags */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {template.tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.45)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CreateCampaignModal — used for both "new from template" and "clone"
// ---------------------------------------------------------------------------

type ModalMode = "template" | "clone" | "scratch";

interface CreateModalProps {
  mode: ModalMode;
  template?: CampaignTemplate;
  sourceCampaign?: Campaign;
  // Festival → campaign handoff from the calendar day panel's "Campaign"
  // button. Only set in "scratch" mode. Pre-fills name + concept + a short
  // 7-day window anchored on the festival date.
  festival?: string;
  scheduledDate?: string;
  brandId: string;
  onClose: () => void;
  onCreated: (c: Campaign) => void;
}

function CreateCampaignModal({
  mode,
  template,
  sourceCampaign,
  festival,
  scheduledDate,
  brandId,
  onClose,
  onCreated,
}: CreateModalProps) {
  const today = new Date().toISOString().split("T")[0];
  const defaultEnd = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .split("T")[0];

  // Festival flow: anchor a SHORT campaign on the festival date — a few posts
  // around the event (teaser → day-of → follow-up), not a month-long arc. The
  // window defaults to 7 days starting at the festival; the user can change it.
  const festivalStart = scheduledDate || today;
  let festivalEnd = defaultEnd;
  if (scheduledDate) {
    const t = new Date(scheduledDate).getTime();
    festivalEnd = Number.isNaN(t)
      ? defaultEnd
      : new Date(t + 7 * 86_400_000).toISOString().split("T")[0];
  }

  const [form, setForm] = useState<CampaignFormData>({
    name:
      mode === "template" && template
        ? `${template.name} Campaign`
        : mode === "clone" && sourceCampaign
        ? `${sourceCampaign.name} (Copy)`
        : festival
        ? `${festival} Campaign`
        : "",
    objective:
      mode === "template" && template ? template.objective : "Brand Awareness",
    startDate: festivalStart,
    endDate: festivalEnd,
    frequency:
      mode === "template" && template
        ? template.frequency
        : mode === "clone" && sourceCampaign
        ? sourceCampaign.frequency
        : "weekly",
    weeklyDay: "",
    monthlyDate: "",
    postTime:
      mode === "clone" && sourceCampaign ? sourceCampaign.postTime : "09:00",
    describeConcept:
      mode === "template" && template
        ? template.conceptDirection
        : festival
        ? `Create a campaign celebrating ${festival}.`
        : "",
    includeLogo: true,
    totalPosts:
      mode === "template" && template
        ? template.suggestedPostCount
        : mode === "clone" && sourceCampaign
        ? sourceCampaign.totalPosts
        : 0,
    attachment: null,
    useSameProducts: false,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);

  // Auto-calc total posts when dates/frequency change
  useEffect(() => {
    if (form.startDate && form.endDate) {
      const calc = calcTotalPosts(form.frequency, form.startDate, form.endDate);
      setForm((f) => ({ ...f, totalPosts: calc }));
    }
  }, [form.frequency, form.startDate, form.endDate]);

  const set = (key: keyof CampaignFormData, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Campaign name is required"); return; }
    if (!form.startDate || !form.endDate) { setError("Start and end dates are required"); return; }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      setError("End date must be after start date");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (mode === "clone" && sourceCampaign) {
        const res = await fetch(`/api/campaigns/${sourceCampaign._id}/clone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useSameProducts: form.useSameProducts }),
        });
        if (!res.ok) throw new Error((unwrap(await res.json())).error ?? "Clone failed");
        const { campaign } = unwrap(await res.json());
        onCreated(campaign);
      } else {
        // Build the optional attachment snapshot in the same shape the
        // /api/campaigns POST handler (and the FastAPI request model)
        // expect. Mutually exclusive — only one of the three is non-null.
        const att = form.attachment;
        const attachedOffering =
          att?.kind === "offering"
            ? {
                // Offering's free-string `type` flows through verbatim; Python's
                // _build_attachment_directive branches on it for type-specific
                // prompts.
                type: att.offering.type || "product",
                name: att.offering.name,
                description: att.offering.description ?? null,
                price: att.offering.price ?? null,
                currency: att.offering.currency ?? null,
                duration: att.offering.duration ?? null,
                category: att.offering.category ?? null,
                tags: att.offering.tags ?? [],
                imageUrl: att.offering.imageUrls?.[0] ?? null,
              }
            : null;
        const attachedAsset =
          att?.kind === "asset"
            ? {
                url: att.asset.url,
                name: att.asset.name,
                type: att.asset.type,
              }
            : null;

        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            name: form.name.trim(),
            objective: form.objective,
            startDate: form.startDate,
            endDate: form.endDate,
            frequency: form.frequency,
            weeklyDay: form.weeklyDay ? parseInt(form.weeklyDay) : null,
            monthlyDate: form.monthlyDate ? parseInt(form.monthlyDate) : null,
            postTime: form.postTime,
            totalPosts: form.totalPosts,
            describeConcept: form.describeConcept.trim() || null,
            includeLogo: form.includeLogo,
            templateId: template?.id ?? null,
            attachedOffering,
            attachedAsset,
          }),
        });
        if (!res.ok) throw new Error((unwrap(await res.json())).error ?? "Create failed");
        const { campaign } = unwrap(await res.json());
        onCreated(campaign);
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      setSaving(false);
    }
  };

  const title =
    mode === "clone"
      ? "Clone Campaign"
      : mode === "template"
      ? `Start: ${template?.name}`
      : "New Campaign";

  return (
    /* Backdrop */
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal — Primary glass card tokens (design-tokens.md §1).
          Matches the Create Post wizard step card exactly. */}
      <div
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: "28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#fff" }}>{title}</div>
            {mode === "template" && template && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                {template.icon} {template.description}
              </div>
            )}
            {mode === "clone" && sourceCampaign && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                Cloning from "{sourceCampaign.name}"
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: 6,
              color: "rgba(255,255,255,0.65)",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Clone-only: Use same products toggle ── */}
        {mode === "clone" && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: "12px 16px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={form.useSameProducts}
              onChange={(e) => set("useSameProducts", e.target.checked)}
              style={{ accentColor: "#22C55E", width: 15, height: 15 }}
            />
            <div>
              <div style={{ fontSize: 13, color: "#fff" }}>Use same products/services</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                Copy the product and service selection from the original campaign
              </div>
            </div>
          </label>
        )}

        {/* ── Non-clone fields ── */}
        {mode !== "clone" && (
          <>
            <Field label="Campaign Name">
              <GlassInput
                value={form.name}
                onChange={(v) => set("name", v)}
                placeholder="e.g. Summer Launch 2026"
              />
            </Field>

            <Field label="Post Objective">
              <GlassSelect
                value={form.objective}
                onChange={(v) => set("objective", v)}
                options={OBJECTIVES.map((o) => ({ value: o, label: o }))}
              />
            </Field>
          </>
        )}

        {/* ── Shared scheduling fields ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Start Date">
            <GlassInput
              type="date"
              value={form.startDate}
              onChange={(v) => set("startDate", v)}
            />
          </Field>
          <Field label="End Date">
            <GlassInput
              type="date"
              value={form.endDate}
              onChange={(v) => set("endDate", v)}
            />
          </Field>
        </div>

        <Field label="Posting Frequency">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                onClick={() => set("frequency", f.value)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                  border:
                    form.frequency === f.value
                      ? "1px solid rgba(255,255,255,0.6)"
                      : "1px solid rgba(255,255,255,0.15)",
                  background:
                    form.frequency === f.value
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(255,255,255,0.06)",
                  color: form.frequency === f.value ? "#fff" : "rgba(255,255,255,0.55)",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Weekly day picker */}
        {form.frequency === "weekly" && (
          <Field label="Day of Week">
            <div style={{ display: "flex", gap: 6 }}>
              {DAYS_OF_WEEK.map((d, i) => (
                <button
                  key={d}
                  onClick={() => set("weeklyDay", String(i))}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    border:
                      form.weeklyDay === String(i)
                        ? "1px solid rgba(255,255,255,0.6)"
                        : "1px solid rgba(255,255,255,0.12)",
                    background:
                      form.weeklyDay === String(i)
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.06)",
                    color: form.weeklyDay === String(i) ? "#fff" : "rgba(255,255,255,0.50)",
                    cursor: "pointer",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Monthly date picker */}
        {form.frequency === "monthly" && (
          <Field label="Day of Month">
            <GlassSelect
              value={form.monthlyDate}
              onChange={(v) => set("monthlyDate", v)}
              options={Array.from({ length: 28 }, (_, i) => ({
                value: String(i + 1),
                label: `${i + 1}${["st","nd","rd"][i] ?? "th"}`,
              }))}
              placeholder="Select date"
            />
          </Field>
        )}

        <Field label="Post Time">
          <GlassSelect
            value={form.postTime}
            onChange={(v) => set("postTime", v)}
            options={TIME_SLOTS.map((t) => ({ value: t, label: t }))}
          />
        </Field>

        {/* Total posts indicator */}
        {form.totalPosts > 0 && (
          <div
            style={{
              background: "rgba(34,197,94,0.10)",
              border: "1px solid rgba(34,197,94,0.20)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 12,
              color: "#22C55E",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={14} />
            {form.totalPosts} posts will be generated for this campaign
          </div>
        )}

        {/* Describe concept */}
        {mode !== "clone" && (
          <Field label="Describe Concept">
            <textarea
              value={form.describeConcept}
              onChange={(e) => set("describeConcept", e.target.value)}
              placeholder={
                template
                  ? "Edit the pre-filled concept or describe your own..."
                  : "Describe the campaign arc and what you want to achieve..."
              }
              rows={4}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#fff",
                fontSize: 13,
                resize: "vertical",
                outline: "none",
                fontFamily: "Inter, sans-serif",
                lineHeight: 1.55,
                boxSizing: "border-box",
              }}
            />
          </Field>
        )}

        {/* Optional attachment — Library / Catalog. Same picker as Create
            Post. The selected item drives the per-post prompt directive AND
            is sent to Gemini as a multimodal reference so every post in the
            campaign features the actual item. */}
        {mode !== "clone" && (() => {
          const att = form.attachment;
          const label =
            att?.kind === "offering"
              ? att.offering.name
              : att?.kind === "asset"
              ? att.asset.name
              : null;
          const thumb =
            att?.kind === "offering"
              ? att.offering.imageUrls?.[0]
              : att?.kind === "asset"
              ? att.asset.thumbnailUrl ?? att.asset.url
              : null;
          const icon =
            att?.kind === "offering"
              ? att.offering.type === "service" || att.offering.type === "treatment"
                ? <Briefcase size={14} />
                : <Package size={14} />
              : att?.kind === "asset"
              ? <ImageIcon size={14} />
              : null;
          return (
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
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.55)" }}>{icon}</span>
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
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => set("attachment", null)}
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
          );
        })()}

        {/* Include logo */}
        {mode !== "clone" && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.includeLogo}
              onChange={(e) => set("includeLogo", e.target.checked)}
              style={{ accentColor: "#22C55E", width: 15, height: 15 }}
            />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
              Include brand logo in generated images
            </span>
          </label>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 12,
              color: "#EF4444",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.65)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 2,
              padding: "11px 0",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              background: saving ? "rgba(255,255,255,0.5)" : "#fff",
              border: "none",
              color: "#0A0A0A",
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {saving ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                {mode === "clone" ? "Cloning..." : "Creating..."}
              </>
            ) : (
              <>
                {mode === "clone" ? (
                  <><Copy size={14} /> Clone Campaign</>
                ) : (
                  <><Sparkles size={14} /> Generate Post ✨</>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Select Media modal — opened from the "Image" button in the form.
          Same component as the Create Post wizard; the modal owns its
          own state and only commits on Select. */}
      {mediaModalOpen && (
        <SelectMediaModal
          brandId={brandId}
          initial={form.attachment}
          onClose={() => setMediaModalOpen(false)}
          onSelect={(sel) => {
            set("attachment", sel);
            setMediaModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable mini form components
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function GlassInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        padding: "9px 14px",
        color: "#fff",
        fontSize: 13,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "Inter, sans-serif",
        colorScheme: "dark",
      }}
    />
  );
}

function GlassSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        padding: "9px 14px",
        color: value ? "#fff" : "rgba(255,255,255,0.40)",
        fontSize: 13,
        outline: "none",
        width: "100%",
        cursor: "pointer",
        colorScheme: "dark",
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const activeBrandId = useActiveBrandId();
  const brandId = activeBrandId ?? "";

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState<{
    mode: ModalMode;
    template?: CampaignTemplate;
    sourceCampaign?: Campaign;
    festival?: string;
    scheduledDate?: string;
  } | null>(null);

  // Per-campaign generation state. Indexed by campaign._id.
  const [genStates, setGenStates] = useState<Record<string, GenerationState>>({});

  // Open WebSockets keyed by campaign id, plus per-campaign inactivity
  // timers and heartbeat-message cursors. Refs because their identity
  // must survive re-renders without retriggering effects.
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  const inactivityRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const heartbeatIdxRefs = useRef<Map<string, number>>(new Map());
  // Polling fallback state. pollRefs holds the active interval handles.
  // pollDeadlineRefs holds the absolute UNIX-ms deadline at which polling
  // gives up on this campaign. Both are cleared when polling stops for any
  // reason (success, timeout, unmount, retry).
  const pollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollDeadlineRefs = useRef<Map<string, number>>(new Map());

  // Cleanup all open sockets / timers / pollers on unmount
  useEffect(() => {
    return () => {
      wsRefs.current.forEach((ws) => {
        try { ws.close(); } catch { /* already closed */ }
      });
      wsRefs.current.clear();
      inactivityRefs.current.forEach((t) => clearTimeout(t));
      inactivityRefs.current.clear();
      pollRefs.current.forEach((t) => clearInterval(t));
      pollRefs.current.clear();
      pollDeadlineRefs.current.clear();
    };
  }, []);

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns?brandId=${brandId}`);
      if (res.ok) {
        const data = unwrap(await res.json());
        setCampaigns(data.campaigns ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // Festival → campaign handoff from the calendar day panel's "Campaign"
  // button: /dashboard/campaigns?festival=…&scheduledDate=YYYY-MM-DD opens the
  // create modal pre-filled. Read once on mount via window.location (not
  // useSearchParams — avoids the Suspense-boundary requirement on `next build`),
  // then strip the query so a refresh / remount doesn't reopen the modal.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const festival = sp.get("festival") ?? undefined;
    const rawDate = sp.get("scheduledDate");
    const scheduledDate =
      rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;
    if (!festival && !scheduledDate) return;
    setModal({ mode: "scratch", festival, scheduledDate });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const handleCreated = (c: Campaign) => {
    setCampaigns((prev) => [c, ...prev]);
    setModal(null);
  };

  // ── Polling fallback ─────────────────────────────────────────────────────
  // Redis pub/sub is fire-and-forget — if the browser isn't subscribed at
  // the exact moment the worker emits `done`, that message vanishes and
  // the WebSocket closes without telling the UI the run finished. The
  // poller hits /api/campaigns/{id}/status every 3s and converges as soon
  // as the post-count query for the campaign catches up to totalPosts. This
  // is the same pattern Stripe and Vercel use to handle async-job message
  // loss. See WEBSOCKET_ARCHITECTURE.md if you need the full rationale.
  const stopPolling = useCallback((campaignId: string) => {
    const t = pollRefs.current.get(campaignId);
    if (t) clearInterval(t);
    pollRefs.current.delete(campaignId);
    pollDeadlineRefs.current.delete(campaignId);
  }, []);

  const startPolling = useCallback(
    (campaign: Campaign) => {
      const id = campaign._id;
      // Don't double-start. Don't restart if state is already terminal.
      if (pollRefs.current.has(id)) return;

      pollDeadlineRefs.current.set(id, Date.now() + POLL_DEADLINE_MS);

      const tick = async () => {
        const deadline = pollDeadlineRefs.current.get(id) ?? 0;
        if (Date.now() > deadline) {
          stopPolling(id);
          setGenStates((prev) => ({
            ...prev,
            [id]: {
              status: "error",
              message: "Generation is taking longer than expected. Please try again.",
            },
          }));
          return;
        }

        try {
          const res = await fetch(`/api/campaigns/${id}/status`, {
            credentials: "include",
          });
          if (!res.ok) {
            // Diagnostic — see Bug 2 in the codebase change log. Remove
            // this block once the polling-completion path is confirmed.
            // eslint-disable-next-line no-console
            console.log("[campaign-poll]", id, "non-OK response", res.status);
            return; // transient — keep polling
          }
          const data = unwrap(await res.json());

          const generated = typeof data.generatedPosts === "number" ? data.generatedPosts : 0;
          const total = typeof data.totalPosts === "number" ? data.totalPosts : campaign.totalPosts;

          // Diagnostic — see Bug 2. The "done" branch only fires when both
          // total > 0 AND generated >= total. Watching these logs in the
          // browser console makes it obvious which condition is missing.
          // eslint-disable-next-line no-console
          console.log("[campaign-poll]", id, {
            response: data,
            generated,
            total,
            campaignTotalPosts: campaign.totalPosts,
            doneConditionMet: total > 0 && generated >= total,
            why:
              total <= 0
                ? "totalPosts is 0 — done condition can never be true"
                : generated < total
                ? `generated (${generated}) < total (${total}) — still waiting`
                : "all good — should transition to done",
          });

          if (total > 0 && generated >= total) {
            stopPolling(id);
            setGenStates((prev) => ({
              ...prev,
              [id]: { status: "done", total },
            }));
            // Refresh the list so generatedPosts/status reflect what the
            // status endpoint just self-healed in MongoDB.
            fetchCampaigns();
          } else {
            // Update progress message even mid-poll so the user sees motion.
            setGenStates((prev) => {
              const c = prev[id];
              if (!c || c.status !== "running") return prev;
              return {
                ...prev,
                [id]: {
                  ...c,
                  current: generated,
                  total,
                  message: `Post ${generated} of ${total} complete...`,
                },
              };
            });
          }
        } catch {
          // Network error — keep polling. Deadline guard handles the
          // pathological case of a sustained outage.
        }
      };

      // Run an immediate first tick so we don't wait 3s before the first
      // status call after the WS dies. Subsequent ticks are on interval.
      tick();
      const handle = setInterval(tick, POLL_INTERVAL_MS);
      pollRefs.current.set(id, handle);
    },
    [fetchCampaigns, stopPolling]
  );

  // ── Resume in-progress generations on remount ───────────────────────────
  // When the user returns to the campaigns page mid-generation, the page
  // remounts with empty `genStates`. The Celery task is still running on
  // the worker (it's process-isolated from the browser), so we just need
  // to re-attach a poller and surface the live progress on each card.
  //
  // Detection heuristic — campaign is "likely in-progress" when ALL hold:
  //   • celeryTaskId is set (POST /api/campaigns/generate has been called)
  //   • generatedPosts < totalPosts (still has posts to write)
  //   • lastGeneratedAt is within the last 30 minutes (avoid resurrecting
  //     stale, abandoned runs from yesterday — those are stuck cases the
  //     user should re-run via the Retry button)
  //
  // We never override a genState that's already running/done — the active
  // tab the user came from owns its state. We also never start a poller
  // that's already running (`pollRefs.current.has`).
  useEffect(() => {
    const RESUME_WINDOW_MS = 30 * 60 * 1000;
    const now = Date.now();
    for (const c of campaigns) {
      if (pollRefs.current.has(c._id)) continue;

      const lastGenAt = c.lastGeneratedAt
        ? new Date(c.lastGeneratedAt).getTime()
        : 0;
      const genAgeMs = lastGenAt > 0 ? now - lastGenAt : Infinity;
      const isInProgress =
        !!c.celeryTaskId &&
        (c.generatedPosts ?? 0) < (c.totalPosts ?? 0) &&
        (c.totalPosts ?? 0) > 0 &&
        genAgeMs < RESUME_WINDOW_MS;

      if (!isInProgress) continue;

      setGenStates((prev) => {
        const cur = prev[c._id]?.status;
        if (cur === "running" || cur === "done") return prev;
        return {
          ...prev,
          [c._id]: {
            status: "running",
            current: c.generatedPosts ?? 0,
            total: c.totalPosts,
            message: `Post ${c.generatedPosts ?? 0} of ${c.totalPosts} complete...`,
          },
        };
      });
      startPolling(c);
    }
  }, [campaigns, startPolling]);

  // ── Save a finished image_done event as a Post linked to the campaign.
  // Best-effort — if the API rejects we log and continue, so a failure on
  // one post doesn't abort the whole campaign run.
  const persistPost = useCallback(
    async (campaign: Campaign, event: any) => {
      // eslint-disable-next-line no-console
      console.log('[persistPost] called', campaign._id, event.post_number, event.image_url);
      try {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            brandId: campaign.brandId ?? brandId,
            campaignId: campaign._id,
            content: (event.caption || "").trim() || `Post ${event.post_number}`,
            platform: event.platform ?? "instagram",
            imageUrl: event.image_url ?? null,
            // Mirror the campaign concept onto every campaign post so
            // the Content Hub's PostDetailModal Prompt section has
            // something to show. Per-post variants don't have their
            // own prompt — the campaign concept is the closest field.
            prompt:
              (campaign as any).describeConcept ??
              (campaign as any).description ??
              null,
          }),
        });
      } catch (err) {
        console.error("[campaign] persistPost failed", err);
      }
    },
    [brandId]
  );

  // ── Open a WebSocket for a campaign run and wire up event handlers.
  // Mirrors the pattern used in apps/web/src/app/dashboard/posts/create/page.tsx
  // (WS token → URL → 600s inactivity timer → heartbeat message rotation).
  const handleGenerate = useCallback(
    async (campaign: Campaign) => {
      const id = campaign._id;

      // Tear down any leftover socket / timer for this campaign
      const existing = wsRefs.current.get(id);
      if (existing) {
        try { existing.close(); } catch { /* already closed */ }
        wsRefs.current.delete(id);
      }
      const existingTimer = inactivityRefs.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        inactivityRefs.current.delete(id);
      }
      // Also kill any leftover poller from a previous run / disconnect —
      // we're about to start fresh.
      stopPolling(id);
      heartbeatIdxRefs.current.set(id, 0);

      setGenStates((prev) => ({
        ...prev,
        [id]: {
          status: "running",
          current: 0,
          total: campaign.totalPosts,
          message: STEP_MESSAGES.generating,
        },
      }));

      // 1. Queue the campaign
      let queueRes: Response;
      try {
        queueRes = await fetch("/api/campaigns/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ campaignId: id }),
        });
      } catch {
        setGenStates((prev) => ({
          ...prev,
          [id]: { status: "error", message: "Network error. Please try again." },
        }));
        return;
      }

      const queueData = unwrap(await queueRes.json().catch(() => ({})));
      if (!queueRes.ok || !queueData.jobId || !queueData.wsToken || !queueData.wsUrl) {
        setGenStates((prev) => ({
          ...prev,
          [id]: {
            status: "error",
            message: queueData.error ?? "Could not start campaign generation.",
          },
        }));
        return;
      }

      // 2. Open the WebSocket
      const wsUrl = `${queueData.wsUrl}/ws/campaign/${queueData.jobId}?ws_token=${queueData.wsToken}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setGenStates((prev) => ({
          ...prev,
          [id]: { status: "error", message: "Could not open progress stream." },
        }));
        return;
      }
      wsRefs.current.set(id, ws);

      // 3. Inactivity watchdog — reset on every inbound message (incl. heartbeat).
      // Identical contract to posts/create page: 10 min of total silence = dead.
      const resetInactivity = () => {
        const prev = inactivityRefs.current.get(id);
        if (prev) clearTimeout(prev);
        const t = setTimeout(() => {
          inactivityRefs.current.delete(id);
          try { ws.close(1000); } catch { /* already closed */ }
          setGenStates((prevState) => ({
            ...prevState,
            [id]: {
              status: "error",
              message: "Lost connection to AI service. Please try again.",
            },
          }));
        }, INACTIVITY_TIMEOUT_MS);
        inactivityRefs.current.set(id, t);
      };
      resetInactivity();

      ws.onmessage = async (evt) => {
        let event: any;
        try { event = JSON.parse(evt.data); } catch { return; }
        resetInactivity();

        if (event.step === "done") {
          const t = inactivityRefs.current.get(id);
          if (t) clearTimeout(t);
          inactivityRefs.current.delete(id);
          try { ws.close(1000); } catch { /* already closed */ }
          wsRefs.current.delete(id);
          // Stop any polling that was started by an earlier disconnect —
          // the authoritative `done` event has now arrived via the WS.
          stopPolling(id);

          const total = event.result?.total_posts_generated ?? campaign.totalPosts;
          setGenStates((prev) => ({
            ...prev,
            [id]: { status: "done", total },
          }));
          // Refresh the campaign list so generatedPosts/status reflect the run.
          fetchCampaigns();
        } else if (event.step === "error") {
          const t = inactivityRefs.current.get(id);
          if (t) clearTimeout(t);
          inactivityRefs.current.delete(id);
          try { ws.close(1000); } catch { /* already closed */ }
          wsRefs.current.delete(id);
          stopPolling(id);
          setGenStates((prev) => ({
            ...prev,
            [id]: {
              status: "error",
              message: "Something went wrong. Please try again.",
            },
          }));
        } else if (event.step === "image_done") {
          // Save this post to MongoDB linked to the campaign, then update the
          // progress card so the user sees count + message.
          await persistPost(campaign, event);
          const sequence = typeof event.sequence === "number" ? event.sequence : 0;
          const total = typeof event.total === "number" ? event.total : campaign.totalPosts;
          setGenStates((prev) => ({
            ...prev,
            [id]: {
              status: "running",
              current: sequence,
              total,
              message: `Post ${sequence} of ${total} complete...`,
            },
          }));
        } else if (event.step === "heartbeat") {
          const idx = heartbeatIdxRefs.current.get(id) ?? 0;
          const msg = HEARTBEAT_MESSAGES[idx % HEARTBEAT_MESSAGES.length];
          heartbeatIdxRefs.current.set(id, idx + 1);
          setGenStates((prev) => {
            const cur = prev[id];
            if (cur?.status !== "running") return prev;
            return { ...prev, [id]: { ...cur, message: msg } };
          });
        } else if (event.step && STEP_MESSAGES[event.step]) {
          const msg = STEP_MESSAGES[event.step];
          setGenStates((prev) => {
            const cur = prev[id];
            if (cur?.status !== "running") return prev;
            return { ...prev, [id]: { ...cur, message: msg } };
          });
        }
        // Unknown event types are intentionally ignored — the user only ever
        // sees strings from STEP_MESSAGES / HEARTBEAT_MESSAGES.
      };

      ws.onclose = () => {
        wsRefs.current.delete(id);
        // The WebSocket is no longer guaranteed to deliver anything, so we
        // can stop the inactivity watchdog here — its job was to detect a
        // silent socket, but a closed socket is not silent, it's gone.
        const t = inactivityRefs.current.get(id);
        if (t) clearTimeout(t);
        inactivityRefs.current.delete(id);

        // Polling fallback. If the close happened AFTER `done` was
        // delivered, genStates is already in `done`/`error` and we skip.
        // Otherwise — including the bug case where the socket closes
        // cleanly (1000) right before `done` was emitted but after the
        // subscribe window closed — start polling /status until the post
        // count converges. Don't set an error here; the deadline guard
        // in the poller is the real timeout.
        setGenStates((prev) => {
          const cur = prev[id];
          if (!cur || cur.status === "done" || cur.status === "error") {
            return prev;
          }
          // Kick off polling outside this updater (no async work in setState).
          queueMicrotask(() => startPolling(campaign));
          return prev;
        });
      };
    },
    [fetchCampaigns, persistPost, startPolling, stopPolling]
  );

  const handleRetry = useCallback(
    (campaign: Campaign) => {
      // Wipe both the user-visible state and any in-flight poller from
      // a previous attempt before kicking off a fresh run.
      stopPolling(campaign._id);
      setGenStates((prev) => {
        const { [campaign._id]: _drop, ...rest } = prev;
        return rest;
      });
      handleGenerate(campaign);
    },
    [handleGenerate, stopPolling]
  );

  return (
    <>
      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Outer page wrapper — no padding/margin/max-width. The
          dashboard layout shell owns all outer spacing. */}
      <div>
        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{ fontSize: 22, fontWeight: 500, color: "#fff", margin: 0 }}
            >
              All Campaigns
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                margin: "4px 0 0",
              }}
            >
              {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} for
              this brand
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: "scratch" })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "#0A0A0A",
              cursor: "pointer",
            }}
          >
            <Plus size={15} />
            New Campaign
          </button>
        </div>

        {/* ── Start from template ── */}
        <section style={{ marginBottom: 36 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={14} />
            Start from template
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            {CAMPAIGN_TEMPLATES.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onClick={() => setModal({ mode: "template", template: tpl })}
              />
            ))}
          </div>
        </section>

        {/* Divider */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 28,
          }}
        />

        {/* ── Existing campaigns ── */}
        <section>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Repeat size={14} />
            Your campaigns
          </div>

          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "40px 0",
                color: "rgba(255,255,255,0.40)",
                fontSize: 13,
              }}
            >
              <Loader2
                size={16}
                style={{ animation: "spin 1s linear infinite" }}
              />
              Loading campaigns…
            </div>
          ) : campaigns.length === 0 ? (
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px dashed rgba(255,255,255,0.12)",
                borderRadius: 16,
                padding: "48px 32px",
                textAlign: "center",
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
              }}
            >
              <Target
                size={32}
                style={{
                  margin: "0 auto 12px",
                  opacity: 0.3,
                  display: "block",
                }}
              />
              No campaigns yet. Start from a template above or create a new one.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: 16,
              }}
            >
              {campaigns.map((c) => (
                <CampaignCard
                  key={c._id}
                  campaign={c}
                  genState={genStates[c._id] ?? { status: "idle" }}
                  onClone={(src) =>
                    setModal({ mode: "clone", sourceCampaign: src })
                  }
                  onGenerate={handleGenerate}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {modal && brandId && (
        <CreateCampaignModal
          mode={modal.mode}
          template={modal.template}
          sourceCampaign={modal.sourceCampaign}
          festival={modal.festival}
          scheduledDate={modal.scheduledDate}
          brandId={brandId}
          onClose={() => setModal(null)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
