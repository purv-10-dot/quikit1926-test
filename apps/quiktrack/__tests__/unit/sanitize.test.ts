import { describe, it, expect } from "vitest";
import { sanitizeRichText } from "@/lib/sanitize";

// SEC-01 regression: user-authored rich text rendered via dangerouslySetInnerHTML
// must not be able to execute script. Payloads are neutralized; safe formatting
// is preserved.

describe("sanitizeRichText (SEC-01)", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeRichText('hello<script>alert("xss")</script> world');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("hello");
    expect(out).toContain("world");
  });

  it("removes onerror from <img> (the classic stored-XSS payload)", () => {
    const out = sanitizeRichText('<img src=x onerror="alert(document.cookie)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
  });

  it("removes onload from <svg> and drops the disallowed tag", () => {
    const out = sanitizeRichText('<svg onload="alert(1)"></svg>');
    expect(out).not.toContain("onload");
    expect(out).not.toContain("<svg");
  });

  it("neutralizes javascript: URLs on links", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });

  it("strips inline event handlers on otherwise-allowed tags", () => {
    const out = sanitizeRichText('<p onclick="steal()">text</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("<p");
    expect(out).toContain("text");
  });

  it("preserves safe formatting (bold, links) and adds safe rel", () => {
    const out = sanitizeRichText(
      '<strong>bold</strong> <a href="https://example.com">link</a>',
    );
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("noopener");
  });

  it("normalizes <b>/<i> to <strong>/<em>", () => {
    const out = sanitizeRichText("<b>x</b><i>y</i>");
    expect(out).toContain("<strong>x</strong>");
    expect(out).toContain("<em>y</em>");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(sanitizeRichText(null)).toBe("");
    expect(sanitizeRichText(undefined)).toBe("");
    expect(sanitizeRichText("")).toBe("");
  });
});
