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
      bucket = { id: bid, name, items: [] };
      map.set(bid, bucket);
    }
    bucket.items.push(item);
  }
  const groupRows = Array.from(map.values()).filter((b) => b.items.length > 0);
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

  const { buckets, groupRows } = useMemo(
    () => buildMaterialGroupBuckets(items, groups),
    [items, groups],
  );

  const selectedItem = useMemo(
    () => (value ? items.find((i) => i.id === value) ?? null : null),
    [items, value],
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
    if (!query.trim()) return itemsInActiveGroup;
    const q = query.toLowerCase();
    return itemsInActiveGroup.filter((it) => {
      const hay = `${it.name ?? ""} ${it.code ?? ""} ${it.groupName ?? ""} ${it.hsnCode ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [itemsInActiveGroup, query]);

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
      setOpen(false);
      setQuery("");
    },
    [onChange],
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
      triggerFocus: "focus:outline-none focus:ring-2 focus:ring-orange-500",
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
        ) : (
          <span className="flex-1 text-left text-gray-400">{placeholder}</span>
        )}
        {selectedItem && !disabled && (
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
              {buckets.get(activeGroupId)?.name ?? "Items"}
              <span className="font-normal text-gray-400 normal-case ml-1">
                ({filteredItems.length}
                {query.trim() ? ` of ${itemsInActiveGroup.length}` : ""})
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {visibleRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                {step === "groups"
                  ? items.length === 0
                    ? "Loading items…"
                    : "No matching groups"
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
                      active ? "bg-orange-50" : "hover:bg-orange-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`${ui.optionTitle} text-gray-900 truncate`}>{g.name}</div>
                      <div className="text-[10px] text-gray-500">{g.items.length} material{g.items.length === 1 ? "" : "s"}</div>
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
                    className={`w-full text-left ${ui.optionPad} flex items-center gap-2 ${active ? "bg-orange-50" : "hover:bg-orange-50"}`}
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
                    {isSelected ? <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" /> : null}
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
    if (!query.trim()) return itemsInActiveGroup;
    const q = query.toLowerCase();
    return itemsInActiveGroup.filter((it) => {
      const hay = `${it.name ?? ""} ${it.code ?? ""} ${it.groupName ?? ""} ${it.hsnCode ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [itemsInActiveGroup, query]);

  const visibleCount = step === "groups" ? filteredGroups.length : filteredItems.length;

  const labelOf = useCallback(
    (id: string) => {
      const it = items.find((i) => i.id === id);
      if (!it) return id;
      if (it.code) return `${it.code} — ${it.name ?? it.id}`;
      return it.name ?? it.id;
    },
    [items],
  );

  const toggleItem = useCallback(
    (id: string) => {
      if (values.includes(id)) onChange(values.filter((x) => x !== id));
      else onChange([...values, id]);
    },
    [values, onChange],
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

  const triggerDisabled = disabled || items.length === 0;

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
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200"
          >
            {labelOf(v)}
            {!disabled && (
              <button
                type="button"
                onClick={() => toggleItem(v)}
                className="hover:text-orange-900 leading-none"
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

      {open && !disabled && items.length > 0 && popoverPos && typeof document !== "undefined" && createPortal(
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
              {buckets.get(activeGroupId)?.name ?? "Items"}
              <span className="font-normal text-gray-400 normal-case ml-1">
                ({filteredItems.length}
                {query.trim() ? ` of ${itemsInActiveGroup.length}` : ""})
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1 max-h-56">
            {visibleCount === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                {step === "groups"
                  ? items.length === 0
                    ? "Loading items…"
                    : "No matching groups"
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
                      active ? "bg-orange-50" : "hover:bg-orange-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{g.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {g.items.length} material{g.items.length === 1 ? "" : "s"}
                      </div>
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
                      active ? "bg-orange-50" : "hover:bg-gray-100"
                    } ${selected ? "text-orange-800" : "text-gray-700"}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                        selected ? "bg-orange-600 border-orange-600 text-white" : "border-gray-300 bg-white"
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
