"use client";

/**
 * PlanMonthModal — 2-step Monthly AI Planning wizard.
 *
 * Step 1 — Context collection:
 *   Products/services to feature, posts per week, upcoming events,
 *   let-AI-decide-days toggle + optional day-of-week picker.
 *
 * Step 2 — AI plan preview:
 *   Card grid of planned posts (date, theme, platform, festival badge).
 *   Delete individual cards. Regenerate or Generate All.
 */

import { unwrap } from "@/lib/utils/api-fetch";
import { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Loader2,
  RefreshCw,
  Trash2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanCard {
  date: string;           // ISO date string  e.g. "2026-04-21"
  theme: string;          // e.g. "Product Hero — Executive Coaching"
  contentType: string;    // e.g. "Carousel"
  productOrService: string;
  platform: string;       // e.g. "instagram"
  festival?: string;      // e.g. "Earth Day"  (optional)
}

interface CatalogItem {
  _id: string;
  name: string;
  type: "product" | "service";
}

interface Props {
  /** ISO date string for the 1st of the month being planned */
  monthStart: Date;
  brandId: string;
  /** Currently selected holiday country code (e.g. "IN") */
  country: string | null;
  onClose: () => void;
  /** Called when user clicks "Generate All Posts" — receives the confirmed plan */
  onGenerateAll: (plan: PlanCard[]) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POSTS_PER_WEEK_OPTIONS = [
  { label: "3", value: 3 },
  { label: "5", value: 5 },
  { label: "7", value: 7 },
  { label: "Daily", value: 7 }, // alias shown as "Daily"
];
const PPW_DISPLAY = [
  { label: "3 / week", value: 3 },
  { label: "5 / week", value: 5 },
  { label: "7 / week", value: 7 },
  { label: "Daily",    value: -1 },  // -1 = daily (every day)
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📷",
  facebook:  "👤",
  linkedin:  "💼",
  twitter:   "🐦",
  default:   "📱",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function platformIcon(p: string): string {
  return PLATFORM_ICONS[p.toLowerCase()] ?? PLATFORM_ICONS.default;
}

function formatCardDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ─── Shared glass input styles ────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: "9px 14px",
  color: "#fff",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "Inter, sans-serif",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlanMonthModal({
  monthStart,
  brandId,
  country,
  onClose,
  onGenerateAll,
}: Props) {
  const monthName = MONTH_NAMES[monthStart.getMonth()];
  const year      = monthStart.getFullYear();

  // ── Step tracking ──
  const [step, setStep] = useState<1 | 2>(1);

  // ── Catalog items ──
  const [catalog, setCatalog]       = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // ── Step 1 form ──
  const [selectedItems,  setSelectedItems]  = useState<string[]>([]);   // item._id list
  const [postsPerWeek,   setPostsPerWeek]   = useState<number>(5);
  const [dailyMode,      setDailyMode]      = useState(false);           // -1 alias
  const [upcomingEvents, setUpcomingEvents] = useState("");
  const [letAIDecide,    setLetAIDecide]    = useState(true);
  const [selectedDays,   setSelectedDays]   = useState<number[]>([1,3,5]); // Mon,Wed,Fri

  // ── Step 2 state ──
  const [plan,       setPlan]       = useState<PlanCard[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState<string | null>(null);

  // ── Fetch catalog on mount ──
  useEffect(() => {
    if (!brandId) return;
    setCatalogLoading(true);
    fetch(`/api/catalog?brandId=${brandId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : { items: [] }).then(unwrap)
      .then((d) => {
        const items: CatalogItem[] = [
          ...(d.products ?? []).map((p: any) => ({ _id: p._id, name: p.name, type: "product" as const })),
          ...(d.services ?? []).map((s: any) => ({ _id: s._id, name: s.name, type: "service" as const })),
        ];
        setCatalog(items);
      })
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, [brandId]);

  // ── Toggle catalog item selection ──
  function toggleItem(id: string) {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ── Toggle day selection ──
  function toggleDay(idx: number) {
    setSelectedDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
  }

  // ── Call AI to generate plan ──
  async function generatePlan() {
    setGenerating(true);
    setGenError(null);

    const selectedCatalog = catalog.filter((c) => selectedItems.includes(c._id));
    const productsToFeature = selectedCatalog.filter((c) => c.type === "product").map((c) => c.name);
    const servicesToFeature = selectedCatalog.filter((c) => c.type === "service").map((c) => c.name);

    try {
      const res = await fetch("/api/ai/plan-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          month: monthStart.getMonth() + 1,
          year,
          productsToFeature,
          servicesToFeature,
          postsPerWeek: dailyMode ? -1 : postsPerWeek,
          upcomingEvents: upcomingEvents.trim() || null,
          letAIDecideDays: letAIDecide,
          selectedDays: letAIDecide ? [] : selectedDays.map((d) => DAY_LABELS[d]),
          country: country ?? null,
        }),
      });

      if (!res.ok) {
        const body = unwrap(await res.json().catch(() => ({})));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }

      const data = unwrap(await res.json());
      setPlan(data.plan ?? []);
      setStep(2);
    } catch (e: any) {
      setGenError(e.message ?? "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Delete a card from the plan ──
  function removeCard(idx: number) {
    setPlan((prev) => prev.filter((_, i) => i !== idx));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

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
        zIndex: 500,
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal shell — Primary glass card tokens (design-tokens.md §1). */}
      <div
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          width: "100%",
          maxWidth: step === 2 ? 780 : 580,
          maxHeight: "92vh",
          overflowY: "auto",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: "28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
          transition: "max-width 0.25s ease",
        }}
      >
        {/* ── Modal header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} style={{ color: "#86EFAC" }} />
              <span style={{ fontSize: 18, fontWeight: 500, color: "#fff" }}>
                {step === 1 ? `Plan ${monthName} with AI` : `Your ${monthName} Plan`}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 4 }}>
              {step === 1
                ? `Tell AI what to feature — it'll build a full ${monthName} ${year} content calendar`
                : `${plan.length} posts planned · Review, remove cards, then generate`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: 6,
              color: "rgba(255,255,255,0.60)",
              cursor: "pointer",
              display: "flex",
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ════════════════════════════════════════════════════ STEP 1 */}
        {step === 1 && (
          <>
            {/* Products / Services multi-select */}
            <div>
              <Label>What to feature this month</Label>
              {catalogLoading ? (
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading catalog…
                </div>
              ) : catalog.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
                  No products or services found for this brand — AI will use brand context only.
                </p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {catalog.map((item) => {
                    const active = selectedItems.includes(item._id);
                    return (
                      <button
                        key={item._id}
                        onClick={() => toggleItem(item._id)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 500,
                          border: active
                            ? "1px solid rgba(134,239,172,0.70)"
                            : "1px solid rgba(255,255,255,0.14)",
                          background: active
                            ? "rgba(134,239,172,0.15)"
                            : "rgba(255,255,255,0.06)",
                          color: active ? "#86EFAC" : "rgba(255,255,255,0.60)",
                          cursor: "pointer",
                        }}
                      >
                        {item.type === "product" ? "📦" : "⚙️"} {item.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Posts per week */}
            <div>
              <Label>Posts per week</Label>
              <div style={{ display: "flex", gap: 8 }}>
                {PPW_DISPLAY.map(({ label, value }) => {
                  const isDaily  = value === -1;
                  const active   = isDaily ? dailyMode : (!dailyMode && postsPerWeek === value);
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        if (isDaily) { setDailyMode(true); }
                        else         { setDailyMode(false); setPostsPerWeek(value); }
                      }}
                      style={{
                        padding: "7px 18px",
                        borderRadius: 20,
                        fontSize: 13,
                        fontWeight: 500,
                        border: active
                          ? "1px solid rgba(255,255,255,0.60)"
                          : "1px solid rgba(255,255,255,0.14)",
                        background: active
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(255,255,255,0.06)",
                        color: active ? "#fff" : "rgba(255,255,255,0.55)",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upcoming events */}
            <div>
              <Label>Any upcoming launches or events? (optional)</Label>
              <textarea
                value={upcomingEvents}
                onChange={(e) => setUpcomingEvents(e.target.value)}
                placeholder="e.g. New product drop on Apr 20, Summer sale starts May 1…"
                rows={2}
                style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.55 }}
              />
            </div>

            {/* Let AI decide days */}
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={letAIDecide}
                  onChange={(e) => setLetAIDecide(e.target.checked)}
                  style={{ accentColor: "#86EFAC", width: 15, height: 15 }}
                />
                <div>
                  <div style={{ fontSize: 13, color: "#fff" }}>Let AI decide posting days</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>
                    AI will pick optimal days based on content type and frequency
                  </div>
                </div>
              </label>

              {/* Day-of-week picker — shown when AI doesn't decide */}
              {!letAIDecide && (
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>
                    Select posting days
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {DAY_LABELS.map((day, idx) => {
                      const active = selectedDays.includes(idx);
                      return (
                        <button
                          key={day}
                          onClick={() => toggleDay(idx)}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: 500,
                            border: active
                              ? "1px solid rgba(255,255,255,0.55)"
                              : "1px solid rgba(255,255,255,0.12)",
                            background: active
                              ? "rgba(255,255,255,0.18)"
                              : "rgba(255,255,255,0.05)",
                            color: active ? "#fff" : "rgba(255,255,255,0.45)",
                            cursor: "pointer",
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {genError && (
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
                {genError}
              </div>
            )}

            {/* CTA */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 10,
                  fontSize: 13,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,255,255,0.60)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={generatePlan}
                disabled={generating}
                style={{
                  flex: 2,
                  padding: "11px 0",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: generating ? "rgba(255,255,255,0.45)" : "#fff",
                  border: "none",
                  color: "#0A0A0A",
                  cursor: generating ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    Building your plan…
                  </>
                ) : (
                  <>
                    Generate Plan
                    <ChevronRight size={14} />
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════ STEP 2 */}
        {step === 2 && (
          <>
            {/* Plan card grid */}
            {plan.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 13,
                }}
              >
                All posts removed. Click "Regenerate Plan" to start over.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                  gap: 12,
                }}
              >
                {plan.map((card, idx) => (
                  <PlanCardItem
                    key={`${card.date}-${idx}`}
                    card={card}
                    onRemove={() => removeCard(idx)}
                  />
                ))}
              </div>
            )}

            {/* Error (regenerate failed) */}
            {genError && (
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
                {genError}
              </div>
            )}

            {/* Bottom actions */}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 18,
              }}
            >
              <button
                onClick={() => { setStep(1); setGenError(null); }}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  fontSize: 12,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,255,255,0.60)",
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>

              <button
                onClick={generatePlan}
                disabled={generating}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.75)",
                  cursor: generating ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {generating ? (
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <RefreshCw size={12} />
                )}
                Regenerate Plan
              </button>

              <div style={{ flex: 1 }} />

              <button
                onClick={() => onGenerateAll(plan)}
                disabled={plan.length === 0}
                style={{
                  padding: "11px 22px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: plan.length === 0 ? "rgba(255,255,255,0.30)" : "#fff",
                  border: "none",
                  color: "#0A0A0A",
                  cursor: plan.length === 0 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Sparkles size={14} />
                Generate All Posts ✨
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PlanCardItem ─────────────────────────────────────────────────────────────

function PlanCardItem({
  card,
  onRemove,
}: {
  card: PlanCard;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.11)",
        borderRadius: 14,
        padding: "14px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
      }}
    >
      {/* Delete button */}
      <button
        onClick={onRemove}
        title="Remove from plan"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(239,68,68,0.12)",
          border: "none",
          borderRadius: 6,
          padding: 4,
          color: "#EF4444",
          cursor: "pointer",
          display: "flex",
        }}
      >
        <Trash2 size={12} />
      </button>

      {/* Date */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.50)", paddingRight: 22 }}>
        {formatCardDate(card.date)}
      </div>

      {/* Theme */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "#fff",
          lineHeight: 1.4,
          paddingRight: 8,
        }}
      >
        {card.theme}
      </div>

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
        {/* Platform */}
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {platformIcon(card.platform)}
          <span style={{ textTransform: "capitalize" }}>{card.platform}</span>
        </span>

        {/* Content type */}
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.07)",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {card.contentType}
        </span>

        {/* Festival badge */}
        {card.festival && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "#FCD34D",
              background: "rgba(252,211,77,0.12)",
              border: "1px solid rgba(252,211,77,0.20)",
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            🎉 {card.festival}
          </span>
        )}
      </div>
    </div>
  );
}
