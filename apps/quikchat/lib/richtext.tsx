import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import type { Mention } from "@/lib/shared";
import { segmentContent } from "./mentions";

/**
 * Narrow chat markdown + URL autolinking that builds React nodes (never raw
 * HTML). Ported from the original RichMessageText/LinkifiedText, re-tokenised
 * to `--qc-*`. Composes with mentions: content is split on mention offsets via
 * `segmentContent`, then markdown+linkify runs on the non-mention text slices.
 */

// --- href sanitization (the XSS boundary): only http/https survive ---
function sanitizeHref(raw: string): string | null {
  const href = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? href : null;
  } catch {
    return null;
  }
}

// --- linkify bare URLs inside a plain-text slice ---
// Conservative: matches http(s)/www forms without swallowing trailing punctuation.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,!?;:)\]}])/gi;

function internalPath(href: string): string | null {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(href, origin);
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* treat as external */
  }
  return null;
}

function Linkified({ text }: { text: string }): ReactNode {
  const parts: Array<{ type: "text" | "url"; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "url", value: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <Fragment key={i}>{p.value}</Fragment>;
        const href = sanitizeHref(p.value);
        if (!href) return <Fragment key={i}>{p.value}</Fragment>;
        const internal = internalPath(href);
        if (internal) {
          return (
            <Link key={i} href={internal} className="qc-link">
              {p.value}
            </Link>
          );
        }
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="qc-link">
            {p.value}
          </a>
        );
      })}
    </>
  );
}

// --- inline markdown ---
type Inline =
  | { kind: "text"; value: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "underline"; children: Inline[] }
  | { kind: "strike"; children: Inline[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; label: string };

const INLINE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpExecArray) => Inline }> = [
  { re: /`([^`\n]+)`/, build: (m) => ({ kind: "code", value: m[1]! }) },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    build: (m) => ({ kind: "link", href: m[2]!, label: m[1]! }),
  },
  { re: /\*\*([^*\n]+)\*\*/, build: (m) => ({ kind: "bold", children: parseInline(m[1]!) }) },
  { re: /__([^_\n]+)__/, build: (m) => ({ kind: "underline", children: parseInline(m[1]!) }) },
  {
    re: /(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])/,
    build: (m) => ({ kind: "italic", children: parseInline(m[1]!) }),
  },
  { re: /~([^~\n]+)~/, build: (m) => ({ kind: "strike", children: parseInline(m[1]!) }) },
];

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    let earliest: { idx: number; node: Inline; len: number } | null = null;
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(rest);
      if (!m) continue;
      if (!earliest || m.index < earliest.idx) {
        earliest = { idx: m.index, node: p.build(m), len: m[0].length };
      }
    }
    if (!earliest) {
      out.push({ kind: "text", value: rest });
      break;
    }
    if (earliest.idx > 0) out.push({ kind: "text", value: rest.slice(0, earliest.idx) });
    out.push(earliest.node);
    rest = rest.slice(earliest.idx + earliest.len);
  }
  return out;
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.kind) {
      case "text":
        return <Linkified key={i} text={n.value} />;
      case "code":
        return (
          <code key={i} className="qc-code">
            {n.value}
          </code>
        );
      case "link": {
        const href = sanitizeHref(n.href);
        if (!href) return <Fragment key={i}>{n.label}</Fragment>;
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="qc-link">
            {n.label}
          </a>
        );
      }
      case "bold":
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case "italic":
        return <em key={i}>{renderInline(n.children)}</em>;
      case "underline":
        return <u key={i}>{renderInline(n.children)}</u>;
      case "strike":
        return <s key={i}>{renderInline(n.children)}</s>;
    }
  });
}

// --- block markdown ---
function renderBlocks(text: string): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let bullets: string[] | null = null;
  let numbered: string[] | null = null;

  const flushLists = () => {
    if (bullets) {
      out.push(
        <ul key={`u-${out.length}`} className="qc-md-list">
          {bullets.map((b, j) => (
            <li key={j}>{renderInline(parseInline(b))}</li>
          ))}
        </ul>,
      );
      bullets = null;
    }
    if (numbered) {
      out.push(
        <ol key={`o-${out.length}`} className="qc-md-list">
          {numbered.map((b, j) => (
            <li key={j}>{renderInline(parseInline(b))}</li>
          ))}
        </ol>,
      );
      numbered = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```\s*$/.test(line)) {
      flushLists();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      out.push(
        <pre key={`c-${out.length}`} className="qc-pre">
          {buf.join("\n")}
        </pre>,
      );
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      flushLists();
      out.push(
        <blockquote key={`q-${out.length}`} className="qc-md-quote">
          {renderInline(parseInline(line.slice(2)))}
        </blockquote>,
      );
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      bullets = bullets ?? [];
      bullets.push(line.slice(2));
      i++;
      continue;
    }
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      numbered = numbered ?? [];
      numbered.push(numMatch[2]!);
      i++;
      continue;
    }
    flushLists();
    if (line === "") {
      out.push(<br key={`br-${out.length}`} />);
    } else {
      out.push(
        <Fragment key={`p-${out.length}`}>
          {renderInline(parseInline(line))}
          {i < lines.length - 1 && "\n"}
        </Fragment>,
      );
    }
    i++;
  }
  flushLists();
  return out;
}

/** Render message content: mention pills + markdown + clickable links composed. */
export function RichText({ content, mentions }: { content: string; mentions?: Mention[] }) {
  const segments = segmentContent(content, mentions ?? []);
  return (
    <span className="qc-row__text">
      {segments.map((s, i) =>
        s.type === "mention" ? (
          <span key={i} className="qc-mention" data-userid={s.userId}>
            {s.value}
          </span>
        ) : (
          <Fragment key={i}>{renderBlocks(s.value)}</Fragment>
        ),
      )}
    </span>
  );
}
