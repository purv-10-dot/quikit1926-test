"use client";

/**
 * Catalog Discovery Curation step (Phase 3).
 *
 * Renders the discovered offerings from Phase 1 sitemap+JSON-LD+nav scrape,
 * grouped under expandable category headers. User picks which to import
 * into the brand's catalog. Each category surfaces an "Explore this
 * category" CTA that triggers a deep scrape of the category URL.
 *
 * Built extractable — accepts everything via props, owns no wizard state.
 * The Brand Creation Wizard wires it in for new-brand flow; a future
 * /dashboard/brands/[id]/discover route can drop the same component in
 * for re-discovery on existing brands.
 *
 * Visual treatment follows the QuikSocial design tokens. Selected state
 * uses #22C55E (QS published-green) and the "likely more" / Explore hints
 * use #F97316 (QS orange) — matches the v2 spec verbatim.
 *
 * Monorepo adaptations vs v2:
 *   - Import paths use the monorepo aliases (no `src/` prefix).
 *   - `Checkbox` is defined inline below: v2 imported it from
 *     `@/components/ui/Checkbox`, which has not been ported to the QuikIT
 *     monorepo yet. The component is small and self-contained, and the
 *     migration guardrails forbid creating new files outside the wizard
 *     directory — so the verbatim v2 implementation lives here instead.
 *   - `/api/offerings/explore-category` uses the QuikIT `{success,data}`
 *     envelope; the fetch handler unwraps it before reading `items`.
 */

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { Search, Loader2, Package } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { offeringLabel, offeringSetLabel } from "@/lib/offerings/labels";
import { unwrap } from "@/lib/utils/api-fetch";

// ─── Inline Checkbox ──────────────────────────────────────────────────────────
// Verbatim port of apps/web/src/components/ui/Checkbox.tsx from
// quiksocial-v2. Inlined here because the shared component hasn't been
// ported to the monorepo, and the wizard migration explicitly forbids
// creating new files outside this directory.
//
// Accessibility: role="checkbox" + aria-checked, Space/Enter toggles,
// tabIndex=0 so it's reachable by keyboard.

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: number;
  disabled?: boolean;
  ariaLabel?: string;
  /** Stops parent click handlers from firing (row-level click +
   *  checkbox click would otherwise double-toggle). */
  stopPropagation?: boolean;
}

const QS_GREEN = "#22C55E"; // QS published-green

function Checkbox({
  checked,
  onChange,
  size = 20,
  disabled = false,
  ariaLabel,
  stopPropagation = true,
}: CheckboxProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (stopPropagation) e.stopPropagation();
      if (disabled) return;
      onChange(!checked);
    },
    [checked, onChange, disabled, stopPropagation],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onChange(!checked);
      }
    },
    [checked, onChange, disabled],
  );

  // Tick path scales with the box size (~55% of the side, centred).
  const tickSize = Math.round(size * 0.55);

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.25)),
        border: checked
          ? `2px solid ${QS_GREEN}`
          : "2px solid rgba(255, 255, 255, 0.18)",
        background: checked ? QS_GREEN : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s ease, border-color 0.15s ease",
        outline: "none",
      }}
    >
      {checked && (
        <svg
          width={tickSize}
          height={tickSize}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path
            d="M2 6L5 9L10 3"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogOffering {
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
  /** Phase 5 LLM marketability score (0-100). Items lacking a score sort
   *  last within their category — typically these are Explore-injected
   *  items the LLM never saw. */
  marketability?: number | null;
}

export interface CatalogCategoryHint {
  name: string;
  url?: string | null;
}

export interface CatalogDiscoveryStepProps {
  brandName: string;
  /** Display origin (e.g. "kimirica.com") — shown in the breadcrumb-y subtitle. */
  brandHost: string;
  /** Full base URL used by the Explore call for SSRF-guarded fetches. */
  baseUrl: string;
  /** Brand row id when one exists, or "pending" for new-brand flow. */
  brandId: string;
  offerings: CatalogOffering[];
  categories: CatalogCategoryHint[];
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  onOfferingsAdded: (newItems: CatalogOffering[]) => void;
}

// ─── ID synthesis ─────────────────────────────────────────────────────────────
// Wizard state is in-memory only; we don't need real UUIDs. Name + URL is
// stable enough for dedup + selection tracking. Exported so the wizard can
// compute the same id when filtering selected offerings on advance.

export function offeringId(o: { name: string; url?: string | null }): string {
  return `${o.name.trim().toLowerCase()}__${(o.url ?? "").toLowerCase()}`;
}

// ─── Grouping logic ───────────────────────────────────────────────────────────

interface CategoryGroup {
  id: string;
  name: string;
  /** Source URL when known (sitemap listing) — gates the Explore CTA. */
  url: string | null;
  /** True when this group came from `categories` prop (sitemap hint) rather
   *  than being synthesized from offerings' `category` strings. */
  fromHint: boolean;
  items: Array<CatalogOffering & { id: string; isNew?: boolean }>;
}

function buildCategoryGroups(
  offerings: CatalogOffering[],
  hints: CatalogCategoryHint[],
  newItemIds: ReadonlySet<string>,
): CategoryGroup[] {
  // Order matters — categories from sitemap hints come first (typically the
  // brand's intended taxonomy), followed by per-type buckets for orphans.
  const byName = new Map<string, CategoryGroup>();

  // 1. Seed with hints (these may have URL but no items yet)
  for (const h of hints) {
    const key = h.name.trim();
    if (!key) continue;
    if (!byName.has(key)) {
      byName.set(key, {
        id: `cat__${key.toLowerCase()}`,
        name: key,
        url: h.url ?? null,
        fromHint: true,
        items: [],
      });
    } else if (h.url && !byName.get(key)!.url) {
      byName.get(key)!.url = h.url;
    }
  }

  // 2. Place offerings — named category first, type-bucket fallback
  for (const o of offerings) {
    const id = offeringId(o);
    const withFlags = { ...o, id, isNew: newItemIds.has(id) };

    const cat = (o.category ?? "").trim();
    if (cat) {
      if (!byName.has(cat)) {
        byName.set(cat, {
          id: `cat__${cat.toLowerCase()}`,
          name: cat,
          url: null,
          fromHint: false,
          items: [],
        });
      }
      byName.get(cat)!.items.push(withFlags);
      continue;
    }

    // No explicit category → bucket by type using offeringSetLabel.
    const typeLabel = offeringLabel(o.type || "product", "plural");
    const typeKey = `__type__${typeLabel}`;
    if (!byName.has(typeKey)) {
      byName.set(typeKey, {
        id: `cat__${typeKey}`,
        name: typeLabel,
        url: null,
        fromHint: false,
        items: [],
      });
    }
    byName.get(typeKey)!.items.push(withFlags);
  }

  // 3. Sort items within each group by marketability desc (nulls last),
  // then by name asc as a stable tiebreaker. Score comes from the
  // Phase 5 LLM classifier; rows from Explore-this-category never went
  // through it and sort to the bottom.
  for (const g of byName.values()) {
    g.items.sort((a, b) => {
      const sa = typeof a.marketability === "number" ? a.marketability : -1;
      const sb = typeof b.marketability === "number" ? b.marketability : -1;
      if (sa !== sb) return sb - sa;
      return a.name.localeCompare(b.name);
    });
  }

  // 4. Drop hint groups that have neither items nor an Explore URL —
  // they'd render as empty rows with nothing to do.
  return Array.from(byName.values()).filter(
    (g) => g.items.length > 0 || g.url,
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CatalogDiscoveryStep({
  brandName,
  brandHost,
  baseUrl,
  brandId,
  offerings,
  categories,
  selectedIds,
  onSelectionChange,
  onOfferingsAdded,
}: CatalogDiscoveryStepProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Open the first two non-empty groups by default — matches the mockup.
    const groups = buildCategoryGroups(offerings, categories, new Set());
    return new Set(groups.slice(0, 2).map((g) => g.id));
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [exploring, setExploring] = useState<Set<string>>(new Set());
  const [explored, setExplored] = useState<Set<string>>(new Set());
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const [exploreErrors, setExploreErrors] = useState<Record<string, string>>({});

  const groups = useMemo(
    () => buildCategoryGroups(offerings, categories, newItemIds),
    [offerings, categories, newItemIds],
  );

  const totalItems = offerings.length;
  const totalSelected = selectedIds.size;

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0 || g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  // ── Selection handlers ─────────────────────────────────────────────────────

  const toggleItem = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  const selectAllInGroup = useCallback(
    (group: CategoryGroup) => {
      const next = new Set(selectedIds);
      const allSelected = group.items.every((i) => next.has(i.id));
      if (allSelected) {
        for (const i of group.items) next.delete(i.id);
      } else {
        for (const i of group.items) next.add(i.id);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  const selectAll = useCallback(() => {
    const next = new Set<string>();
    for (const g of groups) for (const i of g.items) next.add(i.id);
    onSelectionChange(next);
  }, [groups, onSelectionChange]);

  const clearAll = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // ── Explore handler ────────────────────────────────────────────────────────

  const exploreCategory = useCallback(
    async (group: CategoryGroup) => {
      if (!group.url || exploring.has(group.id) || explored.has(group.id)) return;

      setExploring((prev) => new Set(prev).add(group.id));
      setExpanded((prev) => new Set(prev).add(group.id));
      setExploreErrors((prev) => {
        const { [group.id]: _, ...rest } = prev;
        return rest;
      });

      // Resolve relative URL against the brand's base if needed.
      const categoryUrl = group.url.startsWith("http")
        ? group.url
        : `${baseUrl.replace(/\/$/, "")}/${group.url.replace(/^\//, "")}`;

      try {
        const res = await fetch("/api/offerings/explore-category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            brandId,
            categoryUrl,
            baseUrl,
            categoryHint: group.name,
            maxItems: 50,
          }),
        });
        // QuikIT envelope: { success, data: { items, fetched } }.
        // unwrap() returns the inner `data` object so `items` reads as
        // it does on v2's bare payload.
        const data = unwrap(await res.json().catch(() => ({})));
        const items: CatalogOffering[] = Array.isArray((data as any)?.items)
          ? ((data as any).items as Array<Record<string, unknown>>).map((raw) => ({
              type: "product",
              name: String(raw.name ?? ""),
              description: (raw.description as string | null) ?? null,
              category: (raw.category as string | null) ?? group.name,
              price: (raw.price as string | null) ?? null,
              image_url: (raw.image_url as string | null) ?? null,
              url: (raw.url as string | null) ?? null,
              source: "explore",
              confidence: "medium",
            }))
          : [];

        // Dedup against what we already have (same id formula).
        const existing = new Set(offerings.map((o) => offeringId(o)));
        const fresh = items.filter((i) => i.name && !existing.has(offeringId(i)));

        if (fresh.length > 0) {
          setNewItemIds((prev) => {
            const next = new Set(prev);
            for (const f of fresh) next.add(offeringId(f));
            return next;
          });
          onOfferingsAdded(fresh);
        } else if (items.length === 0) {
          setExploreErrors((prev) => ({
            ...prev,
            [group.id]: "No additional items found.",
          }));
        }
      } catch (err) {
        setExploreErrors((prev) => ({
          ...prev,
          [group.id]: "Couldn't reach the category page. Try again later.",
        }));
      } finally {
        setExploring((prev) => {
          const next = new Set(prev);
          next.delete(group.id);
          return next;
        });
        setExplored((prev) => new Set(prev).add(group.id));
      }
    },
    [exploring, explored, baseUrl, brandId, offerings, onOfferingsAdded],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#22C55E",
              fontWeight: 600,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Catalog Discovery
          </span>
          <span style={{ color: "rgba(255,255,255,0.20)" }}>·</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
            {brandHost}
          </span>
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            color: "#FFFFFF",
            letterSpacing: "-0.3px",
          }}
        >
          We found {totalItems} {totalItems === 1 ? "item" : "items"} across{" "}
          {groups.length} {groups.length === 1 ? "category" : "categories"}
        </h2>
        <p
          style={{
            fontSize: 13.5,
            color: "rgba(255,255,255,0.65)",
            margin: "6px 0 0",
            lineHeight: 1.55,
          }}
        >
          {brandName
            ? `Select what ${brandName} wants to market. `
            : "Select what you want to market. "}
          Expand any category to find more items.
        </p>
      </div>

      {/* Search + master toggles */}
      <div
        style={{ display: "flex", gap: 10, alignItems: "center" }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.40)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 14px 9px 36px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.08)",
              color: "#FFFFFF",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>
        <button
          type="button"
          onClick={selectAll}
          style={{
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.65)",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={clearAll}
          style={{
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.65)",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          Clear
        </button>
      </div>

      {/* Category list — bounded with internal scroll (BUG_01). A large
          scrape used to grow this list unbounded (overflow:hidden, no
          maxHeight), pushing the page and breaking the sticky bar's
          alignment. Cap the height and scroll inside; the rounded border
          still clips via overflowX hidden. */}
      <div
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          overflowY: "auto",
          overflowX: "hidden",
          maxHeight: "calc(100dvh - 340px)",
          minHeight: 120,
          background: "rgba(33,33,33,0.14)",
        }}
      >
        {filteredGroups.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
            }}
          >
            No items match &quot;{searchQuery}&quot;.
          </div>
        )}
        {filteredGroups.map((g) => {
          const isOpen = expanded.has(g.id);
          const isExploring = exploring.has(g.id);
          const isExplored = explored.has(g.id);
          const selectedInGroup = g.items.filter((i) =>
            selectedIds.has(i.id),
          ).length;
          const allInGroupSelected =
            g.items.length > 0 &&
            g.items.every((i) => selectedIds.has(i.id));
          const showExplore = !!g.url && !isExplored;
          const exploreErr = exploreErrors[g.id];

          return (
            <CategorySection
              key={g.id}
              group={g}
              isOpen={isOpen}
              onToggleOpen={() => {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.id)) next.delete(g.id);
                  else next.add(g.id);
                  return next;
                });
              }}
              selectedIdsRef={selectedIds}
              selectedInGroup={selectedInGroup}
              allInGroupSelected={allInGroupSelected}
              onSelectAllInGroup={() => selectAllInGroup(g)}
              onToggleItem={toggleItem}
              showExplore={showExplore}
              isExploring={isExploring}
              isExplored={isExplored}
              exploreError={exploreErr}
              onExplore={() => exploreCategory(g)}
            />
          );
        })}
      </div>

      {/* Sticky bottom action bar — only when something is selected */}
      {totalSelected > 0 && (
        <div
          style={{
            position: "sticky",
            // BUG_01: was -40 (pushed 40px below the viewport, never pinned
            // cleanly). Pin to the bottom with a small inset.
            bottom: 8,
            marginTop: 8,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "12px 20px",
              borderRadius: 14,
              background: "rgba(33,33,33,0.85)",
              border: "1px solid rgba(34,197,94,0.30)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              pointerEvents: "auto",
              // BUG_01: dropped maxWidth:640 — it made the bar 40px narrower
              // than the 680 column + list above, reading as misaligned.
              // Now fills the column width like the list.
              width: "100%",
              justifyContent: "space-between",
            }}
          >
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#FFFFFF" }}>
                {totalSelected} {totalSelected === 1 ? "item" : "items"} selected
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.40)",
                  marginLeft: 8,
                }}
              >
                ready for your catalog
              </span>
            </div>
            <span
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.65)",
                fontStyle: "italic",
              }}
            >
              Continue to next step to save →
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponent: CategorySection ────────────────────────────────────────────

interface CategorySectionProps {
  group: CategoryGroup;
  isOpen: boolean;
  onToggleOpen: () => void;
  selectedIdsRef: ReadonlySet<string>;
  selectedInGroup: number;
  allInGroupSelected: boolean;
  onSelectAllInGroup: () => void;
  onToggleItem: (id: string) => void;
  showExplore: boolean;
  isExploring: boolean;
  isExplored: boolean;
  exploreError?: string;
  onExplore: () => void;
}

function CategorySection({
  group,
  isOpen,
  onToggleOpen,
  selectedIdsRef,
  selectedInGroup,
  allInGroupSelected,
  onSelectAllInGroup,
  onToggleItem,
  showExplore,
  isExploring,
  isExplored,
  exploreError,
  onExplore,
}: CategorySectionProps) {
  return (
    <div>
      {/* Header */}
      <div
        onClick={onToggleOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          background: "rgba(255,255,255,0.025)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: "rgba(255,255,255,0.65)",
            flexShrink: 0,
            transition: "transform 0.2s ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            fontFamily: "inherit",
          }}
          aria-hidden
        >
          ›
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}
          >
            {group.name}
          </span>
          <span
            style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 500 }}
          >
            {group.items.length}{" "}
            {group.items.length === 1 ? "item" : "items"}
          </span>
          {showExplore && (
            <span style={{ fontSize: 11, color: "#F97316", fontWeight: 500 }}>
              · likely more on site
            </span>
          )}
          {isExplored && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(34,197,94,0.12)",
                color: "#22C55E",
                fontWeight: 600,
              }}
            >
              All found
            </span>
          )}
        </div>
        {selectedInGroup > 0 && (
          <span
            style={{
              fontSize: 11,
              color: "#22C55E",
              fontWeight: 600,
              background: "rgba(34,197,94,0.10)",
              padding: "3px 10px",
              borderRadius: 10,
              flexShrink: 0,
            }}
          >
            {selectedInGroup} selected
          </span>
        )}
        {/* Bug 1 fix — Explore button surfaced in the COLLAPSED header so
            users see it without expanding the group. The expanded
            section below also renders a fuller Explore row; this header
            chip is the discoverable entry point. */}
        {showExplore && !isExploring && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExplore();
            }}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid rgba(249,115,22,0.35)",
              background: "rgba(249,115,22,0.08)",
              color: "#F97316",
              fontSize: 11,
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            <Search size={11} aria-hidden />
            Explore
          </button>
        )}
        {isExploring && (
          <span
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid rgba(34,197,94,0.30)",
              background: "rgba(34,197,94,0.06)",
              color: "#22C55E",
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <Loader2 size={11} className="animate-spin" />
            Scanning
          </span>
        )}
        {group.items.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectAllInGroup();
            }}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.10)",
              background: allInGroupSelected
                ? "rgba(34,197,94,0.10)"
                : "transparent",
              color: allInGroupSelected ? "#22C55E" : "rgba(255,255,255,0.65)",
              fontSize: 11,
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontWeight: 500,
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            {allInGroupSelected ? "✓ All" : "Select all"}
          </button>
        )}
      </div>

      {/* Items */}
      {isOpen && (
        <>
          {group.items.map((item) => (
            <DiscoveryItemRow
              key={item.id}
              item={item}
              selected={selectedIdsRef.has(item.id)}
              onToggle={() => onToggleItem(item.id)}
            />
          ))}

          {isExploring && (
            <div
              style={{
                padding: "14px 18px 14px 52px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(34,197,94,0.04)",
              }}
            >
              <Loader2
                size={14}
                style={{ color: "#22C55E" }}
                className="animate-spin"
              />
              <span style={{ fontSize: 13, color: "#22C55E", fontWeight: 500 }}>
                Scanning {group.name.toLowerCase()} for more items...
              </span>
            </div>
          )}

          {!isExploring && showExplore && (
            <div
              onClick={onExplore}
              style={{
                padding: "13px 18px 13px 52px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(249,115,22,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Search size={14} style={{ color: "#F97316" }} aria-hidden />
              <span style={{ fontSize: 13, color: "#F97316", fontWeight: 500 }}>
                Explore this category
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                — may find more items
              </span>
            </div>
          )}

          {exploreError && (
            <div
              style={{
                padding: "10px 18px 10px 52px",
                fontSize: 12,
                color: "rgba(255,255,255,0.40)",
                fontStyle: "italic",
              }}
            >
              {exploreError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Subcomponent: DiscoveryItemRow ───────────────────────────────────────────

interface DiscoveryItemRowProps {
  item: CatalogOffering & { id: string; isNew?: boolean };
  selected: boolean;
  onToggle: () => void;
}

function DiscoveryItemRow({ item, selected, onToggle }: DiscoveryItemRowProps) {
  const tintBase = item.isNew ? "rgba(34,197,94,0.04)" : "transparent";
  const tintSelected = "rgba(34,197,94,0.10)";
  const leftBorderBase = item.isNew
    ? "3px solid rgba(34,197,94,0.30)"
    : "3px solid transparent";

  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "11px 18px 11px 52px",
        background: selected ? tintSelected : tintBase,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
        transition: "background 0.15s ease",
        borderLeft: selected ? "3px solid #22C55E" : leftBorderBase,
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = item.isNew
            ? "rgba(34,197,94,0.06)"
            : "rgba(255,255,255,0.03)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = tintBase;
      }}
    >
      <Checkbox
        checked={selected}
        onChange={onToggle}
        size={20}
        ariaLabel={`Select ${item.name}`}
      />

      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          flexShrink: 0,
          overflow: "hidden",
          border: item.isNew
            ? "1px solid rgba(34,197,94,0.25)"
            : "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.image_url ? (
          <ImageWithFallback
            src={item.image_url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <Package size={16} style={{ color: "rgba(255,255,255,0.40)" }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "rgba(255,255,255,0.90)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {item.name}
          {item.isNew && (
            <span
              style={{
                fontSize: 9,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(34,197,94,0.15)",
                color: "#22C55E",
                fontWeight: 600,
                letterSpacing: 0.3,
                flexShrink: 0,
              }}
            >
              NEW
            </span>
          )}
        </div>
      </div>

      {item.price && (
        <span
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.40)",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {item.price}
        </span>
      )}
    </div>
  );
}
