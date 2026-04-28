/**
 * IC Memo data shape — stored as JSON in VCICMemoVersion.sections.
 *
 * Keeping memo content as a JSON-versioned snapshot (not separate rows per
 * section) means: cheap full-version reads, atomic edits, easy diffing
 * between versions.
 */

export interface MemoSection {
  /** Stable id for keyed rendering. */
  id: string;
  /** Stable slug — matches MemoSectionSlug from lib/ai/prompts/generate-memo-section.ts */
  slug: string;
  /** Display title (analyst can rename). */
  title: string;
  /** Rich-text HTML content (already sanitized by Claude prompt or analyst input). */
  contentHtml: string;
  /** "claude" | "analyst" — what produced the current text. */
  generatedBy: "claude" | "analyst";
  /** ISO timestamp of the last text change. */
  generatedAt: string;
}

export interface MemoSectionsPayload {
  sections: MemoSection[];
}
