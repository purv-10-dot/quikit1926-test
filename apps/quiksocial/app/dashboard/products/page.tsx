"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Pagination } from "@/components/ui/Pagination";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Package,
  Loader2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Tag,
  Layers,
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

interface Product {
  _id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  currency?: string | null;
  category?: string | null;
  tags: string[];
  imageUrls: string[];
  sku?: string | null;
  createdAt: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  tags: string[];
  imageUrls: string[];
  sku: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  currency: "",
  category: "",
  tags: [],
  imageUrls: [],
  sku: "",
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

// ─── Product Modal ────────────────────────────────────────────────────────────

function ProductModal({
  brandId,
  brandCountry,
  initial,
  onClose,
  onSaved,
}: {
  brandId: string;
  brandCountry: string | null;
  initial: Product | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? "",
          price: initial.price ?? "",
          // Seed currency: prefer the row's saved value; otherwise sniff
          // an existing symbol from the price string; otherwise use the
          // brand-country default. Editing a row never silently rewrites
          // its currency without the user touching the selector.
          currency:
            (initial.currency ?? "").trim() ||
            resolveCurrencySymbol({
              currency: initial.currency,
              priceText: initial.price,
              brandCountry,
            }),
          category: initial.category ?? "",
          tags: initial.tags ?? [],
          imageUrls: initial.imageUrls ?? [],
          sku: initial.sku ?? "",
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
      setError("Product name is required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const url = initial ? `/api/products/${initial._id}` : "/api/products";
      const method = initial ? "PUT" : "POST";
      const body = { ...form, brandId };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = unwrap(await res.json());
      if (!res.ok) {
        setError(data.error ?? "Failed to save product");
        return;
      }
      onSaved(data.product);
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
            {initial ? "Edit Product" : "Add Product"}
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
          {/* Name */}
          <Field label="Product Name *">
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Wireless Headphones Pro"
              style={inputStyle}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this product? Who is it for?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          {/* Price + SKU */}
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

          {/* Category */}
          <Field label="Category">
            <input
              type="text"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. Electronics, Apparel…"
              style={inputStyle}
            />
          </Field>

          {/* Tags */}
          <Field label="Tags">
            <TagInput
              tags={form.tags}
              onChange={(t) => set("tags", t)}
              placeholder="Add tag and press Enter…"
            />
          </Field>

          {/* Images */}
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
              "Add Product"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
// Renders an <img loading="lazy">, swaps in over a subtle pulse background
// on load, and falls back to the placeholder icon if the image fails to
// decode. Used by both ProductCard and ServiceCard (services file imports
// nothing from this — it has its own copy at module scope, kept separate
// so the two pages remain self-contained).

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

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  brandLogoUrl,
  brandCountry,
  onEdit,
  onDelete,
}: {
  product: Product;
  brandLogoUrl: string | null;
  brandCountry: string | null;
  onEdit: (p: Product) => void;
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
    const res = await fetch(`/api/products/${product._id}`, { method: "DELETE" });
    if (res.ok) onDelete(product._id);
    setDeleting(false);
    setConfirmDelete(false);
  }

  // Pick the first product image that is NOT the brand logo. The scraper
  // sometimes assigns the brand's site-wide logo as a product's image_url
  // (when a real product photo can't be found) — rendering that here makes
  // every product card look identical, which is worse than a placeholder.
  const thumb = (() => {
    const urls = product.imageUrls ?? [];
    const logoNorm = (brandLogoUrl ?? "").trim().toLowerCase();
    for (const u of urls) {
      if (!u) continue;
      if (logoNorm && u.trim().toLowerCase() === logoNorm) continue;
      return u;
    }
    return null;
  })();

  // Smart price rendering — see lib/utils/currency.ts. Replaces the old
  // hardcoded $ icon which produced "$₹999" double-symbol output for
  // any non-US brand.
  const priceSymbol = resolveCurrencySymbol({
    currency: product.currency,
    priceText: product.price,
    brandCountry,
  });
  const priceAmount = stripCurrencyFromPrice(product.price);

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
          alt={product.name}
          fallback={<Package size={28} style={{ color: "rgba(255,255,255,0.2)" }} />}
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
              {product.name}
            </p>
            {product.category && (
              <p
                style={{
                  color: "rgba(255,255,255,0.40)",
                  fontSize: 12,
                  marginTop: 1,
                }}
              >
                {product.category}
              </p>
            )}
          </div>

          {/* Action buttons */}
          {hovered && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onEdit(product)}
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

        {/* Description */}
        {product.description && (
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
            {product.description}
          </p>
        )}

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {product.price && (
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
              {priceAmount || product.price}
            </span>
          )}
          {product.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {product.tags.slice(0, 4).map((tag, i) => (
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
              {product.tags.length > 4 && (
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                  +{product.tags.length - 4}
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

export default function ProductsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Product | null }>({
    open: false,
    editing: null,
  });
  // Brand metadata used for currency defaults and logo-as-thumb filtering.
  // Fetched once on mount alongside the products list.
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandCountry, setBrandCountry] = useState<string | null>(null);

  // Pagination — page number is URL-persistent. Refresh keeps you on
  // the same page; back/forward navigates between pages.
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

  const brandId =
    (session?.user as { activeBrandId?: string })?.activeBrandId ?? "";

  const fetchProducts = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/products?brandId=${brandId}&page=${page}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) return;
      const data = unwrap(await res.json());
      setProducts(data.products ?? []);
      const total = data.pagination?.total ?? data.products?.length ?? 0;
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
    } finally {
      setLoading(false);
    }
  }, [brandId, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // If a delete leaves the current page empty (and we're past page 1),
  // step one page back so the user isn't stranded on a blank screen.
  useEffect(() => {
    if (!loading && products.length === 0 && page > 1) {
      setPage(page - 1);
    }
  }, [loading, products.length, page, setPage]);

  // Resolve the brand's logoUrl and country once, used by the cards and
  // the modal. Failures are silent — both are nice-to-have hints, not
  // hard requirements (the cards fall back gracefully to "$" + showing
  // any image including the logo if this fetch fails).
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

  function handleSaved(product: Product) {
    setProducts((prev) => {
      const exists = prev.findIndex((p) => p._id === product._id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = product;
        return next;
      }
      return [product, ...prev];
    });
    setModal({ open: false, editing: null });
    // Refetch so the total/pagination reflects the new row. Local
    // state update above keeps the UI snappy in the meantime.
    fetchProducts();
  }

  function handleDeleted(id: string) {
    setProducts((prev) => prev.filter((p) => p._id !== id));
    // Refetch for the same reason — total + page boundary changes.
    fetchProducts();
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
            Products
          </h1>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 14 }}>
            {loading ? "Loading…" : `${totalItems} product${totalItems !== 1 ? "s" : ""} in your catalog`}
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
          Add Product
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              // Match the real ProductRow's primary-glass tint so the
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
      ) : products.length === 0 ? (
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
              No products yet
            </p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginTop: 4 }}>
              Add products to use them in AI-generated posts and campaigns.
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
            Add your first product
          </button>
        </div>
      ) : (
        <>
          {/* Strict 3-column grid, 24px gap. Cards stretch to fill
              cells. See design-tokens.md (Primary glass card). */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
            }}
          >
            {products.map((p) => (
              <ProductCard
                key={p._id}
                product={p}
                brandLogoUrl={brandLogoUrl}
                brandCountry={brandCountry}
                onEdit={(prod) => setModal({ open: true, editing: prod })}
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
        <ProductModal
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
