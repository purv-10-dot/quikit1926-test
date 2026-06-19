"use client";

export const dynamic = "force-dynamic";

/**
 * Brand Creation Wizard — 6-step flow.
 *
 * Step 1 — Website entry + scrape trigger
 * Step 2 — AI Analysis review (editable, confidence badges)
 * Step 3 — Catalog Discovery (curate scraped offerings)
 * Step 4 — Visual Identity (logo, colors, typography)
 * Step 5 — Tone Attributes (voice, tone tags, hashtags)
 * Step 6 — Review & Create (avoid list, USPs, writing style)
 *
 * CRITICAL: While this page is mounted, BrandCreationContext.wizardActive=true,
 * which locks out the entire sidebar in DashboardLayout.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Globe,
  Upload,
  ChevronDown,
  Check,
} from "lucide-react";
import { useBrandCreation } from "@/components/providers/BrandCreationContext";
import { offeringSetLabel } from "@/lib/offerings/labels";
import { unwrap } from "@/lib/utils/api-fetch";
import CatalogDiscoveryStep, {
  offeringId,
  type CatalogOffering,
} from "./CatalogDiscoveryStep";

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = "high" | "medium" | "low";

// Phase 2: unified Offering shape from the scraper. `type` is a free
// string (product / service / menu_item / project / treatment / etc. —
// see lib/offerings/labels.ts for the conventional set). Mirrors the
// ScrapedOffering Pydantic model in apps/ai-service/models.py.
interface ScrapedOffering {
  type: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  duration?: string | null;
  tags?: string[];
  image_url?: string | null;
  url?: string | null;
  source?: string | null;
  confidence?: string | null;
  /** Phase 5 LLM marketability score (0-100); drives Step 3 sort order. */
  marketability?: number | null;
}

interface ScrapeResult {
  brand_identity?: {
    name?: string;
    about?: string;
    country?: string;
    tagline?: string;
    brand_voice?: string;
    brand_story?: string;
    tone_attributes?: string[];
    writing_style?: string;
  };
  visual_branding?: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    headline_font?: string;
    body_font?: string;
    accent_font?: string;
  };
  seo_social?: {
    hashtags?: string[];
    keywords?: string[];
    things_to_avoid?: string[];
  };
  offerings?: ScrapedOffering[];
  // Phase 1 sitemap / nav category hints — surfaced for the Phase 3
  // curation UI; the wizard ignores this field today.
  categories?: Array<{ name: string; url?: string | null; source?: string | null }>;
}

// ─── Wizard state ─────────────────────────────────────────────────────────────

interface WizardData {
  // Step 1
  websiteUrl: string;
  manualMode: boolean;
  scrapeId: string | null;
  scrapeData: ScrapeResult | null;
  // Step 2
  brandName: string;
  industry: string;
  country: string;
  tagline: string;
  about: string;
  brandStory: string;
  confidence: Record<string, Confidence>;
  // Step 3
  logoUrl: string;
  logoFile: File | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  typographyPrimary: string;
  typographySecondary: string;
  typographyAccent: string;
  // Step 4
  brandVoice: string;
  toneAttributes: string[];
  hashtags: string[];
  // Step 5
  thingsToAvoid: string[];
  usps: string[];
  writingStyle: string;
  // Hidden — populated from the user's curation choices on Step 3, then
  // POSTed alongside brand creation. Step 3 reads the full discovered
  // list from scrapeData.offerings; this field holds only the subset
  // the user actually wants in their catalog.
  offerings: ScrapedOffering[];
  // Phase 3: which discovered offerings the user has ticked in the
  // curation step. IDs are synthesized via offeringId() from the step
  // component. Persists across step-back/forward navigation.
  selectedOfferingIds: string[];
}

// ─── Google Fonts subset ──────────────────────────────────────────────────────

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Raleway",
  "Playfair Display", "Merriweather", "Source Sans Pro", "Nunito",
  "Poppins", "Ubuntu", "Oswald", "PT Sans", "Noto Sans",
];

// ─── FontPicker ────────────────────────────────────────────────────────────────
// Custom listbox replacement for the native <select> on the typography step.
// Native <select> popups are OS-rendered and cannot be styled with
// backdrop-filter, custom hover states, or rounded corners — they break the
// glass aesthetic with a plain white opaque popup. This component reproduces
// the menu using a styled popover so every surface in the wizard has the
// same frosted appearance.
//
// Higher background alpha than the wizard card (0.85 vs 0.14) is intentional:
// dropdown menus need contrast for the option text to be readable against the
// blurred wallpaper underneath.

function FontPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click — pointerdown not click so the menu also closes
  // when the user clicks a tag input or another menu trigger.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%" }}
    >
      {/* Trigger — matches the look of the previous inline <select>: white
          text, transparent bg, chevron at the right edge, label or selected
          font name as the visible text. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          color: "#fff",
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          fontFamily: "inherit",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          style={{
            color: value ? "#fff" : "rgba(255,255,255,0.65)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value || label}
        </span>
        <ChevronDown
          size={13}
          style={{
            color: "rgba(255,255,255,0.55)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {/* Popover — glass tokens deliberately stronger than the wizard card
          (0.85 alpha) so option text reads against the wallpaper. Scrollbar
          styled inline via :global() pseudo because we don't have a separate
          stylesheet for this component. */}
      {open && (
        <>
          <style>{`
            .qs-fontpicker-list::-webkit-scrollbar {
              width: 6px;
            }
            .qs-fontpicker-list::-webkit-scrollbar-track {
              background: transparent;
            }
            .qs-fontpicker-list::-webkit-scrollbar-thumb {
              background: rgba(255, 255, 255, 0.20);
              border-radius: 9999px;
            }
            .qs-fontpicker-list::-webkit-scrollbar-thumb:hover {
              background: rgba(255, 255, 255, 0.30);
            }
          `}</style>
          <div
            role="listbox"
            className="qs-fontpicker-list"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              maxHeight: 260,
              overflowY: "auto",
              background: "rgba(33, 33, 33, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 12,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
              padding: 4,
              zIndex: 50,
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.20) transparent",
            }}
          >
            {options.map((font) => {
              const isSelected = font === value;
              return (
                <button
                  key={font}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(font);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(255, 255, 255, 0.10)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "transparent";
                    }
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderRadius: 8,
                    background: isSelected
                      ? "rgba(255, 255, 255, 0.15)"
                      : "transparent",
                    color: "#fff",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontFamily: `'${font}', sans-serif`,
                    transition: "background 0.10s",
                  }}
                >
                  <span>{font}</span>
                  {isSelected && (
                    <Check
                      size={13}
                      style={{ color: "#fff", flexShrink: 0 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const GLASS_INPUT: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "Inter, sans-serif",
};

const GLASS_TEXTAREA: React.CSSProperties = {
  ...GLASS_INPUT,
  resize: "vertical" as const,
  lineHeight: 1.6,
  minHeight: 80,
};

function FieldLabel({
  children,
  confidence,
  required,
}: {
  children: React.ReactNode;
  confidence?: Confidence;
  required?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 7,
      }}
    >
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
        {children}
        {required && <span style={{ color: "#86EFAC", marginLeft: 2 }}>*</span>}
      </span>
      {confidence && <ConfidenceBadge level={confidence} />}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const map: Record<Confidence, { color: string; bg: string; label: string }> = {
    high:   { color: "#22C55E", bg: "rgba(34,197,94,0.12)",   label: "High"   },
    medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  label: "Medium" },
    low:    { color: "#6B7280", bg: "rgba(107,114,128,0.12)", label: "Low"    },
  };
  const c = map[level];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.color}33`,
        borderRadius: 4,
        padding: "1px 6px",
        letterSpacing: "0.03em",
      }}
    >
      {c.label}
    </span>
  );
}

// ─── TagInput ─────────────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const v = inputVal.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setInputVal("");
    inputRef.current?.focus();
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        padding: "8px 12px",
        minHeight: 46,
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        cursor: "text",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 500,
            color: "#fff",
            background: "linear-gradient(135deg,#F472B6,#FB923C)",
            cursor: "default",
          }}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(tag); }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.80)",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              lineHeight: 1,
            }}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !inputVal && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        placeholder={tags.length === 0 ? placeholder : ""}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "#fff",
          fontSize: 13,
          minWidth: 120,
          flex: 1,
          fontFamily: "Inter, sans-serif",
        }}
      />
      {inputVal.trim() && (
        <button
          type="button"
          onClick={add}
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "none",
            borderRadius: 6,
            padding: "2px 8px",
            color: "rgba(255,255,255,0.75)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      )}
    </div>
  );
}

// ─── ColorPicker ──────────────────────────────────────────────────────────────

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Color swatch */}
      <div
        style={{
          height: 52,
          background: isValid ? value : "rgba(255,255,255,0.10)",
          position: "relative",
        }}
      >
        <input
          type="color"
          value={isValid ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
          }}
        />
      </div>
      {/* Label + hex input */}
      <div style={{ padding: "8px 10px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "rgba(255,255,255,0.40)",
            letterSpacing: "0.08em",
            marginBottom: 5,
          }}
        >
          {label}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          maxLength={7}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#fff",
            fontSize: 13,
            fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

// Wizard is 6 steps: 1 URL → 2 AI Analysis → 3 Catalog Discovery → 4 Visual
// Identity → 5 Tone → 6 Review. Derive the array length from this constant
// so adding/removing a step doesn't leave the indicator out of sync (which
// is what produced the "appears wrong after renumbering" bug — the old
// hardcoded 5-segment array survived a 5→6 transition somewhere).
const WIZARD_TOTAL_STEPS = 6;

function WizardProgress({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {Array.from({ length: WIZARD_TOTAL_STEPS }, (_, i) => i + 1).map((s) => {
        // Active step is the BRIGHTEST so the user can locate themselves
        // at a glance. Previously the active segment used 0.75 white while
        // completed segments used 0.90 — that read as "the indicator went
        // backwards at my current step." Active = full white now;
        // completed = mid-bright; future = dim.
        const isPast = s < step;
        const isActive = s === step;
        const background = isActive
          ? "#FFFFFF"
          : isPast
          ? "rgba(255,255,255,0.55)"
          : "rgba(255,255,255,0.18)";
        return (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 4,
              background,
              transition: "background 0.25s",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────

const SCRAPE_STEPS = [
  "Mapping site structure…",
  "Analysing brand identity…",
  "Extracting visual elements…",
  "Almost done…",
];

function ScrapeLoadingScreen() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIdx((i) => Math.min(i + 1, SCRAPE_STEPS.length - 1));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "60px 0",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.12)",
          borderTop: "3px solid #ffffff",
          animation: "spin 1s linear infinite",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", marginBottom: 8 }}>
          Analysing your website
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)" }}>
          This takes up to 30 seconds
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}>
        {SCRAPE_STEPS.map((label, idx) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: idx <= activeIdx ? 1 : 0.3,
              transition: "opacity 0.4s",
            }}
          >
            {idx < activeIdx ? (
              <CheckCircle2 size={16} style={{ color: "#22C55E", flexShrink: 0 }} />
            ) : idx === activeIdx ? (
              <Loader2 size={16} style={{ color: "#fff", flexShrink: 0, animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.25)", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveConfidence(scrape: ScrapeResult): Record<string, Confidence> {
  const bi = scrape.brand_identity ?? {};
  const vb = scrape.visual_branding ?? {};
  return {
    brandName:  bi.name       ? "high"   : "low",
    industry:   bi.about      ? "medium" : "low",
    country:    bi.country    ? "high"   : "low",
    tagline:    bi.tagline    ? "high"   : "medium",
    about:      bi.about      ? (bi.about.length > 100 ? "high" : "medium") : "low",
    brandStory: bi.brand_story ? (bi.brand_story.length > 80 ? "high" : "medium") : "low",
    logoUrl:    vb.logo_url   ? "high"   : "low",
    colors:     (vb.primary_color || vb.secondary_color) ? "high" : "low",
  };
}

function applyScrapeTo(scrape: ScrapeResult, prev: WizardData): Partial<WizardData> {
  const bi = scrape.brand_identity ?? {};
  const vb = scrape.visual_branding ?? {};
  const ss = scrape.seo_social ?? {};
  // Gemini returns more brand_identity fields than ScrapeResult declares
  // (industry, key_selling_points). Read those through a widened view so
  // we don't have to touch the interface.
  const biExtra = bi as Record<string, unknown>;
  const kspRaw = biExtra.key_selling_points;
  return {
    scrapeData:          scrape,
    brandName:           bi.name        ?? prev.brandName,
    industry:            (typeof biExtra.industry === "string" ? biExtra.industry : null) ?? prev.industry,
    country:             bi.country     ?? prev.country,
    tagline:             bi.tagline     ?? prev.tagline,
    about:               bi.about       ?? prev.about,
    brandStory:          bi.brand_story ?? prev.brandStory,
    brandVoice:          bi.brand_voice ?? prev.brandVoice,
    toneAttributes:      Array.isArray(bi.tone_attributes) ? bi.tone_attributes : prev.toneAttributes,
    writingStyle:        bi.writing_style ?? prev.writingStyle,
    logoUrl:             vb.logo_url    ?? prev.logoUrl,
    primaryColor:        vb.primary_color   ?? prev.primaryColor,
    secondaryColor:      vb.secondary_color ?? prev.secondaryColor,
    accentColor:         vb.accent_color    ?? prev.accentColor,
    typographyPrimary:   vb.headline_font   ?? prev.typographyPrimary,
    typographySecondary: vb.body_font       ?? prev.typographySecondary,
    typographyAccent:    vb.accent_font     ?? prev.typographyAccent,
    hashtags:            Array.isArray(ss.hashtags)        ? ss.hashtags        : prev.hashtags,
    thingsToAvoid:       Array.isArray(ss.things_to_avoid) ? ss.things_to_avoid : prev.thingsToAvoid,
    usps:                Array.isArray(kspRaw) ? (kspRaw as string[]) : prev.usps,
    // Phase 3: don't auto-populate the brand-POST set from the scrape.
    // The full discovered list lives in scrapeData.offerings (above);
    // the Catalog Discovery step (Step 3) lets the user pick a subset
    // and writes those picks back into data.offerings on advance.
    // Result: scraping a brand with 80 offerings doesn't silently
    // create 80 catalog rows when the user only wanted 12.
    offerings:           prev.offerings,
    confidence:          deriveConfidence(scrape),
  };
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL: WizardData = {
  websiteUrl: "", manualMode: false, scrapeId: null, scrapeData: null,
  brandName: "", industry: "", country: "", tagline: "",
  about: "", brandStory: "", confidence: {},
  logoUrl: "", logoFile: null,
  // Neutrals chosen so a brand created without overriding Step 3 still
  // produces usable AI output. Pure black/white/blue defaults previously
  // bled into generated CTAs as a literal #0000FF button.
  primaryColor: "#1A1A2E", secondaryColor: "#FFFFFF", accentColor: "#FF6B35",
  typographyPrimary: "", typographySecondary: "", typographyAccent: "",
  brandVoice: "", toneAttributes: [], hashtags: [],
  thingsToAvoid: [], usps: [], writingStyle: "",
  offerings: [],
  selectedOfferingIds: [],
};

// ─── Shared layout wrapper ────────────────────────────────────────────────────
// Hoisted to module scope: when this lived inside BrandCreatePage, every
// keystroke produced a new StepWrapper reference and React unmounted/remounted
// the entire wrapper subtree (including every input as `children`), causing
// inputs to lose focus on every character.

function StepWrapper({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "24px 16px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <WizardProgress step={step} />
      {/* Primary glass card tokens — design-tokens.md §1. Mirrors the
          Create Post wizard step container so the brand wizard reads
          as the same layered glass surface. */}
      <div
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: "28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#fff", margin: 0 }}>
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setWizardActive } = useBrandCreation();

  // Edit mode — when the user clicks the pencil on /dashboard/brands the
  // route is /dashboard/brands/create?brandId=…&mode=edit. We reuse the
  // same wizard, just preloading the existing brand and switching the
  // submit handler from POST to PATCH /api/brands/[id]. AI generation
  // reads brand data from /api/brands/[id] on every run, so any edit
  // here flows automatically into post / campaign / image generation.
  const editBrandId =
    searchParams.get("mode") === "edit" ? searchParams.get("brandId") : null;
  const isEdit = !!editBrandId;

  // Lock out sidebar / header on mount ONLY when creating a fresh brand
  // (the locked flow CLAUDE.md describes). For edits the user already
  // has a workspace and must keep navigation — dimming the sidebar here
  // would hide the workspace they just came from.
  useEffect(() => {
    if (isEdit) return;
    setWizardActive(true);
    return () => setWizardActive(false);
  }, [setWizardActive, isEdit]);

  // Edit mode skips Step 1 (the URL-scrape step). Open directly on
  // Step 2 with the brand prefilled.
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(isEdit ? 2 : 1);
  const [data, setData] = useState<WizardData>(INITIAL);
  const [scraping, setScraping]   = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  // Prefill from /api/brands/[id] when entering edit mode.
  useEffect(() => {
    if (!editBrandId) return;
    let cancelled = false;
    (async () => {
      try {
        // Bug 3 fix — fetch brand fields AND existing offerings in
        // parallel. Without the offerings fetch, data.scrapeData stays
        // null and the auto-skip useEffect on Step 3 silently bounces
        // the user to Step 4, hiding their entire catalog from the
        // edit flow.
        const [brandRes, offeringsRes] = await Promise.all([
          fetch(`/api/brands/${editBrandId}`, { credentials: "include" }),
          fetch(
            `/api/offerings?brandId=${editBrandId}&limit=100`,
            { credentials: "include" },
          ),
        ]);
        if (!brandRes.ok || cancelled) return;
        const { brand } = unwrap(await brandRes.json());
        if (!brand || cancelled) return;

        // Load existing offerings if the request succeeded. A failure
        // here is non-fatal — the rest of the edit form still works.
        let existingOfferings: ScrapedOffering[] = [];
        if (offeringsRes.ok && !cancelled) {
          const { offerings: rows } = unwrap(await offeringsRes.json());
          if (Array.isArray(rows)) {
            existingOfferings = rows.map((o: Record<string, unknown>) => ({
              type: typeof o.type === "string" ? o.type : "product",
              name: typeof o.name === "string" ? o.name : "",
              description:
                typeof o.description === "string" ? o.description : null,
              category: typeof o.category === "string" ? o.category : null,
              price: typeof o.price === "string" ? o.price : null,
              duration: typeof o.duration === "string" ? o.duration : null,
              tags: Array.isArray(o.tags)
                ? (o.tags as unknown[]).filter(
                    (t): t is string => typeof t === "string",
                  )
                : [],
              image_url:
                Array.isArray(o.imageUrls) && o.imageUrls.length > 0
                  ? (o.imageUrls[0] as string)
                  : null,
              url: typeof o.url === "string" ? o.url : null,
              source: "existing",
              confidence: "high",
            }));
          }
        }

        setData((prev) => ({
          ...prev,
          websiteUrl:          brand.websiteUrl     ?? "",
          brandName:           brand.name           ?? "",
          industry:            brand.industry       ?? "",
          country:             brand.country        ?? "",
          tagline:             brand.tagline        ?? "",
          about:               brand.about          ?? "",
          brandStory:          brand.brandStory     ?? "",
          logoUrl:             brand.logoUrl        ?? "",
          primaryColor:        brand.primaryColors?.[0]   ?? prev.primaryColor,
          secondaryColor:      brand.secondaryColors?.[0] ?? prev.secondaryColor,
          accentColor:         brand.accentColor    ?? prev.accentColor,
          typographyPrimary:   brand.brandTypography?.headline_font ?? "",
          typographySecondary: brand.brandTypography?.body_font     ?? "",
          typographyAccent:    brand.brandTypography?.accent_font   ?? "",
          brandVoice:          brand.brandVoice     ?? "",
          toneAttributes: Array.isArray(brand.brandTone)         ? brand.brandTone         : [],
          hashtags:       Array.isArray(brand.hashtags)          ? brand.hashtags          : [],
          thingsToAvoid:  Array.isArray(brand.thingsToAvoid)     ? brand.thingsToAvoid     : [],
          usps:           Array.isArray(brand.keySellingPoints)  ? brand.keySellingPoints  : [],
          writingStyle:        brand.writing_style  ?? "",
          // Bug 3 — seed scrapeData.offerings with the existing catalog
          // so Step 3 renders them. Categories stays empty in edit mode
          // — we have no nav-discovery data on a brand we already own.
          // The auto-skip useEffect now sees offerings present and
          // keeps the user on Step 3 instead of bouncing to Step 4.
          scrapeData:
            existingOfferings.length > 0
              ? {
                  ...(prev.scrapeData ?? {}),
                  offerings: existingOfferings,
                  categories: prev.scrapeData?.categories ?? [],
                }
              : prev.scrapeData,
          // Default-select every existing offering so advancing past
          // Step 3 doesn't silently drop them. User can untick.
          selectedOfferingIds:
            existingOfferings.length > 0
              ? existingOfferings.map((o) => offeringId(o))
              : prev.selectedOfferingIds,
        }));
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editBrandId]);

  // Welcome banner for new signups
  const isNewUser = searchParams.get("newUser") === "true";
  const [showWelcome, setShowWelcome] = useState(isNewUser);
  useEffect(() => {
    if (!isNewUser) return;
    const t = setTimeout(() => setShowWelcome(false), 5000);
    return () => clearTimeout(t);
  }, [isNewUser]);

  // WebSocket ref — kept so we can close on unmount
  const wsRef = useRef<WebSocket | null>(null);
  // dataRef mirrors `data` so WebSocket callbacks always see current state
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Phase 3: auto-skip the Catalog Discovery step when there's nothing
  // to curate AND nothing to explore. Triggers when:
  //   * manual brand creation (data.scrapeData === null)
  //   * scrape returned zero offerings AND zero category hints
  // When there are category hints but no offerings, we KEEP the user on
  // step 3 — they can still click Explore on a sitemap-discovered
  // category to populate items. Without this guard the user would land
  // on an empty curation step they can't do anything with.
  useEffect(() => {
    if (step !== 3) return;
    const hasOfferings = (data.scrapeData?.offerings?.length ?? 0) > 0;
    const hasCategories = (data.scrapeData?.categories?.length ?? 0) > 0;
    if (!hasOfferings && !hasCategories) setStep(4);
  }, [step, data.scrapeData]);

  const upd = (patch: Partial<WizardData>) =>
    setData((d) => ({ ...d, ...patch }));

  // ── Scrape start ──────────────────────────────────────────────────────────
  const startScrape = async () => {
    setScrapeError(null);
    setScraping(true);
    try {
      const res = await fetch("/api/brands/scrape/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: data.websiteUrl,
          companyNameHint: data.brandName || undefined,
        }),
      });
      if (!res.ok) {
        // QuikIT error envelopes carry `error` at the top level alongside
        // `success: false` — unwrap() returns the original object in that
        // case (no `data` key), so reading `.error` still works.
        const err = unwrap(await res.json().catch(() => ({})));
        throw new Error(err?.error ?? "Scraping failed");
      }
      const { scrapeId, wsToken, wsUrl } = unwrap(await res.json());
      upd({ scrapeId });
      connectWebSocket(scrapeId, wsToken, wsUrl);
    } catch (e: any) {
      setScrapeError(e.message ?? "Could not start analysis.");
      setScraping(false);
    }
  };

  // ── WebSocket connection ───────────────────────────────────────────────────
  const connectWebSocket = useCallback(
    (scrapeId: string, wsToken: string | null, wsUrl: string) => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Fallback to HTTP polling when WebSocket is unavailable (e.g. no wsToken)
      if (!wsToken) {
        startPolling(scrapeId);
        return;
      }

      const url = `${wsUrl}/smart-scrape-v2/ws/${scrapeId}?ws_token=${wsToken}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        // WebSocket constructor threw (bad URL, etc.) — fall back to polling
        startPolling(scrapeId);
        return;
      }
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        let event: Record<string, any>;
        try { event = JSON.parse(evt.data); } catch { return; }

        if (event.type === "completed") {
          ws.close(1000);
          setScraping(false);
          const applied = applyScrapeTo(event.data ?? event, dataRef.current);
          upd(applied);
          setStep(2);
        } else if (event.type === "failed") {
          ws.close(1000);
          setScrapeError(
            event.error ??
            "We couldn't fully analyse this website. Bot protection may be blocking us. You can edit the details below."
          );
          setScraping(false);
          setStep(2);
        } else if (event.type === "timeout") {
          ws.close(1000);
          setScrapeError("Analysis timed out. Please enter your brand details manually.");
          setScraping(false);
        }
        // progress / ping — UI already shows animated loading screen, no action needed
      };

      ws.onerror = () => {
        // Non-fatal — the onclose handler runs next and decides what to do
      };

      ws.onclose = (evt) => {
        wsRef.current = null;
        // Abnormal close (not 1000/1001) while still scraping → fall back to polling
        if (evt.code !== 1000 && evt.code !== 1001) {
          // Only fall back if we haven't already resolved
          setScraping((stillScraping) => {
            if (stillScraping) {
              startPolling(scrapeId);
            }
            return stillScraping;
          });
        }
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── HTTP polling fallback (used when WebSocket is unavailable) ────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback((scrapeId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 × 3s = 90s max

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(pollRef.current!);
        setScrapeError("Analysis timed out. Please enter your brand details manually.");
        setScraping(false);
        return;
      }
      try {
        const res = await fetch(`/api/brands/scrape/status/${scrapeId}`);
        // QuikIT status route wraps the upstream pass-through payload in
        // { success: true, data: <upstream> } — unwrap once to get the
        // FastAPI shape (status/completed/failed + data/error fields).
        const result = unwrap(await res.json());

        if (result.status === "completed") {
          clearInterval(pollRef.current!);
          setScraping(false);
          const applied = applyScrapeTo(result.data ?? result, dataRef.current);
          upd(applied);
          setStep(2);
        } else if (result.status === "failed") {
          clearInterval(pollRef.current!);
          setScrapeError(
            result.error ??
            "We couldn't fully analyse this website. Bot protection may be blocking us. You can edit the details below."
          );
          setScraping(false);
          setStep(2);
        }
      } catch {
        // network error — keep trying
      }
    }, 3000);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Submit brand ──────────────────────────────────────────────────────────
  // In edit mode this PATCHes /api/brands/[id]; in create mode it POSTs
  // /api/brands. AI generation (post creator, campaign engine, image
  // pipeline) reads from /api/brands/[id] on every run, so an edit here
  // flows into every downstream consumer immediately.
  const handleCreate = async () => {
    setSaving(true);
    setSaveErr(null);
    const payload: Record<string, unknown> = {
      name:          data.brandName,
      industry:      data.industry,
      websiteUrl:    data.websiteUrl || null,
      country:       data.country,
      tagline:       data.tagline,
      about:         data.about,
      brandStory:    data.brandStory,
      logoUrl:       data.logoUrl || null,
      primaryColor:  data.primaryColor,
      secondaryColor: data.secondaryColor,
      accentColor:   data.accentColor,
      typography: {
        primary:   data.typographyPrimary   || null,
        secondary: data.typographySecondary || null,
        accent:    data.typographyAccent    || null,
      },
      brandVoice:     data.brandVoice,
      toneAttributes: data.toneAttributes,
      hashtags:       data.hashtags,
      thingsToAvoid:  data.thingsToAvoid,
      usps:           data.usps,
      writingStyle:   data.writingStyle,
    };
    // scrapeData / scraped offerings are only relevant on initial creation.
    // Phase 2: a single offerings[] array (each entry tagged with `type`)
    // replaces the v1 products+services split. /api/brands persists them
    // into the unified Offering table.
    if (!isEdit) {
      payload.scrapeData = data.scrapeData;
      payload.offerings = data.offerings;
    }

    try {
      const url = isEdit ? `/api/brands/${editBrandId}` : "/api/brands";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = unwrap(await res.json().catch(() => ({})));
        throw new Error(err?.error ?? (isEdit ? "Brand update failed" : "Brand creation failed"));
      }
      const json = unwrap(await res.json());
      const brand = json.brand;
      if (isEdit) {
        // Notify other tabs / components so the sidebar brand chip
        // refreshes without a hard reload.
        window.localStorage.setItem("workspace-updated", Date.now().toString());
        window.dispatchEvent(new CustomEvent("workspace-updated"));
        router.push("/dashboard/brands");
      } else {
        window.location.href = `/dashboard?brand=${brand._id}`;
      }
    } catch (e: any) {
      setSaveErr(e.message ?? "Something went wrong");
      setSaving(false);
    }
  };

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (step === 1) {
    if (scraping) {
      return (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 40px 40px" }}>
          <WizardProgress step={1} />
          <ScrapeLoadingScreen />
        </div>
      );
    }

    return (
      <StepWrapper step={step} title="Let's start with the basics">
        {/* Welcome banner — shown for new signups */}
        {showWelcome && (
          <div
            style={{
              background: "rgba(20,184,166,0.12)",
              border: "1px solid rgba(20,184,166,0.30)",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#5EEAD4", marginBottom: 4 }}>
                Welcome to QuikSocial! 🎉
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
                Let's set up your first workspace. It only takes 2 minutes.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowWelcome(false)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.40)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                lineHeight: 1,
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>
        )}

        {scrapeError && (
          <div style={{
            background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#EF4444",
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{scrapeError}</span>
          </div>
        )}

        {!data.manualMode ? (
          <div>
            <FieldLabel>Website URL</FieldLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Globe size={14} style={{
                  position: "absolute", left: 12, top: "50%",
                  transform: "translateY(-50%)", color: "rgba(255,255,255,0.40)", pointerEvents: "none",
                }} />
                <input
                  type="url"
                  value={data.websiteUrl}
                  onChange={(e) => upd({ websiteUrl: e.target.value })}
                  placeholder="https://yourbrand.com"
                  style={{ ...GLASS_INPUT, paddingLeft: 34 }}
                  onKeyDown={(e) => e.key === "Enter" && data.websiteUrl && startScrape()}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => upd({ manualMode: true })}
              style={{
                marginTop: 8, background: "none", border: "none",
                color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer",
                textDecoration: "underline", padding: 0,
              }}
            >
              Don't have a website?
            </button>
          </div>
        ) : (
          <div>
            <FieldLabel required>Brand Name</FieldLabel>
            <input
              value={data.brandName}
              onChange={(e) => upd({ brandName: e.target.value })}
              placeholder="e.g. Acme Corp"
              style={GLASS_INPUT}
            />
            <button
              type="button"
              onClick={() => upd({ manualMode: false })}
              style={{
                marginTop: 8, background: "none", border: "none",
                color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer",
                textDecoration: "underline", padding: 0,
              }}
            >
              I have a website
            </button>
          </div>
        )}

        {/* What we'll extract card */}
        <div style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14, padding: "16px 18px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 12 }}>
            ⚡ What we'll extract:
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)",
            gap: "8px 16px",
          }}>
            {[
              "Brand Logo",
              // Phase 2: catalog label adapts to the offering taxonomy.
              // Pre-scrape (data.scrapeData is null) → fall back to the
              // two most common types ("Products and Services"). After
              // scrape returns, derive the actual type distribution from
              // offerings[] so the heading reflects what the wizard found
              // ("Menu Items", "Treatments", "Projects and Events", etc.).
              offeringSetLabel(
                data.scrapeData?.offerings?.map((o) => o.type)
                  ?? ["product", "service"]
              ),
              "Keywords and hashtags",
              "Typography",
              "Brand Colors",
              "Brand Voice and Tone",
            ].map((item) => (
              <div key={item} style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.35)", flexShrink: 0, display: "inline-block" }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10, padding: "9px 16px", color: "rgba(255,255,255,0.65)",
              fontSize: 13, cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>

          <button
            type="button"
            onClick={() => {
              if (data.manualMode) {
                if (!data.brandName.trim()) return;
                setStep(2);
              } else {
                if (!data.websiteUrl.trim()) return;
                startScrape();
              }
            }}
            disabled={data.manualMode ? !data.brandName.trim() : !data.websiteUrl.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#fff", border: "none", borderRadius: 10,
              padding: "11px 20px", fontSize: 13, fontWeight: 600,
              color: "#0A0A0A",
              cursor: (data.manualMode ? !data.brandName.trim() : !data.websiteUrl.trim())
                ? "not-allowed" : "pointer",
              opacity: (data.manualMode ? !data.brandName.trim() : !data.websiteUrl.trim()) ? 0.5 : 1,
            }}
          >
            Get Started With Analysis <ArrowRight size={14} />
          </button>
        </div>
      </StepWrapper>
    );
  }

  // ── Step 2 — AI Analysis ──────────────────────────────────────────────────
  if (step === 2) {
    const conf = data.confidence;
    return (
      <StepWrapper step={step} title="AI Analysis">
        {scrapeError && (
          <div style={{
            background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 10, padding: "10px 14px", fontSize: 12,
            color: "#FCD34D", display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{scrapeError} — edit the fields below.</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <FieldLabel confidence={conf.brandName} required>Brand Name</FieldLabel>
            <input value={data.brandName} onChange={(e) => upd({ brandName: e.target.value })} style={GLASS_INPUT} placeholder="Brand name" />
          </div>
          <div>
            <FieldLabel confidence={conf.industry}>Industry</FieldLabel>
            <input value={data.industry} onChange={(e) => upd({ industry: e.target.value })} style={GLASS_INPUT} placeholder="e.g. Fashion" />
          </div>
          <div>
            <FieldLabel confidence={conf.country}>Country</FieldLabel>
            <input value={data.country} onChange={(e) => upd({ country: e.target.value })} style={GLASS_INPUT} placeholder="e.g. India" />
          </div>
          <div>
            <FieldLabel confidence={conf.tagline}>Tagline / Slogan</FieldLabel>
            <input value={data.tagline} onChange={(e) => upd({ tagline: e.target.value })} style={GLASS_INPUT} placeholder="Your brand tagline" />
          </div>
        </div>

        <div>
          <FieldLabel confidence={conf.about} required>About Your Brand</FieldLabel>
          <textarea
            value={data.about}
            onChange={(e) => upd({ about: e.target.value })}
            rows={3}
            placeholder="What your brand does and who it serves…"
            style={GLASS_TEXTAREA}
          />
        </div>

        <div>
          <FieldLabel confidence={conf.brandStory}>Brand Story</FieldLabel>
          <textarea
            value={data.brandStory}
            onChange={(e) => upd({ brandStory: e.target.value })}
            rows={4}
            placeholder="The story behind your brand…"
            style={GLASS_TEXTAREA}
          />
        </div>

        <NavButtons
          onBack={() => setStep(1)}
          onNext={() => {
            if (!data.brandName.trim()) return;
            setStep(3);
          }}
          nextDisabled={!data.brandName.trim()}
        />
      </StepWrapper>
    );
  }

  // ── Step 3 — Catalog Discovery (Phase 3) ──────────────────────────────────
  if (step === 3) {
    const discoveryOfferings = data.scrapeData?.offerings ?? [];
    const discoveryCategories = data.scrapeData?.categories ?? [];

    // No offerings + no category hints = nothing to curate. This happens
    // on the manual brand path (no scrape) and on the rare scrape that
    // returned zero items. The auto-skip useEffect handles the common
    // case by jumping forward to step 4; this branch covers the brief
    // render-flash before the effect dispatches AND the back-nav case
    // (user clicks Back from Visual Identity into Step 3 when there's
    // still nothing to curate).
    if (discoveryOfferings.length === 0 && discoveryCategories.length === 0) {
      return (
        <StepWrapper step={step} title="Pick what to market">
          <div
            style={{
              padding: "32px 24px",
              textAlign: "center",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(33,33,33,0.14)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                margin: "0 auto 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={20} style={{ color: "rgba(255,255,255,0.40)" }} />
            </div>
            <div
              style={{ fontSize: 15, fontWeight: 600, color: "#FFFFFF", marginBottom: 6 }}
            >
              {isEdit
                ? "No catalog items on this brand yet"
                : "No catalog items detected yet"}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.65)",
                margin: "0 0 14px",
                maxWidth: 380,
                marginInline: "auto",
                lineHeight: 1.5,
              }}
            >
              {isEdit
                ? "Scan your website to discover products and services, or add them manually from the catalog page."
                : "That's fine — you can add products, services, or any other offerings from the catalog page after creating the brand."}
            </p>
            {/* Bug 3 — in edit mode, surface a "Scan website" CTA that
                drops the user back to Step 1 with their existing
                websiteUrl prefilled. They can re-scrape to repopulate
                the catalog from the live site. */}
            {isEdit && (
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "#FFFFFF",
                  color: "#0A0A0A",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Scan website
              </button>
            )}
          </div>
          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </StepWrapper>
      );
    }

    // Derive host display for the sub-header.
    let brandHost = "";
    try {
      brandHost = data.websiteUrl ? new URL(data.websiteUrl).host : "";
    } catch {
      brandHost = data.websiteUrl ?? "";
    }
    const baseUrl = data.websiteUrl
      ? data.websiteUrl.replace(/\/+$/, "")
      : "";

    const selectedSet = new Set(data.selectedOfferingIds);

    return (
      <StepWrapper step={step} title="Pick what to market">
        <CatalogDiscoveryStep
          brandName={data.brandName}
          brandHost={brandHost}
          baseUrl={baseUrl}
          brandId={editBrandId ?? "pending"}
          offerings={discoveryOfferings as CatalogOffering[]}
          categories={discoveryCategories}
          selectedIds={selectedSet}
          onSelectionChange={(next) => upd({ selectedOfferingIds: Array.from(next) })}
          onOfferingsAdded={(added) => {
            // Merge into scrapeData.offerings so the discovery list grows.
            // The component flags new items via its own internal newItemIds
            // Set — we just supply the data.
            const current = data.scrapeData?.offerings ?? [];
            upd({
              scrapeData: {
                ...data.scrapeData,
                offerings: [...current, ...(added as ScrapedOffering[])],
              },
            });
          }}
        />
        <NavButtons
          onBack={() => setStep(2)}
          onNext={() => {
            // Filter discovered offerings down to the user's picks. Only
            // these survive into the brand POST. The unselected ones are
            // dropped — they live in scrapeData but never make it to the
            // Offering table.
            const sel = new Set(data.selectedOfferingIds);
            const picked = discoveryOfferings.filter((o) =>
              sel.has(offeringId(o)),
            );
            upd({ offerings: picked });
            setStep(4);
          }}
          nextLabel={
            data.selectedOfferingIds.length > 0
              ? `Add ${data.selectedOfferingIds.length} ${
                  data.selectedOfferingIds.length === 1 ? "item" : "items"
                } to catalog →`
              : "Skip — no items selected →"
          }
        />
      </StepWrapper>
    );
  }

  // ── Step 4 — Visual Identity ──────────────────────────────────────────────
  if (step === 4) {
    return (
      <StepWrapper step={step} title="Visual Identity">
        {/* Logo */}
        <div>
          <FieldLabel>Brand Logo</FieldLabel>
          <div style={{ display: "flex", gap: 12 }}>
            {/* Current logo */}
            <div style={{
              width: 110, height: 80,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {data.logoUrl ? (
                <img src={data.logoUrl} alt="Brand logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>No logo</span>
              )}
            </div>

            {/* Upload new logo */}
            <label style={{
              width: 110, height: 80,
              border: "1.5px dashed rgba(255,255,255,0.22)",
              borderRadius: 12,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 6,
              cursor: "pointer",
              color: "rgba(255,255,255,0.45)", fontSize: 11,
            }}>
              <Upload size={16} />
              Add New Logo
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  upd({ logoFile: file, logoUrl: URL.createObjectURL(file) });
                }}
              />
            </label>
          </div>
        </div>

        {/* Colors */}
        <div>
          <FieldLabel>Brand Colors</FieldLabel>
          {/* Scrape-status hint: tells the user whether the colours shown
              were extracted from their site or are just placeholder
              defaults. Pre-fix, the wizard silently filled the three
              defaults and there was no way for the user to know that
              extraction had returned nulls. */}
          {data.confidence?.colors === "low" && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.65)",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.30)",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 10,
              }}
            >
              Colours not detected from your website — please set them manually
              below. (Defaults shown are neutral placeholders.)
            </div>
          )}
          {data.confidence?.colors === "high" && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.65)",
                marginBottom: 10,
              }}
            >
              ✓ Detected from your website — edit any swatch to override.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <ColorPicker label="PRIMARY"   value={data.primaryColor}   onChange={(v) => upd({ primaryColor: v })} />
            <ColorPicker label="SECONDARY" value={data.secondaryColor} onChange={(v) => upd({ secondaryColor: v })} />
            <ColorPicker label="ACCENT"    value={data.accentColor}    onChange={(v) => upd({ accentColor: v })} />
          </div>
        </div>

        {/* Typography */}
        <div>
          <FieldLabel>Brand Typography</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {(
              [
                { label: "Primary Font",   key: "typographyPrimary"   as const },
                { label: "Secondary Font", key: "typographySecondary" as const },
                { label: "Accent Font",    key: "typographyAccent"    as const },
              ] as const
            ).map(({ label, key }) => (
              <div key={key}
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                <FontPicker
                  label={label}
                  value={data[key]}
                  onChange={(v) => upd({ [key]: v })}
                  options={FONT_OPTIONS}
                />
                {/* AaBbCc preview */}
                <div style={{
                  fontSize: 18, fontWeight: 400, color: "rgba(255,255,255,0.60)",
                  fontFamily: data[key] ? `'${data[key]}', sans-serif` : "inherit",
                }}>
                  AaBbCc
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                  {data[key] || label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} />
      </StepWrapper>
    );
  }

  // ── Step 5 — Tone Attributes ──────────────────────────────────────────────
  if (step === 5) {
    return (
      <StepWrapper step={step} title="Tone Attributes">
        <div>
          <FieldLabel>Brand Voice</FieldLabel>
          <input
            value={data.brandVoice}
            onChange={(e) => upd({ brandVoice: e.target.value })}
            placeholder="e.g. Confident, bold and empowering"
            style={GLASS_INPUT}
          />
        </div>

        <div>
          <FieldLabel required>Tone Attributes</FieldLabel>
          <TagInput
            tags={data.toneAttributes}
            onChange={(t) => upd({ toneAttributes: t })}
            placeholder="e.g. Professional, Friendly, Fun…  press Enter"
          />
        </div>

        <div>
          <FieldLabel>Hashtags</FieldLabel>
          <TagInput
            tags={data.hashtags}
            onChange={(t) => upd({ hashtags: t })}
            placeholder="Enter hashtag and press Enter"
          />
        </div>

        <NavButtons onBack={() => setStep(4)} onNext={() => setStep(6)} />
      </StepWrapper>
    );
  }

  // ── Step 6 — Review & Create ──────────────────────────────────────────────
  return (
    <StepWrapper step={step} title="Review & Create">
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginTop: -12 }}>
        Add extra context to improve the quality of your AI-generated content.
      </div>

      <div>
        <FieldLabel>Things to Avoid</FieldLabel>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
          Words, phrases, or topics to never use in posts for this brand
        </div>
        <TagInput
          tags={data.thingsToAvoid}
          onChange={(t) => upd({ thingsToAvoid: t })}
          placeholder="e.g. Discount, Cheap, Competitors…"
        />
      </div>

      <div>
        <FieldLabel>Unique Selling Points (USPs)</FieldLabel>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
          Key differentiators and strengths of your brand
        </div>
        <TagInput
          tags={data.usps}
          onChange={(t) => upd({ usps: t })}
          placeholder="e.g. Award-winning design, 24/7 support…"
        />
      </div>

      <div>
        <FieldLabel>Writing Style</FieldLabel>
        <input
          value={data.writingStyle}
          onChange={(e) => upd({ writingStyle: e.target.value })}
          placeholder="e.g. Short punchy sentences, no jargon"
          style={GLASS_INPUT}
        />
      </div>

      {saveErr && (
        <div style={{
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#EF4444",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertCircle size={13} />
          {saveErr}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <button
          type="button"
          onClick={() => setStep(5)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10, padding: "9px 16px", color: "rgba(255,255,255,0.65)",
            fontSize: 13, cursor: "pointer",
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !data.brandName.trim()}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: saving || !data.brandName.trim() ? "rgba(255,255,255,0.45)" : "#fff",
            border: "none", borderRadius: 10, padding: "11px 24px",
            fontSize: 13, fontWeight: 600, color: "#0A0A0A",
            cursor: saving || !data.brandName.trim() ? "not-allowed" : "pointer",
          }}
        >
          {saving ? (
            <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
          ) : (
            <>Create Brand ⊙</>
          )}
        </button>
      </div>
    </StepWrapper>
  );
}

// ─── Shared Back/Next buttons ─────────────────────────────────────────────────

function NavButtons({
  onBack,
  onNext,
  nextDisabled = false,
  nextLabel = "Next →",
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 10, padding: "9px 16px", color: "rgba(255,255,255,0.65)",
          fontSize: 13, cursor: "pointer",
        }}
      >
        <ArrowLeft size={14} /> Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: nextDisabled ? "rgba(255,255,255,0.40)" : "#fff",
          border: "none", borderRadius: 10, padding: "11px 20px",
          fontSize: 13, fontWeight: 600, color: "#0A0A0A",
          cursor: nextDisabled ? "not-allowed" : "pointer",
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
