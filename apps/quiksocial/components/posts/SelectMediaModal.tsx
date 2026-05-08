"use client";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useMemo, useState } from "react";
import { X, Check, Info, ImageIcon, Package, Briefcase } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Asset {
  _id: string;
  name: string;
  type: string;
  url: string;
  thumbnailUrl?: string | null;
}

interface Product {
  _id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  currency?: string | null;
  category?: string | null;
  tags?: string[];
  imageUrls?: string[];
}

interface Service {
  _id: string;
  name: string;
  description?: string | null;
  pricing?: string | null;
  currency?: string | null;
  category?: string | null;
  duration?: string | null;
  tags?: string[];
  imageUrls?: string[];
}

export type AttachmentSelection =
  | { kind: "asset"; asset: Asset }
  | { kind: "product"; product: Product }
  | { kind: "service"; service: Service };

interface SelectMediaModalProps {
  brandId: string;
  initial?: AttachmentSelection | null;
  onClose: () => void;
  onSelect: (selection: AttachmentSelection) => void;
}

type Tab = "library" | "product" | "service";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SelectMediaModal({
  brandId,
  initial,
  onClose,
  onSelect,
}: SelectMediaModalProps) {
  const [tab, setTab] = useState<Tab>(initial?.kind === "service" ? "service" : initial?.kind === "product" ? "product" : "library");

  // Single-select across all three tabs (mutual exclusion per CLAUDE.md
  // "Asset vs Catalog" rule). Reset whenever the user picks something new.
  const [picked, setPicked] = useState<AttachmentSelection | null>(initial ?? null);

  // Per-tab data + loading state. Each tab fetches lazily on first open.
  const [assets, setAssets] = useState<Asset[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);

  const [productFilter, setProductFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");

  // ── Fetch on tab switch / mount ──────────────────────────────────────────

  useEffect(() => {
    if (!brandId) return;
    if (tab === "library" && assets.length === 0 && !loadingAssets) {
      setLoadingAssets(true);
      fetch(`/api/assets?brandId=${brandId}&types=image`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { assets: [] })).then(unwrap)
        .then((d) => setAssets(d.assets ?? []))
        .catch(() => {})
        .finally(() => setLoadingAssets(false));
    } else if (tab === "product" && products.length === 0 && !loadingProducts) {
      setLoadingProducts(true);
      fetch(`/api/products?brandId=${brandId}&page=1&limit=50`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { products: [] })).then(unwrap)
        .then((d) => setProducts(d.products ?? []))
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    } else if (tab === "service" && services.length === 0 && !loadingServices) {
      setLoadingServices(true);
      fetch(`/api/services?brandId=${brandId}&page=1&limit=50`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { services: [] })).then(unwrap)
        .then((d) => setServices(d.services ?? []))
        .catch(() => {})
        .finally(() => setLoadingServices(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, brandId]);

  // ── Filtered lists ───────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    if (!productFilter.trim()) return products;
    const q = productFilter.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productFilter]);

  const filteredServices = useMemo(() => {
    if (!serviceFilter.trim()) return services;
    const q = serviceFilter.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, serviceFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!picked) return;
    onSelect(picked);
  };

  const isPickedAsset = (a: Asset) => picked?.kind === "asset" && picked.asset._id === a._id;
  const isPickedProduct = (p: Product) => picked?.kind === "product" && picked.product._id === p._id;
  const isPickedService = (s: Service) => picked?.kind === "service" && picked.service._id === s._id;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        // Primary glass token from design-tokens.md.
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "min(720px, 92vh)",
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px 14px",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0 }}>
              Select Media
            </h3>
            {/* Pill tab switcher — Social/Email-style container per design-tokens.md §2 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: 32,
                padding: 4,
                gap: 4,
                borderRadius: 9999,
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
              }}
            >
              {(
                [
                  { key: "library", label: "Library" },
                  { key: "product", label: "Product" },
                  { key: "service", label: "Service" },
                ] as { key: Tab; label: string }[]
              ).map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    style={{
                      borderRadius: 9999,
                      padding: "3px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      border: "none",
                      background: active ? "#ffffff" : "transparent",
                      color: active ? "#111111" : "rgba(255,255,255,0.70)",
                      boxShadow: active ? "0 2px 6px rgba(0, 0, 0, 0.15)" : "none",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────
              overflow:hidden — the grid wraps naturally to multiple rows;
              we never show a scrollbar inside the modal. The modal's own
              maxHeight clips any overflow rather than producing a
              horizontal-scroll artifact (SC1 bug). */}
        <div style={{ padding: "0 22px 18px", overflow: "hidden", flex: 1 }}>
          {tab === "library" && (
            <LibraryTab
              loading={loadingAssets}
              assets={assets}
              isPicked={isPickedAsset}
              onPick={(a) => setPicked({ kind: "asset", asset: a })}
            />
          )}
          {tab === "product" && (
            <CatalogTab
              kind="product"
              loading={loadingProducts}
              items={filteredProducts}
              filter={productFilter}
              onFilterChange={setProductFilter}
              isPicked={(p) => isPickedProduct(p as Product)}
              onPick={(p) => setPicked({ kind: "product", product: p as Product })}
            />
          )}
          {tab === "service" && (
            <CatalogTab
              kind="service"
              loading={loadingServices}
              items={filteredServices}
              filter={serviceFilter}
              onFilterChange={setServiceFilter}
              isPicked={(s) => isPickedService(s as Service)}
              onPick={(s) => setPicked({ kind: "service", service: s as Service })}
            />
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "14px 22px 18px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!picked}
            style={{
              padding: "9px 22px",
              borderRadius: 9999,
              border: "none",
              background: picked ? "#ffffff" : "rgba(255,255,255,0.15)",
              color: picked ? "#0a0a0a" : "rgba(255,255,255,0.40)",
              fontSize: 13,
              fontWeight: 600,
              cursor: picked ? "pointer" : "not-allowed",
            }}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Library tab — grid of brand assets (image type)
// ─────────────────────────────────────────────────────────────────────────────

function LibraryTab({
  loading,
  assets,
  isPicked,
  onPick,
}: {
  loading: boolean;
  assets: Asset[];
  isPicked: (a: Asset) => boolean;
  onPick: (a: Asset) => void;
}) {
  return (
    <div>
      <div style={sectionLabelRow}>
        <span style={sectionLabel}>Brand Library</span>
        <Info size={13} style={{ color: "rgba(255,255,255,0.40)" }} />
      </div>
      {loading ? (
        <SkeletonGrid />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={20} />}
          title="No images in your library yet"
          hint="Upload assets from the Assets page to use them here."
        />
      ) : (
        <div style={gridStyle}>
          {assets.map((a) => {
            const picked = isPicked(a);
            return (
              <button
                key={a._id}
                type="button"
                onClick={() => onPick(a)}
                style={tileStyle(picked)}
                title={a.name}
              >
                <div style={tileImageWrap}>
                  {a.thumbnailUrl || a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbnailUrl ?? a.url}
                      alt=""
                      style={tileImage}
                    />
                  ) : (
                    <div style={tileImagePlaceholder}>
                      <ImageIcon size={20} />
                    </div>
                  )}
                  {picked && <CheckOverlay />}
                </div>
                <div style={tileLabel}>{a.name}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog tab — generic for products + services (same shape, different icon)
// ─────────────────────────────────────────────────────────────────────────────

function CatalogTab({
  kind,
  loading,
  items,
  filter,
  onFilterChange,
  isPicked,
  onPick,
}: {
  kind: "product" | "service";
  loading: boolean;
  items: { _id: string; name: string; imageUrls?: string[] }[];
  filter: string;
  onFilterChange: (v: string) => void;
  isPicked: (item: any) => boolean;
  onPick: (item: any) => void;
}) {
  const placeholderIcon = kind === "product" ? <Package size={20} /> : <Briefcase size={20} />;
  const labelText = kind === "product" ? "Select Product" : "Select Service";
  const inputPlaceholder = kind === "product" ? "Search products by name…" : "Search services by name…";

  return (
    <div>
      <div style={sectionLabelRow}>
        <span style={sectionLabel}>{labelText}</span>
        <Info size={13} style={{ color: "rgba(255,255,255,0.40)" }} />
      </div>

      {/* Search/filter input acting as the "dropdown" from v1 — typing
          narrows the grid below. */}
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={inputPlaceholder}
        style={{
          width: "100%",
          height: 38,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10,
          color: "#ffffff",
          fontSize: 13,
          padding: "0 14px",
          outline: "none",
          marginBottom: 14,
          boxSizing: "border-box",
        }}
      />

      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState
          icon={placeholderIcon}
          title={`No ${kind}s found`}
          hint={
            filter
              ? "Try a different name."
              : `Add ${kind}s from the Catalog page to use them here.`
          }
        />
      ) : (
        <div style={gridStyle}>
          {items.map((item) => {
            const picked = isPicked(item);
            const cover = item.imageUrls?.[0] ?? null;
            return (
              <button
                key={item._id}
                type="button"
                onClick={() => onPick(item)}
                style={tileStyle(picked)}
                title={item.name}
              >
                <div style={tileImageWrap}>
                  {cover ? (
                    <ImageWithFallback src={cover} alt="" style={tileImage} />
                  ) : (
                    <div style={tileImagePlaceholder}>{placeholderIcon}</div>
                  )}
                  {picked && <CheckOverlay />}
                </div>
                <div style={tileLabel}>{item.name}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function CheckOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "#3B82F6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
      }}
    >
      <Check size={13} color="#ffffff" strokeWidth={3} />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div style={gridStyle}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            ...tileStyle(false),
            cursor: "default",
          }}
        >
          <div
            style={{
              ...tileImageWrap,
              animation: "qs-pulse 1.4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              ...tileLabel,
              height: 10,
              borderRadius: 4,
              background: "rgba(255,255,255,0.08)",
              animation: "qs-pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "48px 16px",
        color: "rgba(255,255,255,0.45)",
        textAlign: "center",
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.35)" }}>{icon}</div>
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500, margin: 0 }}>
        {title}
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>{hint}</p>
    </div>
  );
}

// ── Style tokens (kept inline so the modal is portable) ─────────────────────

const sectionLabelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 10,
};

const sectionLabel: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 500,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  // minmax(0, 1fr) — without the explicit 0 minimum, CSS Grid tracks
  // default to min-width: auto, which a long product name with
  // whiteSpace: nowrap inflates beyond the column width and produces
  // the horizontal scrollbar visible in SC1. The 0 minimum lets the
  // track shrink so the column sticks to its 1fr share.
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  overflow: "hidden",
};

const tileImageWrap: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "1 / 1",
  borderRadius: 12,
  overflow: "hidden",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const tileImage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const tileImagePlaceholder: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255,255,255,0.35)",
};

const tileLabel: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 500,
  color: "rgba(255,255,255,0.85)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function tileStyle(picked: boolean): React.CSSProperties {
  return {
    // minWidth: 0 — belt-and-suspenders alongside the grid track's
    // minmax(0, 1fr). A grid item's default min-width is auto, which
    // means its label (whiteSpace: nowrap) can override the cell's
    // assigned share. Forcing 0 lets the cell collapse cleanly.
    minWidth: 0,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    outline: picked ? "2px solid #3B82F6" : "none",
    outlineOffset: 2,
    borderRadius: 14,
  };
}
