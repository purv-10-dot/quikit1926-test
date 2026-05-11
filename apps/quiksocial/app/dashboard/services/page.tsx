"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveBrandId } from "@/hooks/useActiveBrandId";
import { Pagination } from "@/components/ui/Pagination";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Briefcase,
  Loader2,
  AlertCircle,
  Upload,
  Clock,
} from "lucide-react";
import TagInput from "@/components/ui/TagInput";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  CURRENCY_OPTIONS,
  defaultCurrencyForCountry,
  resolveCurrencySymbol,
  stripCurrencyFromPrice,
} from "@/lib/utils/currency";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Service {
  _id: string;
  name: string;
  description?: string | null;
  pricing?: string | null;
  currency?: string | null;
  category?: string | null;
  tags: string[];
  imageUrls: string[];
  duration?: string | null;
  createdAt: string;
}

interface FormState {
  name: string;
  description: string;
  pricing: string;
  currency: string;
  category: string;
  tags: string[];
  imageUrls: string[];
  duration: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  pricing: "",
  currency: "",
  category: "",
  tags: [],
  imageUrls: [],
  duration: "",
};

// ─── Image uploader (reuses /api/assets) ─────────────────────────────────────

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
      const data = unwrap(await res.json());
      return data.asset?.url ?? null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading };
}

// ─── Service Modal ────────────────────────────────────────────────────────────

function ServiceModal({
  brandId,
  brandCountry,
  initial,
  onClose,
  onSaved,
}: {
  brandId: string;
  brandCountry: string | null;
  initial: Service | null;
  onClose: () => void;
  onSaved: (s: Service) => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? "",
          pricing: initial.pricing ?? "",
          // Same hydration rules as Product modal — see that file's
          // matching block for the rationale.
          currency:
            (initial.currency ?? "").trim() ||
            resolveCurrencySymbol({
              currency: initial.currency,
              priceText: initial.pricing,
              brandCountry,
            }),
          category: initial.category ?? "",
          tags: initial.tags ?? [],
          imageUrls: initial.imageUrls ?? [],
          duration: initial.duration ?? "",
        }
      : { ...EMPTY_FORM, currency: defaultCurrencyForCountry(brandCountry) }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { upload, uploading } = useImageUpload(brandId);
  const imgInputRef = useRef<HTMLInputElement>(null);

  function set(key: keyof FormState, val: string | string[]) {
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
      setError("Service name is required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const url = initial ? `/api/services/${initial._id}` : "/api/services";
      const method = initial ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, brandId }),
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to save service");
        return;
      }
      onSaved(data.service);
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
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>
            {initial ? "Edit Service" : "Add Service"}
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

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Service Name *">
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Brand Strategy Consultation"
              style={inputStyle}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What does this service include? Who benefits?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Pricing">
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
                  value={form.pricing}
                  onChange={(e) => set("pricing", e.target.value)}
                  placeholder="500/month"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </Field>
            <Field label="Duration">
              <input
                type="text"
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
                placeholder="e.g. 1 hour, ongoing"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Category">
            <input
              type="text"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. Consulting, Design, Development…"
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

        {/* Error */}
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

        {/* Actions */}
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
              "Add Service"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

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

// ─── Lazy thumbnail with skeleton ─────────────────────────────────────────────
// Mirrors the helper in products/page.tsx — kept locally so each page is
// self-contained and deletable as a unit.

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

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  brandLogoUrl,
  brandCountry,
  onEdit,
  onDelete,
}: {
  service: Service;
  brandLogoUrl: string | null;
  brandCountry: string | null;
  onEdit: (s: Service) => void;
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
    const res = await fetch(`/api/services/${service._id}`, { method: "DELETE" });
    if (res.ok) onDelete(service._id);
    setDeleting(false);
    setConfirmDelete(false);
  }

  // Pick the first service image that is NOT the brand logo. Same
  // rationale as the matching block in products/page.tsx.
  const thumb = (() => {
    const urls = service.imageUrls ?? [];
    const logoNorm = (brandLogoUrl ?? "").trim().toLowerCase();
    for (const u of urls) {
      if (!u) continue;
      if (logoNorm && u.trim().toLowerCase() === logoNorm) continue;
      return u;
    }
    return null;
  })();

  // Smart pricing render — see lib/utils/currency.ts. Same fix as the
  // products page; previously this card hardcoded $ → "$₹500/month".
  const priceSymbol = resolveCurrencySymbol({
    currency: service.currency,
    priceText: service.pricing,
    brandCountry,
  });
  const priceAmount = stripCurrencyFromPrice(service.pricing);

  return (
    <div
      // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
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
      {/* Thumbnail */}
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
          alt={service.name}
          fallback={<Briefcase size={28} style={{ color: "rgba(255,255,255,0.2)" }} />}
        />
      </div>

      {/* Content */}
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
              {service.name}
            </p>
            {service.category && (
              <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 12, marginTop: 1 }}>
                {service.category}
              </p>
            )}
          </div>

          {hovered && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onEdit(service)}
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
                  background: confirmDelete ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.08)",
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

        {service.description && (
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
            {service.description}
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
          {service.pricing && (
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
              {priceAmount || service.pricing}
            </span>
          )}
          {service.duration && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "rgba(255,255,255,0.45)",
                fontSize: 12,
              }}
            >
              <Clock size={12} />
              {service.duration}
            </span>
          )}
          {service.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {service.tags.slice(0, 4).map((tag, i) => (
                <span
                  key={i}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: "linear-gradient(135deg,rgba(244,114,182,0.25),rgba(251,146,60,0.25))",
                    border: "1px solid rgba(244,114,182,0.2)",
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 11,
                  }}
                >
                  {tag}
                </span>
              ))}
              {service.tags.length > 4 && (
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                  +{service.tags.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

export default function ServicesPage() {
  const activeBrandId = useActiveBrandId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Service | null }>({
    open: false,
    editing: null,
  });
  // Brand metadata used for currency defaults and logo-as-thumb filtering.
  // See products/page.tsx for matching block + rationale.
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandCountry, setBrandCountry] = useState<string | null>(null);

  // Pagination — same URL-persistent contract as products page.
  const page = Math.max(1, parseInt(searchParams?.get("page") ?? "1", 10) || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const setPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next <= 1) params.delete("page");
      else params.set("page", String(next));
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const brandId = activeBrandId ?? "";

  const fetchServices = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/services?brandId=${brandId}&page=${page}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) return;
      const data = unwrap(await res.json());
      setServices(data.services ?? []);
      const total = data.pagination?.total ?? data.services?.length ?? 0;
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
    } finally {
      setLoading(false);
    }
  }, [brandId, page]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    if (!loading && services.length === 0 && page > 1) {
      setPage(page - 1);
    }
  }, [loading, services.length, page, setPage]);

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
        const { brand } = unwrap(await res.json());
        if (cancelled || !brand) return;
        setBrandLogoUrl(brand.logoUrl ?? null);
        setBrandCountry(brand.country ?? null);
      } catch {
        // ignore — defaults already in place
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  function handleSaved(service: Service) {
    setServices((prev) => {
      const exists = prev.findIndex((s) => s._id === service._id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = service;
        return next;
      }
      return [service, ...prev];
    });
    setModal({ open: false, editing: null });
    fetchServices();
  }

  function handleDeleted(id: string) {
    setServices((prev) => prev.filter((s) => s._id !== id));
    fetchServices();
  }

  return (
    /* Outer page wrapper — no padding/margin/max-width. The
       dashboard layout shell owns all outer spacing. */
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
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 500, marginBottom: 4 }}>
            Services
          </h1>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 14 }}>
            {loading
              ? "Loading…"
              : `${totalItems} service${totalItems !== 1 ? "s" : ""} in your catalog`}
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, editing: null })}
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
            cursor: "pointer",
          }}
        >
          <Plus size={16} />
          Add Service
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              // Match the real ServiceRow's primary-glass tint so the
              // wallpaper shows through. qs-pulse keyframe is in globals.css.
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
      ) : services.length === 0 ? (
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
            <Briefcase size={32} style={{ color: "rgba(255,255,255,0.3)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>
              No services yet
            </p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginTop: 4 }}>
              Add services to use them in AI-generated posts and campaigns.
            </p>
          </div>
          <button
            onClick={() => setModal({ open: true, editing: null })}
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
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            <Plus size={16} />
            Add your first service
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
            }}
          >
            {services.map((s) => (
              <ServiceCard
                key={s._id}
                service={s}
                brandLogoUrl={brandLogoUrl}
                brandCountry={brandCountry}
                onEdit={(svc) => setModal({ open: true, editing: svc })}
                onDelete={handleDeleted}
              />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Modal */}
      {modal.open && brandId && (
        <ServiceModal
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
