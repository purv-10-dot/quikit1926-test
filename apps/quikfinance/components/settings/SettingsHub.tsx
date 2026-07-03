"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { SETTINGS_CATALOG } from "@/lib/settings-catalog";
import { cn } from "@/lib/utils/cn";

export function SettingsHub() {
  const [query, setQuery] = useState("");

  // GST Settings is India-only — surface it under Taxes & Compliance when available.
  const { data: gstAvailable } = useQuery({
    queryKey: ["gst-available"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/gst");
      return r.ok ? Boolean(((await r.json()) as { data?: { available?: boolean } }).data?.available) : false;
    }
  });

  const catalog = useMemo(() => {
    if (!gstAvailable) return SETTINGS_CATALOG;
    return SETTINGS_CATALOG.map((section) => ({
      ...section,
      categories: section.categories.map((cat) =>
        cat.title === "Taxes & Compliance"
          ? { ...cat, links: [...cat.links, { title: "GST Settings", href: "/settings/gst" }, { title: "Direct Taxes (TDS/TCS)", href: "/settings/direct-taxes" }] }
          : cat
      )
    }));
  }, [gstAvailable]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog
      .map((section) => ({
        ...section,
        categories: section.categories
          .map((cat) => ({ ...cat, links: cat.links.filter((l) => l.title.toLowerCase().includes(q) || cat.title.toLowerCase().includes(q)) }))
          .filter((cat) => cat.links.length > 0)
      }))
      .filter((section) => section.categories.length > 0);
  }, [catalog, query]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Hub header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold tracking-tight">All Settings</h1>
          <p className="text-[13px] text-muted-foreground">Configure your organization, modules, and automation.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            className="h-9 w-full rounded-lg border bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
        </div>
        <Link href="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
          Close Settings <X className="h-4 w-4" />
        </Link>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-card">No settings match “{query}”.</p>
      ) : (
        sections.map((section) => (
          <section key={section.title} className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="mb-4 text-sm font-semibold tracking-tight text-foreground">{section.title}</h2>
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {section.categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <div key={cat.title} className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
                      <h3 className="truncate text-[13px] font-semibold">{cat.title}</h3>
                    </div>
                    <ul className="space-y-1.5 border-l pl-3">
                      {cat.links.map((link) => (
                        <li key={link.href}>
                          <Link href={link.href} className="group flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-primary">
                            <span className="truncate">{link.title}</span>
                            {link.badge ? <span className="rounded bg-rose-500 px-1 py-px text-[9px] font-bold uppercase text-white">{link.badge}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
