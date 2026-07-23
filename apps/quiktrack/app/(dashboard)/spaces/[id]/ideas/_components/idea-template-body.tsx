"use client";

import { sanitizeRichText } from "@/lib/sanitize";

/**
 * Renders idea rich-text (template previews AND the saved description read view)
 * with ONE explicit style block so preview / edit / read all look identical.
 * We can't rely on Tailwind's `prose` plugin being configured, so the spacing,
 * headings, blockquote (info callout) and list styles are declared inline via a
 * scoped class. Content is always sanitized before injection.
 */
export function TemplateBody({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`qt-idea-rt text-sm leading-relaxed text-gray-800 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
}

const RT_CSS = `
.qt-idea-rt > *:first-child { margin-top: 0; }
.qt-idea-rt > *:last-child { margin-bottom: 0; }
.qt-idea-rt h1, .qt-idea-rt h2, .qt-idea-rt h3 {
  font-weight: 600; color: #172b4d; line-height: 1.3;
  margin-top: 20px; margin-bottom: 8px;
}
.qt-idea-rt h1 { font-size: 1.35rem; }
.qt-idea-rt h2 { font-size: 1.15rem; }
.qt-idea-rt h3 { font-size: 1rem; }
.qt-idea-rt p { margin: 6px 0; }
.qt-idea-rt em { color: #6b778c; font-style: italic; }
.qt-idea-rt strong { font-weight: 600; color: #172b4d; }
.qt-idea-rt ul, .qt-idea-rt ol { margin: 8px 0; padding-left: 22px; }
.qt-idea-rt ul { list-style: disc; }
.qt-idea-rt ol { list-style: decimal; }
.qt-idea-rt li { margin: 3px 0; }
.qt-idea-rt blockquote {
  margin: 8px 0 16px; padding: 12px 14px; border: 0; border-radius: 6px;
  background: #eef2ff; color: #3b4b8c; font-style: normal;
}
.qt-idea-rt a { color: #2563eb; text-decoration: underline; }
`;

/** Scoped rich-text styles. Rendered once inside the idea panel. */
export function TemplateBodyStyles() {
  return <style dangerouslySetInnerHTML={{ __html: RT_CSS }} />;
}
