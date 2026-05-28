"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Check, Info, ImageIcon, Package, Briefcase } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { unwrap } from "@/lib/utils/api-fetch";
import { offeringLabel } from "@/lib/offerings/labels";

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

// Unified catalog row (Phase 2 — Product + Service collapsed into Offering).
// `type` is a free string (product / service / menu_item / treatment / …);
// the picker no longer pre-splits by it.
interface Offering {
  _id: string;
  type: string;
  name: string;
  description?: string | null;
  price?: string | null;
  currency?: string | null;
  category?: string | null;
  duration?: string | null;
  tags?: string[];
  imageUrls?: string[];
}

export type AttachmentSelection =
  | { kind: "asset"; asset: Asset }
  | { kind: "offering"; offering: Offering };

interface SelectMediaModalProps {
  brandId: string;
  initial?: AttachmentSelection | null;
  onClose: () => void;
  onSelect: (selection: AttachmentSelection) => void;
}

type Tab = "library" | "catalog";

// Single page with a generous limit — most brands have under 100 offerings.
// Matches /dashboard/catalog's FETCH_LIMIT; if a real brand exceeds it we'll
// see it on the AI service source-contribution log and revisit with paging.
const FETCH_LIMIT = 100;

// Sentinel for the "All types" filter option.
const ALL_TYPES = "__all__";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SelectMediaModal({
  brandId,
  initial,
  onClose,
  onSelect,
}: SelectMediaModalProps) {
  const [tab, setTab] = useState<Tab>(
    initial?.kind === "offering" ? "catalog" : "library",
  );

  // Single-select across both tabs (mutual exclusion per CLAUDE.md
  // "Asset vs Catalog" rule). Reset whenever the user picks something new.
  const [picked, setPicked] = useState<AttachmentSelection | null>(initial ?? null);

  // Per-tab data + loading state. Each tab fetches lazily on first open.
  const [assets, setAssets] = useState<Asset[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);

  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(false);

  // Catalog tab filters: a type dropdown ("All types" default) + a name search.
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [search, setSearch] = useState("");

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
    } else if (tab === "catalog" && offerings.length === 0 && !loadingOfferings) {
      setLoadingOfferings(true);
      // Phase 2: one /api/offerings call (no ?type filter) returns every
      // offering type. Grouping + the type dropdown happen client-side so the
      // picker works whether a brand has 1 type or 10.
      fetch(`/api/offerings?brandId=${brandId}&limit=${FETCH_LIMIT}`, {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : { offerings: [] })).then(unwrap)
        .then((d: { offerings?: Offering[] }) => setOfferings(d.offerings ?? []))
        .catch(() => {})
        .finally(() => setLoadingOfferings(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, brandId]);

  // ── Type counts (drives the filter dropdown) ───────────────────────────────

  const typeCounts = useMemo(() => {
    // Map type → count, preserving first-seen order (the API sorts by
    // sortOrder asc / createdAt desc, so this mirrors the catalog page).
    const counts = new Map<string, number>();
    for (const o of offerings) {
      const t = (o.type || "product").trim() || "product";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [offerings]);

  // If the active type filter points at a type that no longer exists once data
  // loads (e.g. an `initial` from an older session), fall back to All types.
  const activeType =
    typeFilter !== ALL_TYPES && typeCounts.has(typeFilter) ? typeFilter : ALL_TYPES;

  // ── Filtered + grouped offerings ────────────────────────────────────────────

  const searchMatch = (o: Offering) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return o.name.toLowerCase().includes(q);
  };

  // When a specific type is selected → flat list of that type (search-filtered).
  const flatOfferings = useMemo(() => {
    if (activeType === ALL_TYPES) return [];
    return offerings.filter(
      (o) => ((o.type || "product").trim() || "product") === activeType && searchMatch(o),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, activeType, search]);

  // When "All types" → grouped by type, headers shown, search applied per item.
  const groupedOfferings = useMemo(() => {
    if (activeType !== ALL_TYPES) return [];
    const byType = new Map<string, Offering[]>();
    for (const o of offerings) {
      if (!searchMatch(o)) continue;
      const t = (o.type || "product").trim() || "product";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(o);
    }
    return Array.from(byType.entries()).map(([type, items]) => ({ type, items }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, activeType, search]);

  const hasAnyMatch =
    activeType === ALL_TYPES
      ? groupedOfferings.some((g) => g.items.length > 0)
      : flatOfferings.length > 0;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!picked) return;
    onSelect(picked);
  };

  const isPickedAsset = (a: Asset) => picked?.kind === "asset" && picked.asset._id === a._id;
  const isPickedOffering = (o: Offering) =>
    picked?.kind === "offering" && picked.offering._id === o._id;

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
            {/* Pill tab switcher */}
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
                  { key: "catalog", label: "Catalog" },
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

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "0 22px 18px",
            overflow: "hidden",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {tab === "library" && (
            <LibraryTab
              loading={loadingAssets}
              assets={assets}
              isPicked={isPickedAsset}
              onPick={(a) => setPicked({ kind: "asset", asset: a })}
            />
          )}
          {tab === "catalog" && (
            <CatalogTab
              loading={loadingOfferings}
              total={offerings.length}
              typeCounts={typeCounts}
              activeType={activeType}
              onTypeChange={setTypeFilter}
              search={search}
              onSearchChange={setSearch}
              grouped={groupedOfferings}
              flat={flatOfferings}
              hasAnyMatch={hasAnyMatch}
              isPicked={isPickedOffering}
              onPick={(o) => setPicked({ kind: "offering", offering: o })}
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
    <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
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
                    <img src={a.thumbnailUrl ?? a.url} alt="" style={tileImage} />
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
// Catalog tab — every Offering for the brand, filterable by type
// ─────────────────────────────────────────────────────────────────────────────

function CatalogTab({
  loading,
  total,
  typeCounts,
  activeType,
  onTypeChange,
  search,
  onSearchChange,
  grouped,
  flat,
  hasAnyMatch,
  isPicked,
  onPick,
}: {
  loading: boolean;
  total: number;
  typeCounts: Map<string, number>;
  activeType: string;
  onTypeChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  grouped: { type: string; items: Offering[] }[];
  flat: Offering[];
  hasAnyMatch: boolean;
  isPicked: (o: Offering) => boolean;
  onPick: (o: Offering) => void;
}) {
  return (
    <>
      <div style={sectionLabelRow}>
        <span style={sectionLabel}>Select from Catalog</span>
        <Info size={13} style={{ color: "rgba(255,255,255,0.40)" }} />
      </div>

      {/* Filter row: type dropdown ("All types" default) + name search. The
          dropdown lists only types that exist for this brand, with counts. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <select
          value={activeType}
          onChange={(e) => onTypeChange(e.target.value)}
          aria-label="Filter by offering type"
          disabled={loading || total === 0}
          style={{
            height: 38,
            flexShrink: 0,
            minWidth: 150,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            color: "#ffffff",
            fontSize: 13,
            padding: "0 12px",
            outline: "none",
            cursor: loading || total === 0 ? "not-allowed" : "pointer",
            colorScheme: "dark",
            boxSizing: "border-box",
          }}
        >
          <option value={ALL_TYPES}>All types ({total})</option>
          {Array.from(typeCounts.entries()).map(([type, count]) => (
            <option key={type} value={type}>
              {offeringLabel(type, "plural")} ({count})
            </option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search catalog items..."
          style={{
            flex: 1,
            height: 38,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            color: "#ffffff",
            fontSize: 13,
            padding: "0 14px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
        {loading ? (
          <SkeletonGrid />
        ) : total === 0 ? (
          <EmptyState
            icon={<Package size={20} />}
            title="No catalog items yet"
            hint="Add offerings from the Catalog page to use them here."
          />
        ) : !hasAnyMatch ? (
          <EmptyState
            icon={<Package size={20} />}
            title="No matching items"
            hint="Try a different name or type filter."
          />
        ) : activeType === ALL_TYPES ? (
          // Grouped view — section header per type, then a grid.
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {grouped
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.type}>
                  <div style={groupHeaderRow}>
                    <span style={groupHeaderLabel}>{offeringLabel(g.type, "plural")}</span>
                    <span style={groupHeaderCount}>{g.items.length}</span>
                  </div>
                  <OfferingGrid items={g.items} isPicked={isPicked} onPick={onPick} />
                </div>
              ))}
          </div>
        ) : (
          // Flat view — single type, no header.
          <OfferingGrid items={flat} isPicked={isPicked} onPick={onPick} />
        )}
      </div>
    </>
  );
}

function OfferingGrid({
  items,
  isPicked,
  onPick,
}: {
  items: Offering[];
  isPicked: (o: Offering) => boolean;
  onPick: (o: Offering) => void;
}) {
  return (
    <div style={gridStyle}>
      {items.map((item) => {
        const picked = isPicked(item);
        const cover = item.imageUrls?.[0] ?? null;
        const placeholderIcon =
          item.type === "service" || item.type === "treatment" ? (
            <Briefcase size={20} />
          ) : (
            <Package size={20} />
          );
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

// ── Style tokens ────────────────────────────────────────────────────────────

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

const groupHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

const groupHeaderLabel: React.CSSProperties = {
  color: "rgba(255,255,255,0.85)",
  fontSize: 13,
  fontWeight: 600,
};

const groupHeaderCount: React.CSSProperties = {
  color: "rgba(255,255,255,0.40)",
  fontSize: 12,
  fontWeight: 400,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
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
