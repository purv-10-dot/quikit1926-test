"use client";

export const dynamic = "force-dynamic";

/**
 * Brand Creation Wizard — 5-step flow.
 *
 * Step 1 — Website entry + scrape trigger
 * Step 2 — AI Analysis review (editable, confidence badges)
 * Step 3 — Visual Identity (logo, colors, typography)
 * Step 4 — Tone Attributes (voice, tone tags, hashtags)
 * Step 5 — Review & Create (avoid list, USPs, writing style)
 *
 * CRITICAL: While this page is mounted, BrandCreationContext.wizardActive=true,
 * which locks out the entire sidebar in DashboardLayout.
 */

import { unwrap } from "@/lib/utils/api-fetch";
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
} from "lucide-react";
import { useBrandCreation } from "@/components/providers/BrandCreationContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = "high" | "medium" | "low";

interface ScrapedProduct {
  name: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  tags?: string[];
  image_url?: string | null;
}

interface ScrapedService {
  name: string;
  description?: string | null;
  category?: string | null;
  pricing?: string | null;
  duration?: string | null;
  tags?: string[];
  image_url?: string | null;
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
  products?: ScrapedProduct[];
  services?: ScrapedService[];
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
  // Hidden — populated from the scrape and POSTed alongside brand creation,
  // then persisted into the Product / Service collections by the API. Not
  // rendered in the wizard; the user reviews them on the catalog pages.
  products: ScrapedProduct[];
  services: ScrapedService[];
}

// ─── Google Fonts subset ──────────────────────────────────────────────────────

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Raleway",
  "Playfair Display", "Merriweather", "Source Sans Pro", "Nunito",
  "Poppins", "Ubuntu", "Oswald", "PT Sans", "Noto Sans",
];

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

function WizardProgress({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <div
          key={s}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 4,
            background:
              s < step
                ? "rgba(255,255,255,0.90)"
                : s === step
                ? "rgba(255,255,255,0.75)"
                : "rgba(255,255,255,0.18)",
            transition: "background 0.25s",
          }}
        />
      ))}
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
    products:            Array.isArray(scrape.products) ? scrape.products : prev.products,
    services:            Array.isArray(scrape.services) ? scrape.services : prev.services,
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
  products: [], services: [],
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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(isEdit ? 2 : 1);
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
        const res = await fetch(`/api/brands/${editBrandId}`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const { brand } = unwrap(await res.json());
        if (!brand || cancelled) return;

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
        const err = unwrap(await res.json().catch(() => ({})));
        throw new Error(err.error ?? "Scraping failed");
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
    // scrapeData / scraped products / scraped services are only relevant
    // on initial creation. The brand POST handler persists products and
    // services into their own collections so they show up on the catalog
    // pages immediately after the wizard completes.
    if (!isEdit) {
      payload.scrapeData = data.scrapeData;
      payload.products = data.products;
      payload.services = data.services;
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
        throw new Error(err.error ?? (isEdit ? "Brand update failed" : "Brand creation failed"));
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
              "Products and services",
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

  // ── Step 3 — Visual Identity ──────────────────────────────────────────────
  if (step === 3) {
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
                <select
                  value={data[key]}
                  onChange={(e) => upd({ [key]: e.target.value })}
                  style={{
                    background: "transparent", border: "none", outline: "none",
                    color: "#fff", fontSize: 12, cursor: "pointer", colorScheme: "dark",
                  }}
                >
                  <option value="">{label}</option>
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
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

        <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
      </StepWrapper>
    );
  }

  // ── Step 4 — Tone Attributes ──────────────────────────────────────────────
  if (step === 4) {
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

        <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} />
      </StepWrapper>
    );
  }

  // ── Step 5 — Review & Create ──────────────────────────────────────────────
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
          onClick={() => setStep(4)}
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
