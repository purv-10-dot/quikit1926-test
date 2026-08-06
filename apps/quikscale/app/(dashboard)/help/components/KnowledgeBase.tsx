"use client";

/**
 * Knowledge Base reader.
 *
 * Sticky contents rail on the left (grouped exactly like the sidebar), one
 * chapter rendered at a time on the right. Rendering a single chapter — rather
 * than the whole book in one scroll — keeps a ~100-page manual responsive and
 * makes the browser's in-page find useful again.
 *
 * The URL hash is the chapter id, so /help#kpi-individual is a shareable deep
 * link and the browser back button steps through chapters.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import { KB_CHAPTERS, KB_GROUPS, KB_META, chapterText } from "@/lib/knowledge-base";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";
import { KBBlocks } from "./KBBlocks";
import { KBDownloadButton } from "./KBDownloadButton";

const FIRST_ID = KB_CHAPTERS[0]!.id;

export function KnowledgeBase() {
  const { org } = useOrgInfo();
  const router = useRouter();
  const [activeId, setActiveId] = useState<string>(FIRST_ID);
  const [query, setQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  // Skip the scroll-to-top on the very first paint so a deep link lands where
  // the browser already put it.
  const firstPaint = useRef(true);

  /* Hash ⇄ state. */
  useEffect(() => {
    const apply = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id && KB_CHAPTERS.some((c) => c.id === id)) setActiveId(id);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    if (firstPaint.current) { firstPaint.current = false; return; }
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeId]);

  // The Knowledge Base is opened from the header "?" icon on any screen, not
  // from a fixed sidebar entry, so there's no single "parent" page to link
  // back to — fall back to the dashboard only when there's no in-app history
  // to pop (e.g. a bookmarked/shared /help link opened in a fresh tab).
  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  }, [router]);

  const select = useCallback((id: string) => {
    setActiveId(id);
    // replaceState rather than assigning location.hash so we don't fight the
    // hashchange listener above with a duplicate state update.
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  const index = useMemo(
    () => KB_CHAPTERS.map((c) => ({ id: c.id, text: chapterText(c) })),
    [],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(index.filter((e) => e.text.includes(q)).map((e) => e.id));
  }, [query, index]);

  const active = KB_CHAPTERS.find((c) => c.id === activeId) ?? KB_CHAPTERS[0]!;
  const activeIdx = KB_CHAPTERS.indexOf(active);
  const prev = activeIdx > 0 ? KB_CHAPTERS[activeIdx - 1] : null;
  const next = activeIdx < KB_CHAPTERS.length - 1 ? KB_CHAPTERS[activeIdx + 1] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 px-6 py-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-accent-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-600">
            Reference
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <BookOpen className="h-5 w-5 text-accent-600" />
            {KB_META.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{KB_META.subtitle}</p>
        </div>
        <KBDownloadButton orgName={org?.name ?? ""} />
      </div>

      {/* Three-column docs layout: contents · chapter · on-this-page.
          The chapter column is `flex-1` (never a centred fixed max-width), so
          the reader fills the window instead of leaving dead margins either
          side of a narrow measure. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Contents rail */}
        <nav className="flex-shrink-0 border-b border-gray-200 lg:h-full lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r xl:w-72">
          <div className="sticky top-0 z-10 bg-white p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the guide…"
                aria-label="Search the knowledge base"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm text-gray-800 placeholder:text-gray-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {matches && (
              <p className="mt-2 text-xs text-gray-500">
                {matches.size} chapter{matches.size === 1 ? "" : "s"} match
              </p>
            )}
          </div>

          <div className="px-3 pb-8">
            {KB_GROUPS.map((group) => {
              const items = group.chapterIds
                .map((id) => KB_CHAPTERS.find((c) => c.id === id))
                .filter((c): c is (typeof KB_CHAPTERS)[number] => !!c)
                .filter((c) => !matches || matches.has(c.id));
              if (items.length === 0) return null;
              return (
                <div key={group.label} className="mb-4">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {group.label}
                  </p>
                  {items.map((c) => {
                    const isActive = c.id === active.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => select(c.id)}
                        className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-accent-50 font-medium text-accent-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {c.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {matches && matches.size === 0 && (
              <p className="px-3 py-6 text-sm text-gray-400">
                Nothing matches “{query}”.
              </p>
            )}
          </div>
        </nav>

        {/* Chapter */}
        <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto">
          <article className="max-w-[1100px] px-6 py-8 lg:px-10 2xl:max-w-none 2xl:pr-16">
            <header className="border-b border-gray-200 pb-6">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-600">
                {String(activeIdx + 1).padStart(2, "0")}
                {active.pillar ? ` · ${active.pillar}` : ""}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                {active.title}
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-gray-500">{active.summary}</p>
              {active.route && (
                <Link
                  href={active.route}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-700 hover:underline"
                >
                  Open this module
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </header>

            {/* Compact jump list for narrow screens. Wide screens get the
                sticky "On this page" rail on the right instead. */}
            {active.sections.length > 2 && (
              <nav className="mt-6 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 xl:hidden">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  In this chapter
                </p>
                <ul className="mt-2 space-y-1">
                  {active.sections.map((sec) => (
                    <li key={sec.id}>
                      <a
                        href={`#${sec.id}`}
                        className="text-sm text-gray-600 hover:text-accent-700 hover:underline"
                      >
                        {sec.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {active.sections.map((sec) => (
              <section key={sec.id} id={sec.id} className="scroll-mt-6 pt-8">
                <h3 className="mb-1 border-b border-gray-100 pb-2 text-lg font-semibold text-gray-900">
                  {sec.title}
                </h3>
                <KBBlocks blocks={sec.blocks} />
              </section>
            ))}

            {/* Chapter pager */}
            <div className="mt-12 flex items-stretch justify-between gap-4 border-t border-gray-200 pt-6">
              {prev ? (
                <button
                  type="button"
                  onClick={() => select(prev.id)}
                  className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-accent-200 hover:bg-accent-50/40"
                >
                  <ChevronLeft className="h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-accent-600" />
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-widest text-gray-400">
                      Previous
                    </span>
                    <span className="block truncate text-sm font-medium text-gray-800">
                      {prev.title}
                    </span>
                  </span>
                </button>
              ) : (
                <span className="flex-1" />
              )}
              {next ? (
                <button
                  type="button"
                  onClick={() => select(next.id)}
                  className="group flex min-w-0 flex-1 items-center justify-end gap-2 rounded-lg border border-gray-200 px-4 py-3 text-right transition-colors hover:border-accent-200 hover:bg-accent-50/40"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-widest text-gray-400">
                      Next
                    </span>
                    <span className="block truncate text-sm font-medium text-gray-800">
                      {next.title}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-accent-600" />
                </button>
              ) : (
                <span className="flex-1" />
              )}
            </div>
          </article>
        </div>

        {/* On-this-page rail — fills the right-hand space on wide screens. */}
        <aside className="hidden flex-shrink-0 border-l border-gray-200 xl:block xl:w-60 xl:overflow-y-auto">
          <div className="px-5 py-8">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              On this page
            </p>
            <ul className="mt-3 space-y-2 border-l border-gray-200">
              {active.sections.map((sec) => (
                <li key={sec.id}>
                  <a
                    href={`#${sec.id}`}
                    className="-ml-px block border-l border-transparent pl-3 text-sm leading-snug text-gray-500 transition-colors hover:border-accent-400 hover:text-accent-700"
                  >
                    {sec.title}
                  </a>
                </li>
              ))}
            </ul>
            {active.route && (
              <Link
                href={active.route}
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:underline"
              >
                Open this module
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
