import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "@/lib/services/email/sanitize-html";

describe("sanitizeEmailHtml", () => {
  it("returns empty string for nullish input", () => {
    expect(sanitizeEmailHtml(null)).toBe("");
    expect(sanitizeEmailHtml(undefined)).toBe("");
    expect(sanitizeEmailHtml("")).toBe("");
  });

  it("keeps benign formatting markup", () => {
    const html = "<p>Hello <strong>world</strong> <a href=\"https://x.com\">link</a></p>";
    const out = sanitizeEmailHtml(html);
    expect(out).toContain("<strong>world</strong>");
    expect(out).toContain('href="https://x.com"');
  });

  it("strips <script> and its content", () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>hi</p>");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out).not.toContain("alert(1)");
  });

  it("neutralizes javascript: URIs", () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("strips iframes, objects, and style blocks", () => {
    const out = sanitizeEmailHtml(
      '<style>body{}</style><iframe src="evil"></iframe><object data="x"></object><p>ok</p>',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).not.toContain("<style");
    expect(out).toContain("<p>ok</p>");
  });

  it("strips form controls", () => {
    const out = sanitizeEmailHtml('<form><input name="x"><button>go</button></form>');
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
    expect(out).not.toContain("<button");
  });
});
