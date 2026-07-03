"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, CornerDownLeft, Plus, ArrowRight, Clock, FileText, Users, Building2, Receipt, ClipboardList, Repeat2, CircleDollarSign, WalletCards, Package } from "lucide-react";
import { allDestinations, QUICK_CREATE } from "@/lib/nav";
import { recordRecent, useNavPrefs } from "@/lib/hooks/use-nav-prefs";
import { cn } from "@/lib/utils/cn";

type Cmd = { id: string; label: string; href: string; section: string; hint?: string; icon?: React.ComponentType<{ className?: string }> };

export const OPEN_COMMAND_EVENT = "qf:command-open";

/** Icon per search result type. */
const ICON_BY_TYPE: Record<string, React.ComponentType<{ className?: string }>> = {
  Invoices: FileText, Customers: Users, Vendors: Building2, Bills: Receipt, Quotes: FileText,
  "Sales Orders": ClipboardList, "Purchase Orders": ClipboardList, "Credit Notes": Repeat2,
  "Vendor Credits": Repeat2, Payments: CircleDollarSign, Expenses: WalletCards, Items: Package
};

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { recents } = useNavPrefs();
  const [entityCmds, setEntityCmds] = useState<Cmd[]>([]);
  const [searching, setSearching] = useState(false);

  // Record the active route as recent.
  useEffect(() => { recordRecent(pathname); }, [pathname]);

  // Ctrl/Cmd+K and the topbar-search event open the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_COMMAND_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQuery(""); setActive(0); setEntityCmds([]); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  // Live record search (invoices, contacts, bills, quotes, POs) — debounced.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setEntityCmds([]); setSearching(false); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = r.ok ? ((await r.json()) as { data?: { results?: Array<{ type: string; id: string; label: string; sublabel: string; href: string }> } }) : null;
        const results = data?.data?.results ?? [];
        setEntityCmds(results.map((x) => ({ id: `e:${x.type}:${x.id}`, label: x.label, href: x.href, section: x.type, hint: x.sublabel, icon: ICON_BY_TYPE[x.type] })));
      } catch { /* aborted */ } finally { setSearching(false); }
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  const commands = useMemo<Cmd[]>(() => {
    const dests = allDestinations();
    const recentCmds: Cmd[] = recents
      .map((href) => dests.find((d) => d.href === href))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({ id: `recent:${d.href}`, label: d.title, href: d.href, section: "Recent", hint: d.group, icon: Clock }));
    const createCmds: Cmd[] = QUICK_CREATE.map((q) => ({ id: `create:${q.href}`, label: q.label, href: q.href, section: "Create", icon: Plus }));
    const goCmds: Cmd[] = dests.map((d) => ({ id: `go:${d.href}`, label: d.title, href: d.href, section: "Go to", hint: d.group, icon: d.icon }));
    return [...recentCmds, ...createCmds, ...goCmds];
  }, [recents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 40);
    const scored = commands.filter((c) => c.label.toLowerCase().includes(q) || (c.hint ?? "").toLowerCase().includes(q));
    // Live records first, then navigation/create matches.
    return [...entityCmds, ...scored].slice(0, 50);
  }, [commands, query, entityCmds]);

  // Group while preserving order.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Cmd[]>();
    for (const c of filtered) {
      if (!map.has(c.section)) { map.set(c.section, []); order.push(c.section); }
      map.get(c.section)!.push(c);
    }
    return order.map((s) => ({ section: s, items: map.get(s)! }));
  }, [filtered]);

  const flat = filtered;
  useEffect(() => { setActive(0); }, [query]);

  const run = useCallback((cmd?: Cmd) => {
    const target = cmd ?? flat[active];
    if (!target) return;
    setOpen(false);
    router.push(target.href);
  }, [flat, active, router]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(); }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let index = -1;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…  (create, go to, recent)"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{searching ? "Searching…" : `No results for “${query}”.`}</p>
          ) : (
            groups.map((g) => (
              <div key={g.section} className="mb-1">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.section}</p>
                {g.items.map((cmd) => {
                  index += 1;
                  const i = index;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-active={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(cmd)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                        i === active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                      )}
                    >
                      {Icon ? <Icon className={cn("h-4 w-4 shrink-0", i === active ? "text-primary-foreground" : "text-muted-foreground")} /> : null}
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint ? <span className={cn("truncate text-xs", i === active ? "text-primary-foreground/80" : "text-muted-foreground")}>{cmd.hint}</span> : null}
                      {i === active ? (cmd.section === "Create" ? <Plus className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> to select</span>
          <span>↑↓ to navigate</span>
          <span className="ml-auto flex items-center gap-1"><kbd className="rounded border bg-muted px-1">Ctrl</kbd><kbd className="rounded border bg-muted px-1">K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
}
