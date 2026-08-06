/**
 * Knowledge Base content model.
 *
 * One small block vocabulary shared by BOTH renderers:
 *   • the web reader  — app/(dashboard)/help/components/KBBlocks.tsx
 *   • the PDF export  — app/(dashboard)/help/components/KBPdfDoc.tsx
 *
 * Keep the vocabulary deliberately small. Every block type added here has to
 * be implemented twice (HTML + react-pdf), so prefer composing existing blocks
 * over inventing new ones.
 */

export type KBTone = "info" | "tip" | "warn" | "rule";

export type KBBlock =
  /** Body paragraph. */
  | { type: "p"; text: string }
  /** Sub-heading inside a section. */
  | { type: "h3"; text: string }
  /** Unordered (default) or numbered list. */
  | { type: "bullets"; items: string[]; ordered?: boolean }
  /** Numbered walkthrough — the "step by step" backbone of every module chapter. */
  | { type: "steps"; items: { title: string; text: string }[] }
  /** Field / column reference table. `widths` are relative flex weights. */
  | { type: "table"; caption?: string; head: string[]; rows: string[][]; widths?: number[] }
  /** Highlighted aside. `rule` renders as a hard "must do" band. */
  | { type: "callout"; tone: KBTone; title: string; text: string }
  /**
   * Screenshot slot. Renders `/kb/screens/<file>` when the PNG exists, and a
   * labelled wireframe placeholder describing `hint` when it does not.
   */
  | { type: "figure"; file: string; caption: string; hint: string }
  /** Question/answer pairs. */
  | { type: "faq"; items: { q: string; a: string }[] }
  /** Compact key → value definition list. */
  | { type: "kv"; items: { k: string; v: string }[] };

export interface KBSection {
  /** Anchor id — unique across the whole book. */
  id: string;
  title: string;
  blocks: KBBlock[];
}

export interface KBChapter {
  /** Anchor id — unique, used for `/help#<id>` deep links. */
  id: string;
  title: string;
  /** Scaling Up pillar this chapter belongs to, if any. */
  pillar?: "Foundations" | "Execution" | "Strategy" | "People" | "Cash" | "Platform";
  /** One-line description shown under the chapter title and in the TOC. */
  summary: string;
  /** In-app route the chapter documents (rendered as a "Open module" link). */
  route?: string;
  sections: KBSection[];
}

/** Every figure referenced anywhere in the book — powers the capture checklist. */
export function collectFigures(chapters: KBChapter[]): { file: string; caption: string; hint: string; chapter: string }[] {
  const out: { file: string; caption: string; hint: string; chapter: string }[] = [];
  for (const ch of chapters) {
    for (const sec of ch.sections) {
      for (const b of sec.blocks) {
        if (b.type === "figure") out.push({ file: b.file, caption: b.caption, hint: b.hint, chapter: ch.title });
      }
    }
  }
  return out;
}

/** Flatten a chapter to plain text — used by the reader's search box. */
export function chapterText(ch: KBChapter): string {
  const parts: string[] = [ch.title, ch.summary];
  for (const sec of ch.sections) {
    parts.push(sec.title);
    for (const b of sec.blocks) {
      switch (b.type) {
        case "p":
        case "h3":
          parts.push(b.text); break;
        case "bullets":
          parts.push(...b.items); break;
        case "steps":
          for (const s of b.items) parts.push(s.title, s.text); break;
        case "table":
          parts.push(...b.head, ...b.rows.flat(), b.caption ?? ""); break;
        case "callout":
          parts.push(b.title, b.text); break;
        case "figure":
          parts.push(b.caption, b.hint); break;
        case "faq":
          for (const f of b.items) parts.push(f.q, f.a); break;
        case "kv":
          for (const kv of b.items) parts.push(kv.k, kv.v); break;
      }
    }
  }
  return parts.join(" ").toLowerCase();
}
