"use client";

export const dynamic = "force-dynamic";

/**
 * Unified Catalog page (Phase 2 follow-up).
 *
 * Replaces the v1 /dashboard/products and /dashboard/services split
 * pages with a single grouped view of every Offering on the active
 * brand. Groups are keyed by `Offering.type` (the free-string column);
 * each group's header label is rendered via offeringLabel() so unknown
 * types (e.g. "amenity_kit" → "Amenity Kits") still get a presentable
 * heading. Expand/collapse interaction matches the brand-wizard's
 * Catalog Discovery step for consistency.
 *
 * QuiKit handoff:
 *   - Active brand id comes from useActiveBrandId() (not session.user).
 *   - API responses are unwrapped from the { success, data } envelope.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import TagInput from "@/components/ui/TagInput";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { useActiveBrandId } from "@/hooks/useActiveBrandId";
import { unwrap } from "@/lib/utils/api-fetch";
import {
  KNOWN_OFFERING_TYPES,
  offeringLabel,
} from "@/lib/offerings/labels";
import {
  CURRENCY_OPTIONS,
  defaultCurrencyForCountry,
  resolveCurrencySymbol,
  stripCurrencyFromPrice,
} from "@/lib/utils/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offering {
  _id: string;
  type: string;
  name: string;
  description?: string | null;
  price?: string | null;
  currency?: string | null;
  category?: string | null;
  duration?: string | null;
  tags: string[];
  imageUrls: string[];
  sku?: string | null;
  createdAt: string;
}

interface FormState {
  type: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  duration: string;
  tags: string[];
  imageUrls: string[];
  sku: string;
}

function emptyForm(defaults: Partial<FormState> = {}): FormState {
  return {
    type: "product",
    name: "",
    description: "",
    price: "",
    currency: "",
    category: "",
    duration: "",
    tags: [],
    imageUrls: [],
    sku: "",
    ...defaults,
  };
}

const FETCH_LIMIT = 100;

// ─── Image upload helper ──────────────────────────────────────────────────────

function useImageUpload(brandId: string) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("brandId", brandId);
      fd.append("type", "image");
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      if (!res.ok) return null;
      const data = unwrap<{ asset?: { url?: string } }>(await res.json());
      return data?.asset?.url ?? null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading };
}

// ─── Offering Modal (add/edit) ────────────────────────────────────────────────

function OfferingModal({
  brandId,
  brandCountry,
  initial,
  onClose,
  onSaved,
}: {
  brandId: string;
  brandCountry: string | null;
  initial: Offering | null;
  onClose: () => void;
  onSaved: (o: Offering) => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          type: initial.type || "product",
          name: initial.name,
          description: initial.description ?? "",
          price: initial.price ?? "",
          currency:
            (initial.currency ?? "").trim() ||
            resolveCurrencySymbol({
              currency: initial.currency,
              priceText: initial.price,
              brandCountry,
            }),
          category: initial.category ?? "",
          duration: initial.duration ?? "",
          tags: initial.tags ?? [],
          imageUrls: initial.imageUrls ?? [],
          sku: initial.sku ?? "",
        }
      : emptyForm({ currency: defaultCurrencyForCountry(brandCountry) })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { upload, uploading } = useImageUpload(brandId);
  const imgInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) set("imageUrls", [...form.imageUrls, url]);
  }

  function removeImage(idx: number) {
    set("imageUrls", form.imageUrls.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = initial ? `/api/offerings/${initial._id}` : "/api/offerings";
      const method = initial ? "PUT" : "POST";
      const body = { ...form, brandId };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save offering");
        return;
      }
      const data = unwrap<{ offering: Offering }>(json);
      onSaved(data.offering);
    } finally {
      setSaving(false);
    }
  }

  return (
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
        zIndex: 9999,
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: 32,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>
            {initial
              ? `Edit ${offeringLabel(form.type, "singular")}`
              : `Add ${offeringLabel(form.type, "singular")}`}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: 8,
              padding: 6,
              cursor: "pointer",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }}
              aria-label="Offering type"
            >
              {KNOWN_OFFERING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {offeringLabel(t, "singular")}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`${offeringLabel(form.type, "singular")} Name *`}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Wireless Headphones Pro"
              style={inputStyle}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this? Who is it for?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Price">
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={form.currency || defaultCurrencyForCountry(brandCountry)}
                  onChange={(e) => set("currency", e.target.value)}
                  aria-label="Currency"
                  style={{
                    ...inputStyle,
                    width: 96,
                    flexShrink: 0,
                    cursor: "pointer",
                    colorScheme: "dark",
                  }}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  placeholder="49.99 / month"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </Field>
            <Field label="SKU / Code">
              <input
                type="text"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="e.g. HP-PRO-001"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Category">
            <input
              type="text"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. Electronics, Apparel…"
              style={inputStyle}
            />
          </Field>

          <Field label="Tags">
            <TagInput
              tags={form.tags}
              onChange={(t) => set("tags", t)}
              placeholder="Add tag and press Enter…"
            />
          </Field>

          <Field label="Images">
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImagePick}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {form.imageUrls.map((url, i) => (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  <ImageWithFallback
                    src={url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.7)",
                      border: "none",
                      cursor: "pointer",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => imgInputRef.current?.click()}
                disabled={uploading}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  border: "2px dashed rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.04)",
                  cursor: uploading ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                {uploading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Upload size={16} />
                    <span style={{ fontSize: 10 }}>Add</span>
                  </>
                )}
              </button>
            </div>
          </Field>
        </div>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              padding: "10px 12px",
              marginTop: 16,
              color: "#fca5a5",
              fontSize: 13,
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.7)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2,
              padding: "12px 0",
              borderRadius: 10,
              border: "none",
              background: saving ? "rgba(255,255,255,0.3)" : "#fff",
              color: saving ? "rgba(0,0,0,0.4)" : "#0A0A0A",
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Saving…
              </>
            ) : initial ? (
              "Save Changes"
            ) : (
              `Add ${offeringLabel(form.type, "singular")}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          color: "rgba(255,255,255,0.65)",
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

// ─── LazyThumb ────────────────────────────────────────────────────────────────

function LazyThumb({
  src,
  alt,
  fallback,
}: {
  src: string | null;
  alt: string;
  fallback: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  if (!src || errored) return <>{fallback}</>;
  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
            backgroundSize: "200% 100%",
            animation: "qs-skeleton 1.4s ease-in-out infinite",
          }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.2s ease-in",
        }}
      />
    </>
  );
}

// ─── Offering Card ────────────────────────────────────────────────────────────

function OfferingCard({
  offering,
  brandLogoUrl,
  brandCountry,
  onEdit,
  onDelete,
}: {
  offering: Offering;
  brandLogoUrl: string | null;
  brandCountry: string | null;
  onEdit: (o: Offering) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/offerings/${offering._id}`, { method: "DELETE" });
    if (res.ok) onDelete(offering._id);
    setDeleting(false);
    setConfirmDelete(false);
  }

  const thumb = (() => {
    const urls = offering.imageUrls ?? [];
    const logoNorm = (brandLogoUrl ?? "").trim().toLowerCase();
    for (const u of urls) {
      if (!u) continue;
      if (logoNorm && u.trim().toLowerCase() === logoNorm) continue;
      return u;
    }
    return null;
  })();

  const priceSymbol = resolveCurrencySymbol({
    currency: offering.currency,
    priceText: offering.price,
    brandCountry,
  });
  const priceAmount = stripCurrencyFromPrice(offering.price);

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        background: "rgba(33, 33, 33, 0.14)",
        border: `1px solid ${hovered ? "rgba(255, 255, 255, 0.20)" : "rgba(255, 255, 255, 0.10)"}`,
        borderRadius: 16,
        padding: 16,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        transition: "border-color 0.2s",
        alignItems: "flex-start",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setConfirmDelete(false);
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 10,
          overflow: "hidden",
          flexShrink: 0,
          position: "relative",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LazyThumb
          src={thumb}
          alt={offering.name}
          fallback={
            offering.type === "service" || offering.type === "treatment" ? (
              <Briefcase size={28} style={{ color: "rgba(255,255,255,0.2)" }} />
            ) : (
              <Package size={28} style={{ color: "rgba(255,255,255,0.2)" }} />
            )
          }
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                color: "#fff",
                fontSize: 15,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {offering.name}
            </p>
            {offering.category && (
              <p
                style={{
                  color: "rgba(255,255,255,0.40)",
                  fontSize: 12,
                  marginTop: 1,
                }}
              >
                {offering.category}
              </p>
            )}
          </div>

          {hovered && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onEdit(offering)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Pencil size={12} />
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.6)" : "rgba(239,68,68,0.3)"}`,
                  background: confirmDelete
                    ? "rgba(239,68,68,0.25)"
                    : "rgba(239,68,68,0.08)",
                  color: "#fca5a5",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {deleting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                {confirmDelete ? "Confirm" : "Delete"}
              </button>
            </div>
          )}
        </div>

        {offering.description && (
          <p
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 13,
              marginTop: 6,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {offering.description}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {offering.price && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "#22C55E",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <span style={{ fontWeight: 600 }}>{priceSymbol}</span>
              {priceAmount || offering.price}
            </span>
          )}
          {offering.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {offering.tags.slice(0, 4).map((tag, i) => (
                <span
                  key={i}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 20,
                    background:
                      "linear-gradient(135deg,rgba(244,114,182,0.25),rgba(251,146,60,0.25))",
                    border: "1px solid rgba(244,114,182,0.2)",
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 11,
                  }}
                >
                  {tag}
                </span>
              ))}
              {offering.tags.length > 4 && (
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                  +{offering.tags.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface TypeGroup {
  type: string;
  items: Offering[];
}

function groupByType(offerings: Offering[]): TypeGroup[] {
  const byType = new Map<string, Offering[]>();
  for (const o of offerings) {
    const t = (o.type || "product").trim() || "product";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(o);
  }
  return Array.from(byType.entries()).map(([type, items]) => ({ type, items }));
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const brandId = useActiveBrandId() ?? "";
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Offering | null }>({
    open: false,
    editing: null,
  });
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandCountry, setBrandCountry] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const fetchOfferings = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/offerings?brandId=${brandId}&limit=${FETCH_LIMIT}`,
      );
      if (!res.ok) return;
      const data = unwrap<{ offerings?: Offering[] }>(await res.json());
      setOfferings(data?.offerings ?? []);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchOfferings();
  }, [fetchOfferings]);

  useEffect(() => {
    if (!brandId) {
      setBrandLogoUrl(null);
      setBrandCountry(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = unwrap<{ brand?: { logoUrl?: string | null; country?: string | null } }>(
          await res.json(),
        );
        if (cancelled || !data?.brand) return;
        setBrandLogoUrl(data.brand.logoUrl ?? null);
        setBrandCountry(data.brand.country ?? null);
      } catch {
        // defaults are fine
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  function handleSaved(offering: Offering) {
    setOfferings((prev) => {
      const idx = prev.findIndex((o) => o._id === offering._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = offering;
        return next;
      }
      return [offering, ...prev];
    });
    setModal({ open: false, editing: null });
    fetchOfferings();
  }

  function handleDeleted(id: string) {
    setOfferings((prev) => prev.filter((o) => o._id !== id));
    fetchOfferings();
  }

  const groups = useMemo(() => groupByType(offerings), [offerings]);
  const totalCount = offerings.length;

  const activeType =
    activeTab && groups.some((g) => g.type === activeTab)
      ? activeTab
      : groups[0]?.type ?? null;
  const activeGroup = groups.find((g) => g.type === activeType) ?? null;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              color: "#fff",
              fontSize: 24,
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            Catalog
          </h1>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 14 }}>
            {loading
              ? "Loading…"
              : `${totalCount} ${totalCount === 1 ? "item" : "items"} across ${groups.length} ${groups.length === 1 ? "type" : "types"}`}
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, editing: null })}
          disabled={!brandId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#fff",
            color: "#0A0A0A",
            fontSize: 14,
            fontWeight: 600,
            cursor: brandId ? "pointer" : "not-allowed",
            opacity: brandId ? 1 : 0.5,
          }}
        >
          <Plus size={16} />
          Add Offering
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 104,
                borderRadius: 16,
                background: "rgba(33, 33, 33, 0.14)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                animation: "qs-pulse 1.4s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 24px",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={32} style={{ color: "rgba(255,255,255,0.3)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>
              No catalog items yet
            </p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginTop: 4 }}>
              Add products, services, or any offering to use them in AI-generated
              posts and campaigns.
            </p>
          </div>
          <button
            onClick={() => setModal({ open: true, editing: null })}
            disabled={!brandId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#fff",
              color: "#0A0A0A",
              fontSize: 14,
              fontWeight: 600,
              cursor: brandId ? "pointer" : "not-allowed",
              marginTop: 8,
              opacity: brandId ? 1 : 0.5,
            }}
          >
            <Plus size={16} />
            Add your first offering
          </button>
        </div>
      ) : (
        <div>
          <div
            role="tablist"
            aria-label="Offering types"
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 24,
              overflowX: "auto",
              paddingBottom: 4,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {groups.map((group) => {
              const isActive = group.type === activeType;
              return (
                <button
                  key={group.type}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(group.type)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: isActive
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(255,255,255,0.10)",
                    background: isActive
                      ? "rgba(255,255,255,0.16)"
                      : "rgba(255,255,255,0.04)",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "background 0.15s, color 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.08)";
                      (e.currentTarget as HTMLElement).style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.04)";
                      (e.currentTarget as HTMLElement).style.color =
                        "rgba(255,255,255,0.65)";
                    }
                  }}
                >
                  {offeringLabel(group.type, "plural")}
                  <span
                    style={{
                      color: isActive
                        ? "rgba(255,255,255,0.65)"
                        : "rgba(255,255,255,0.40)",
                      fontWeight: 400,
                    }}
                  >
                    ({group.items.length})
                  </span>
                </button>
              );
            })}
          </div>

          {activeGroup && (
            <div
              role="tabpanel"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 24,
              }}
            >
              {activeGroup.items.map((o) => (
                <OfferingCard
                  key={o._id}
                  offering={o}
                  brandLogoUrl={brandLogoUrl}
                  brandCountry={brandCountry}
                  onEdit={(off) => setModal({ open: true, editing: off })}
                  onDelete={handleDeleted}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {modal.open && brandId && (
        <OfferingModal
          brandId={brandId}
          brandCountry={brandCountry}
          initial={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
