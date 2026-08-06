/**
 * QuikScale Knowledge Base — assembled book.
 *
 * Chapter order here IS the order in the reader's contents list and in the
 * generated PDF. Keep it narrative: foundations, then pillar by pillar in the
 * order the sidebar presents them, then platform and reference material.
 */

import type { KBChapter } from "./types";
import { foundationChapters } from "./content/01-foundations";
import { executionChapters } from "./content/02-execution";
import { strategyChapters } from "./content/03-strategy";
import { peopleChapters } from "./content/04-people";
import { platformChapters } from "./content/05-platform";
import { referenceChapters } from "./content/06-reference";
import { appendixChapters } from "./content/07-appendices";

export * from "./types";

/** Book metadata — rendered on the PDF cover and the reader's masthead. */
export const KB_META = {
  title: "QuikScale Knowledge Base",
  subtitle: "The complete guide to running your Performance OS",
  edition: "Edition 1",
};

/**
 * Contents groups. Each group's `chapters` are ids resolved against KB_CHAPTERS,
 * so a chapter can never appear in the reader without existing in the book.
 */
export const KB_GROUPS: { label: string; chapterIds: string[] }[] = [
  { label: "Start here", chapterIds: ["getting-started", "concepts", "navigating", "grid-basics", "fiscal-calendar", "routines"] },
  { label: "Execution", chapterIds: ["dashboard", "kpi-individual", "kpi-teams", "priority", "www", "meeting-rhythm", "analytics"] },
  { label: "Strategy", chapterIds: ["opsp", "habits", "swt"] },
  { label: "People", chapterIds: ["people-cycle", "face-pace", "survey"] },
  { label: "Cash", chapterIds: ["cash"] },
  { label: "Administration", chapterIds: ["org-setup", "settings", "permissions", "exports"] },
  { label: "Reference", chapterIds: ["troubleshooting", "glossary", "appendix-routes", "appendix-permissions", "appendix-fields"] },
];

const ALL: KBChapter[] = [
  ...foundationChapters,
  ...executionChapters,
  ...strategyChapters,
  ...peopleChapters,
  ...platformChapters,
  ...referenceChapters,
  ...appendixChapters,
];

/** Chapters in reading order — driven by KB_GROUPS, with any stragglers appended. */
export const KB_CHAPTERS: KBChapter[] = (() => {
  const byId = new Map(ALL.map((c) => [c.id, c]));
  const ordered: KBChapter[] = [];
  const seen = new Set<string>();
  for (const g of KB_GROUPS) {
    for (const id of g.chapterIds) {
      const ch = byId.get(id);
      if (ch && !seen.has(id)) { ordered.push(ch); seen.add(id); }
    }
  }
  // Anything authored but not placed in a group still ships, at the end.
  for (const c of ALL) if (!seen.has(c.id)) ordered.push(c);
  return ordered;
})();

export function getChapter(id: string): KBChapter | undefined {
  return KB_CHAPTERS.find((c) => c.id === id);
}
