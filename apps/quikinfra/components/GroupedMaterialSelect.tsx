"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Search, X, ChevronDown, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useLazyGroupItems } from "@/hooks/use-lazy-group-items";

type PopoverPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
};

function usePopoverPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement>,
  estimatedHeight = 288,
  minWidth = 280,
): PopoverPosition | null {
  const [pos, setPos] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setPos(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.max(r.width, minWidth);
      const spaceBelow = vh - r.bottom;
      const spaceAbove = r.top;
      const placement: "below" | "above" =
        spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove ? "below" : "above";
      let left = r.left;
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
      // Anchor to the edge of the trigger and let the popover grow toward
      // the available space. For "above" we pin the popover's BOTTOM to the
      // trigger's top so a short list hugs the trigger instead of floating
      // up with a fixed-height gap. maxHeight keeps it inside the viewport.
      if (placement === "below") {
        const maxHeight = Math.max(120, Math.min(estimatedHeight, spaceBelow - 8));
        setPos({ top: r.bottom + 4, left, width, maxHeight, placement });
      } else {
        const maxHeight = Math.max(120, Math.min(estimatedHeight, spaceAbove - 8));
        setPos({ bottom: vh - r.top + 4, left, width, maxHeight, placement });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef, estimatedHeight, minWidth]);

  return pos;
}

export const GROUPED_MATERIAL_OTHERS_GROUP_ID = "__qc_item_group_others__";
const OTHERS_GROUP_ID = GROUPED_MATERIAL_OTHERS_GROUP_ID;

export interface GroupedMaterialSelectItem {
  id: string;
  name?: string | null;
  code?: string | null;
  uomCode?: string | null;
  hsnCode?: string | null;
  groupId?: string | null;
  groupName?: string | null;
}

export interface ItemGroupOption {
  id: string;
  name: string;
  status?: string;
  /** Real active-item count from the server. When provided, the picker shows
   *  it as the group's "N materials" badge — needed in lazy mode where the
   *  items aren't loaded, so the bucket's own `items.length` would read 0. */
  itemCount?: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  items: GroupedMaterialSelectItem[];
  groups: ItemGroupOption[];
  /** If provided, opening the picker starts scoped to this group (unless a material is already selected). */
  initialGroupId?: string | null;
  /** Visual size. Use `sm` for compact line-item grids. */
  size?: "sm" | "md";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Opt-in server-side item loading. When true, the "items in group" step
   * fetches that group's items from `/api/masters/items` (search + scroll)
   * instead of relying on the full `items` prop. Groups still come from the
   * `groups` prop. Pass the currently-selected item in `items` (or none) so
   * the trigger can render its label; other rows are fetched on demand.
   */
  lazy?: boolean;
  /**
   * Fires alongside onChange with the full selected item object (resolved
   * from the fetched page / cache / items prop). Lets a form autofill
   * uom/rate/stock from the picked item WITHOUT holding the entire item
   * master in memory — the key to dropping the eager `useItems()` load.
   */
  onSelect?: (item: GroupedMaterialSelectItem | null) => void;
  /**
   * Fallback label for the currently-selected value when the full item
   * object isn't in `items`/cache (lazy mode on an edit/prefill form).
   * Pass the row's stored item name so the trigger still shows it without
   * loading the whole item master.
   */
  selectedLabel?: string;
}

function bucketIdForItem(item: GroupedMaterialSelectItem): string {
  const gid = String(item.groupId ?? "").trim();
  const gname = String(item.groupName ?? "").trim();
  if (!gid || !gname) return OTHERS_GROUP_ID;
  return gid;
}

export type MaterialGroupBucket = {
  id: string;
  name: string;
  items: GroupedMaterialSelectItem[];
  /** Server-provided active-item count (see {@link ItemGroupOption.itemCount}). */
  itemCount?: number;
};

export function buildMaterialGroupBuckets(
  items: GroupedMaterialSelectItem[],
  groups: ItemGroupOption[],
): {
  buckets: Map<string, MaterialGroupBucket>;
  groupRows: MaterialGroupBucket[];
} {
  const groupMetaById = new Map<string, ItemGroupOption>();
  for (const g of groups) {
    if (g?.id) groupMetaById.set(g.id, g);
  }
  const map = new Map<string, MaterialGroupBucket>();
  for (const item of items) {
    const bid = bucketIdForItem(item);
    let bucket = map.get(bid);
    if (!bucket) {
      let name: string;
      if (bid === OTHERS_GROUP_ID) {
        name = "Others";
      } else {
        const master = groupMetaById.get(bid);
        name =
          master?.name?.trim() ||
          String(item.groupName ?? "").trim() ||
          "Unknown group";
      }
      bucket = { id: bid, name, items: [], itemCount: groupMetaById.get(bid)?.itemCount };
      map.set(bid, bucket);
    }
    bucket.items.push(item);
  }
  // Seed every active master group so it always appears in the picker even
  // when no items are assigned to it yet — the group list stays stable and
  // users can browse into a group before it holds any materials.
  for (const g of groups) {
    if (!g?.id || map.has(g.id)) continue;
    if (g.status === "inactive" || g.status === "deleted") continue;
    map.set(g.id, { id: g.id, name: g.name?.trim() || "Unknown group", items: [], itemCount: g.itemCount });
  }

  const groupRows = Array.from(map.values()).filter((b) => {
    // Hide item groups that are inactive/deleted so they never appear in the
    // picker.
    const meta = groupMetaById.get(b.id);
    if (meta && (meta.status === "inactive" || meta.status === "deleted")) {
      return false;
    }
    // Show a group only when it actually holds materials. `itemCount` is the
    // server-provided active-item count (available even in lazy mode, where
    // items aren't loaded); fall back to the loaded items for eager callers.
    // Empty groups and the synthetic "Others" bucket stay hidden until they
    // hold items.
    const count = b.itemCount ?? b.items.length;
    return count > 0;
  });
  groupRows.sort((a, b) => {
    const ao = a.id === OTHERS_GROUP_ID ? 1 : 0;
    const bo = b.id === OTHERS_GROUP_ID ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return { buckets: map, groupRows };
}

export function GroupedMaterialSelect({
  value,
  onChange,
  items,
  groups,
  initialGroupId = null,
  size = "md",
  placeholder = "Choose item group…",
  disabled = false,
  className = "",
  lazy = false,
  onSelect,
  selectedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"groups" | "items">("groups");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverPos = usePopoverPosition(open, triggerRef);

  // ── Lazy mode: debounced search + server-fetched items for the active group ──
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (!lazy) return;
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query, lazy]);
  const lazyGroup = useLazyGroupItems({
    groupId: activeGroupId,
    search: debouncedQuery,
    enabled: lazy && open && step === "items",
  });
  // Cache items seen (via `items` prop or fetched) so the trigger can render
  // the selected item's label even when it isn't in the current fetched page.
  const itemCacheRef = useRef<Map<string, GroupedMaterialSelectItem>>(new Map());
  useEffect(() => {
    for (const it of items) itemCacheRef.current.set(it.id, it);
  }, [items]);
  useEffect(() => {
    for (const it of lazyGroup.items) {
      itemCacheRef.current.set(it.id, it as GroupedMaterialSelectItem);
    }
  }, [lazyGroup.items]);

  const { buckets, groupRows } = useMemo(
    () => buildMaterialGroupBuckets(items, groups),
    [items, groups],
  );

  const selectedItem = useMemo(
    () =>
      value
        ? items.find((i) => i.id === value) ??
          (lazy ? itemCacheRef.current.get(value) ?? null : null)
        : null,
    // lazyGroup.items in deps so the label resolves once the group is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, value, lazy, lazyGroup.items],
  );

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groupRows;
    const q = query.toLowerCase();
    return groupRows.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupRows, query]);

  const itemsInActiveGroup = useMemo(() => {
    if (!activeGroupId) return [];
    return buckets.get(activeGroupId)?.items ?? [];
  }, [activeGroupId, buckets]);

  const filteredItems = useMemo(() => {
    // Lazy mode: the server already filtered by group + search.
    if (lazy) return lazyGroup.items as GroupedMaterialSelectItem[];
    if (!query.trim()) return itemsInActiveGroup;
    const q = query.toLowerCase();
    return itemsInActiveGroup.filter((it) => {
      const hay = `${it.name ?? ""} ${it.code ?? ""} ${it.groupName ?? ""} ${it.hsnCode ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lazy, lazyGroup.items, itemsInActiveGroup, query]);

  const visibleRows = step === "groups" ? filteredGroups : filteredItems;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, step]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, step, open, activeGroupId, visibleRows.length]);

  const openPicker = useCallback(() => {
    setQuery("");
    if (value && selectedItem) {
      setActiveGroupId(bucketIdForItem(selectedItem));
      setStep("items");
    } else if (initialGroupId) {
      setActiveGroupId(initialGroupId);
      setStep("items");
    } else {
      setActiveGroupId(null);
      setStep("groups");
    }
    setOpen(true);
  }, [value, selectedItem, initialGroupId]);

  const pickItem = useCallback(
    (itemId: string) => {
      onChange(itemId);
      if (onSelect) {
        const picked =
          (filteredItems as GroupedMaterialSelectItem[]).find((it) => it.id === itemId) ??
          itemCacheRef.current.get(itemId) ??
          items.find((it) => it.id === itemId) ??
          null;
        onSelect(picked);
      }
      setOpen(false);
      setQuery("");
    },
    [onChange, onSelect, filteredItems, items],
  );

  const clear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
      setQuery("");
    },
    [onChange],
  );

  const enterGroup = useCallback((gid: string) => {
    setActiveGroupId(gid);
    setStep("items");
    setQuery("");
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(visibleRows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (step === "groups") {
        const g = filteredGroups[activeIndex];
        if (g) enterGroup(g.id);
      } else {
        const it = filteredItems[activeIndex];
        if (it) pickItem(it.id);
      }
    } else if (e.key === "Escape") {
      if (step === "items") {
        setStep("groups");
        setActiveGroupId(null);
        setQuery("");
      } else {
        setOpen(false);
      }
    }
  };

  const ui = useMemo(() => {
    const sm = size === "sm";
    return {
      trigger: sm
        ? "px-2 py-1.5 text-xs rounded border border-gray-300"
        : "px-2.5 py-2 text-sm rounded-lg border border-gray-300",
      triggerFocus: "focus:outline-none focus:ring-2 focus:ring-accent-500",
      popover: sm ? "rounded border border-gray-200" : "rounded-lg border border-gray-200",
      optionPad: sm ? "px-2 py-1.5" : "px-2.5 py-2",
      optionTitle: sm ? "text-xs" : "text-sm",
      optionSub: "text-[10px] text-gray-500 truncate",
      badge: sm ? "text-[8px] px-1.5 py-0.5" : "text-[9px] px-1.5 py-0.5",
      icon: sm ? "w-3 h-3" : "w-3.5 h-3.5",
      chevron: sm ? "w-3 h-3" : "w-3.5 h-3.5",
      searchWrap: sm ? "px-2 py-1.5" : "px-2.5 py-2",
      searchInput: sm ? "text-xs" : "text-sm",
    };
  }, [size]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && (open ? setOpen(false) : openPicker())}
        className={`w-full flex items-center gap-2 ${ui.trigger} bg-white ${ui.triggerFocus} ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {selectedItem ? (
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-gray-900">
              {selectedItem.name ?? selectedItem.code ?? selectedItem.id}
            </div>
            <div className="text-[10px] text-gray-500 truncate">
              {[selectedItem.code, selectedItem.uomCode, selectedItem.groupName].filter(Boolean).join(" · ")}
            </div>
          </div>
        ) : value && selectedLabel ? (
          // Lazy/edit mode: the full item object isn't loaded, but the row
          // carries its stored name — show it so the trigger isn't blank.
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-gray-900">{selectedLabel}</div>
          </div>
        ) : (
          <span className="flex-1 text-left text-gray-400">{placeholder}</span>
        )}
        {(selectedItem || (value && selectedLabel)) && !disabled && (
          <span
            onClick={clear}
            role="button"
            aria-label="Clear selection"
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className={ui.icon} />
          </span>
        )}
        <ChevronDown className={`${ui.chevron} text-gray-400 shrink-0`} />
      </button>

      {open && !disabled && popoverPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: popoverPos.top,
            bottom: popoverPos.bottom,
            left: popoverPos.left,
            width: popoverPos.width,
            maxHeight: popoverPos.maxHeight,
          }}
          className={`z-[100] bg-white ${ui.popover} shadow-lg overflow-hidden flex flex-col`}
        >
          <div className={`flex items-center gap-2 ${ui.searchWrap} border-b border-gray-100`}>
            {step === "items" && (
              <button
                type="button"
                onClick={() => {
                  setStep("groups");
                  setActiveGroupId(null);
                  setQuery("");
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Back to groups"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={step === "groups" ? "Search groups…" : "Search items…"}
              className={`flex-1 ${ui.searchInput} outline-none bg-transparent min-w-0`}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X className={ui.icon} />
              </button>
            )}
          </div>

          {step === "items" && activeGroupId && (
            <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-50 bg-gray-50/80">
              {(lazy ? groups.find((g) => g.id === activeGroupId)?.name : buckets.get(activeGroupId)?.name) ?? "Items"}
              <span className="font-normal text-gray-400 normal-case ml-1">
                ({filteredItems.length}
                {lazy ? ` of ${lazyGroup.total}` : query.trim() ? ` of ${itemsInActiveGroup.length}` : ""})
              </span>
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto"
            onScroll={
              lazy && step === "items"
                ? (e) => {
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) lazyGroup.loadMore();
                  }
                : undefined
            }
          >
            {visibleRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                {step === "groups"
                  ? items.length === 0
                    ? "Loading items…"
                    : "No matching groups"
                  : lazy
                    ? lazyGroup.loading
                      ? "Loading…"
                      : "No matching items"
                    : !query.trim() && itemsInActiveGroup.length === 0
                      ? "No materials in this group yet"
                      : "No matching items"}
              </div>
            ) : step === "groups" ? (
              filteredGroups.map((g, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => enterGroup(g.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left ${ui.optionPad} flex items-center gap-2 ${
                      active ? "bg-accent-50" : "hover:bg-accent-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`${ui.optionTitle} text-gray-900 truncate`}>{g.name}</div>
                      {g.itemCount != null ? (
                        <div className="text-[10px] text-gray-500">{g.itemCount} material{g.itemCount === 1 ? "" : "s"}</div>
                      ) : !lazy ? (
                        <div className="text-[10px] text-gray-500">{g.items.length} material{g.items.length === 1 ? "" : "s"}</div>
                      ) : null}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </button>
                );
              })
            ) : (
              filteredItems.map((it, i) => {
                const active = i === activeIndex;
                const isSelected = it.id === value;
                const sub = [it.code, it.uomCode].filter(Boolean).join(" · ");
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => pickItem(it.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left ${ui.optionPad} flex items-center gap-2 ${active ? "bg-accent-50" : "hover:bg-accent-50"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`${ui.optionTitle} text-gray-900 truncate`}>{it.name ?? it.code ?? it.id}</div>
                      {sub ? <div className={ui.optionSub}>{sub}</div> : null}
                    </div>
                    {it.uomCode ? (
                      <span className={`${ui.badge} font-semibold text-gray-500 bg-gray-100 rounded-full shrink-0`}>
                        {it.uomCode}
                      </span>
                    ) : null}
                    {isSelected ? <Check className="w-3.5 h-3.5 text-accent-600 shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

type MultiProps = {
  values: string[];
  onChange: (value: string[]) => void;
  items: GroupedMaterialSelectItem[];
  groups: ItemGroupOption[];
  placeholder?: string;
  disabled?: boolean;
  /**
   * Opt-in server-side item loading — mirrors {@link GroupedMaterialSelect}'s
   * `lazy`. The "items in group" step fetches from `/api/masters/items`
   * (search + scroll) instead of the full `items` prop, so a form can select
   * many materials WITHOUT bulk-loading the whole item master. Groups still
   * come from the `groups` prop.
   */
  lazy?: boolean;
  /**
   * Fires with the full item object whenever a material is checked (resolved
   * from the fetched page / cache). Lets the page cache the picked item's
   * metadata (code / name / uom) so chips + downstream editors can label it
   * without the master. Not fired on uncheck.
   */
  onToggleItem?: (item: GroupedMaterialSelectItem) => void;
  /**
   * Page-provided label resolver for already-selected chips (lazy/edit mode
   * where the item isn't in `items`). Return null to fall back to the
   * `items` lookup, then the raw id.
   */
  chipLabelById?: (id: string) => string | null;
};

/**
 * Same group → material navigation as {@link GroupedMaterialSelect}, but
 * multiple selections (chips + checkboxes). Used where a location stores many
 * items — buckets match Indents / RFQ material pickers (item-group master).
 */
export function GroupedMaterialMultiSelect({
  values,
  onChange,
  items,
  groups,
  placeholder = "Select material(s)…",
  disabled = false,
  lazy = false,
  onToggleItem,
  chipLabelById,
}: MultiProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"groups" | "items">("groups");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverPos = usePopoverPosition(open, triggerWrapRef);

  // ── Lazy mode: debounced search + server-fetched items for the active group ──
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (!lazy) return;
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query, lazy]);
  const lazyGroup = useLazyGroupItems({
    groupId: activeGroupId,
    search: debouncedQuery,
    enabled: lazy && open && step === "items",
  });
  const itemCacheRef = useRef<Map<string, GroupedMaterialSelectItem>>(new Map());
  useEffect(() => {
    for (const it of items) itemCacheRef.current.set(it.id, it);
  }, [items]);
  useEffect(() => {
    for (const it of lazyGroup.items) {
      itemCacheRef.current.set(it.id, it as GroupedMaterialSelectItem);
    }
  }, [lazyGroup.items]);

  const { buckets, groupRows } = useMemo(
    () => buildMaterialGroupBuckets(items, groups),
    [items, groups],
  );

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groupRows;
    const q = query.toLowerCase();
    return groupRows.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupRows, query]);

  const itemsInActiveGroup = useMemo(() => {
    if (!activeGroupId) return [];
    return buckets.get(activeGroupId)?.items ?? [];
  }, [activeGroupId, buckets]);

  const filteredItems = useMemo(() => {
    // Lazy mode: the server already filtered by group + search.
    if (lazy) return lazyGroup.items as GroupedMaterialSelectItem[];
    if (!query.trim()) return itemsInActiveGroup;
    const q = query.toLowerCase();
    return itemsInActiveGroup.filter((it) => {
      const hay = `${it.name ?? ""} ${it.code ?? ""} ${it.groupName ?? ""} ${it.hsnCode ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lazy, lazyGroup.items, itemsInActiveGroup, query]);

  const visibleCount = step === "groups" ? filteredGroups.length : filteredItems.length;

  const labelOf = useCallback(
    (id: string) => {
      const fromPage = chipLabelById?.(id);
      if (fromPage) return fromPage;
      const it = items.find((i) => i.id === id) ?? itemCacheRef.current.get(id);
      if (!it) return id;
      if (it.code) return `${it.code} — ${it.name ?? it.id}`;
      return it.name ?? it.id;
    },
    [items, chipLabelById],
  );

  const toggleItem = useCallback(
    (id: string) => {
      if (values.includes(id)) {
        onChange(values.filter((x) => x !== id));
      } else {
        onChange([...values, id]);
        if (onToggleItem) {
          const picked =
            (filteredItems as GroupedMaterialSelectItem[]).find((it) => it.id === id) ??
            itemCacheRef.current.get(id) ??
            items.find((it) => it.id === id) ??
            null;
          if (picked) onToggleItem(picked);
        }
      }
    },
    [values, onChange, onToggleItem, filteredItems, items],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, step]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, step, open, activeGroupId, visibleCount]);

  const openPicker = useCallback(() => {
    setQuery("");
    setActiveGroupId(null);
    setStep("groups");
    setOpen(true);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const len = step === "groups" ? filteredGroups.length : filteredItems.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(len - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (step === "groups") {
        const g = filteredGroups[activeIndex];
        if (g) {
          setActiveGroupId(g.id);
          setStep("items");
          setQuery("");
        }
      } else {
        const it = filteredItems[activeIndex];
        if (it) toggleItem(it.id);
      }
    } else if (e.key === "Escape") {
      if (step === "items") {
        setStep("groups");
        setActiveGroupId(null);
        setQuery("");
      } else {
        setOpen(false);
      }
    }
  };

  const enterGroup = useCallback((gid: string) => {
    setActiveGroupId(gid);
    setStep("items");
    setQuery("");
  }, []);

  const triggerDisabled = disabled || (!lazy && items.length === 0);

  return (
    <div ref={rootRef} className="relative">
      <div
        ref={triggerWrapRef}
        className={`flex flex-wrap items-center gap-1.5 min-h-[38px] py-1.5 pl-2 pr-8 rounded-lg border bg-white ${
          disabled ? "border-gray-200 opacity-50" : "border-gray-300"
        }`}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-50 text-accent-700 text-xs font-medium border border-accent-200"
          >
            {labelOf(v)}
            {!disabled && (
              <button
                type="button"
                onClick={() => toggleItem(v)}
                className="hover:text-accent-900 leading-none"
                aria-label={`Remove ${labelOf(v)}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          disabled={triggerDisabled}
          onClick={() => !triggerDisabled && (open ? setOpen(false) : openPicker())}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex-1 min-w-[120px] text-left text-sm bg-transparent focus:outline-none ${
            values.length === 0 ? "text-gray-400" : "text-gray-600"
          } disabled:text-gray-400`}
        >
          {values.length === 0 ? placeholder : `${values.length} selected — pick more or remove`}
        </button>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && !disabled && (lazy || items.length > 0) && popoverPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "fixed",
            top: popoverPos.top,
            bottom: popoverPos.bottom,
            left: popoverPos.left,
            width: popoverPos.width,
            maxHeight: popoverPos.maxHeight,
          }}
          className="z-[100] overflow-hidden flex flex-col rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100">
            {step === "items" && (
              <button
                type="button"
                onClick={() => {
                  setStep("groups");
                  setActiveGroupId(null);
                  setQuery("");
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Back to groups"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={step === "groups" ? "Search groups…" : "Search items…"}
              className="flex-1 text-sm outline-none bg-transparent min-w-0"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {step === "items" && activeGroupId && (
            <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-50 bg-gray-50/80">
              {(lazy ? groups.find((g) => g.id === activeGroupId)?.name : buckets.get(activeGroupId)?.name) ?? "Items"}
              <span className="font-normal text-gray-400 normal-case ml-1">
                ({filteredItems.length}
                {lazy ? ` of ${lazyGroup.total}` : query.trim() ? ` of ${itemsInActiveGroup.length}` : ""})
              </span>
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto py-1 max-h-56"
            onScroll={
              lazy && step === "items"
                ? (e) => {
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) lazyGroup.loadMore();
                  }
                : undefined
            }
          >
            {visibleCount === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                {step === "groups"
                  ? lazy
                    ? groups.length === 0
                      ? "No item groups"
                      : "No matching groups"
                    : items.length === 0
                      ? "Loading items…"
                      : "No matching groups"
                  : lazy
                    ? lazyGroup.loading
                      ? "Loading…"
                      : "No matching items"
                    : !query.trim() && itemsInActiveGroup.length === 0
                      ? "No materials in this group yet"
                      : "No matching items"}
              </div>
            ) : step === "groups" ? (
              filteredGroups.map((g, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => enterGroup(g.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-2.5 py-2 flex items-center gap-2 ${
                      active ? "bg-accent-50" : "hover:bg-accent-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{g.name}</div>
                      {g.itemCount != null ? (
                        <div className="text-[10px] text-gray-500">
                          {g.itemCount} material{g.itemCount === 1 ? "" : "s"}
                        </div>
                      ) : !lazy ? (
                        <div className="text-[10px] text-gray-500">
                          {g.items.length} material{g.items.length === 1 ? "" : "s"}
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </button>
                );
              })
            ) : (
              filteredItems.map((it, i) => {
                const active = i === activeIndex;
                const selected = values.includes(it.id);
                const sub = [it.code, it.uomCode].filter(Boolean).join(" · ");
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggleItem(it.id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                      active ? "bg-accent-50" : "hover:bg-gray-100"
                    } ${selected ? "text-accent-800" : "text-gray-700"}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                        selected ? "bg-accent-600 border-accent-600 text-white" : "border-gray-300 bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {selected && <Check className="w-3 h-3" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{it.name ?? it.code ?? it.id}</div>
                      {sub ? <div className="text-[10px] text-gray-500 truncate">{sub}</div> : null}
                    </div>
                    {it.uomCode ? (
                      <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5 shrink-0">
                        {it.uomCode}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
