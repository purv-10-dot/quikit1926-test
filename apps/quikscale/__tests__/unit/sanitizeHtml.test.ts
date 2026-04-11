import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/utils/sanitizeHtml";

describe("sanitizeHtml — fallback inputs", () => {
  it("returns empty string for undefined", () => {
    expect(sanitizeHtml(undefined)).toBe("");
  });
  it("returns empty string for null", () => {
    expect(sanitizeHtml(null)).toBe("");
  });
  it("returns empty string for non-string input", () => {
    expect(sanitizeHtml(42)).toBe("");
    expect(sanitizeHtml({})).toBe("");
    expect(sanitizeHtml([])).toBe("");
  });
  it("returns empty string for empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });
  it("passes plain text through untouched", () => {
    expect(sanitizeHtml("Hello, world!")).toBe("Hello, world!");
  });
});

describe("sanitizeHtml — allowed tags", () => {
  it("keeps paragraph tags", () => {
    expect(sanitizeHtml("<p>hi</p>")).toBe("<p>hi</p>");
  });
  it("keeps bold + italic + underline inline marks", () => {
    expect(sanitizeHtml("<strong>a</strong><em>b</em><u>c</u>")).toBe(
      "<strong>a</strong><em>b</em><u>c</u>",
    );
  });
  it("keeps headings h1-h6", () => {
    for (let i = 1; i <= 6; i++) {
      expect(sanitizeHtml(`<h${i}>t</h${i}>`)).toBe(`<h${i}>t</h${i}>`);
    }
  });
  it("keeps lists", () => {
    expect(sanitizeHtml("<ul><li>a</li><li>b</li></ul>")).toBe(
      "<ul><li>a</li><li>b</li></ul>",
    );
    expect(sanitizeHtml("<ol><li>1</li></ol>")).toBe("<ol><li>1</li></ol>");
  });
  it("keeps block div, br, blockquote, code", () => {
    expect(sanitizeHtml("<div>x</div><br><blockquote>q</blockquote><code>c</code>")).toBe(
      "<div>x</div><br><blockquote>q</blockquote><code>c</code>",
    );
  });
});

describe("sanitizeHtml — disallowed tags", () => {
  it("strips <script> completely (including inner)", () => {
    expect(sanitizeHtml("<p>a</p><script>alert(1)</script><p>b</p>")).toBe(
      "<p>a</p><p>b</p>",
    );
  });
  it("strips <iframe>", () => {
    expect(sanitizeHtml('<iframe src="evil.com"></iframe>text')).toBe("text");
  });
  it("strips <style>", () => {
    expect(sanitizeHtml("<style>body{display:none}</style>real")).toBe("real");
  });
  it("strips unknown tags but keeps inner text", () => {
    expect(sanitizeHtml("<marquee>scroll</marquee>")).toBe("scroll");
    expect(sanitizeHtml("<custom-elem>yo</custom-elem>")).toBe("yo");
  });
  it("strips <a> links (not in allowlist)", () => {
    expect(sanitizeHtml('<a href="https://evil.com">click</a>')).toBe("click");
  });
  it("strips <img>", () => {
    expect(sanitizeHtml('x<img src="y.png">z')).toBe("xz");
  });
});

describe("sanitizeHtml — attributes", () => {
  it("keeps class attribute on allowed tags", () => {
    expect(sanitizeHtml('<p class="lead">hi</p>')).toBe('<p class="lead">hi</p>');
  });
  it("strips onclick handlers", () => {
    expect(sanitizeHtml('<p onclick="alert(1)">x</p>')).toBe("<p>x</p>");
  });
  it("strips onerror handlers", () => {
    expect(sanitizeHtml('<div onerror="alert(1)" class="ok">x</div>')).toBe(
      '<div class="ok">x</div>',
    );
  });
  it("strips style attribute", () => {
    expect(sanitizeHtml('<p style="background:red">x</p>')).toBe("<p>x</p>");
  });
  it("strips id attribute", () => {
    expect(sanitizeHtml('<p id="foo" class="ok">x</p>')).toBe(
      '<p class="ok">x</p>',
    );
  });
  it("escapes double quotes inside class value", () => {
    expect(sanitizeHtml(`<p class='a"b'>x</p>`)).toBe('<p class="a&quot;b">x</p>');
  });
});

describe("sanitizeHtml — URL scheme blocking", () => {
  it("drops javascript: even though href is not in allowlist", () => {
    // link tag is stripped anyway, this documents double-layer defense
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("x");
  });
  it("drops class values containing javascript:", () => {
    expect(sanitizeHtml('<p class="javascript:alert(1)">x</p>')).toBe("<p>x</p>");
  });
});

describe("sanitizeHtml — real OPSP content examples", () => {
  it("preserves a typical coreValues entry", () => {
    const input = "<p><strong>Integrity</strong></p><p><strong>Courage</strong></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });
  it("preserves a typical bullet list", () => {
    const input = "<ul><li><em>quick replies</em></li><li>trusted partner</li></ul>";
    expect(sanitizeHtml(input)).toBe(input);
  });
  it("handles mixed block + inline formatting", () => {
    const input =
      '<p class="prose">Our <strong>goal</strong> is <em>clear</em>.</p>';
    expect(sanitizeHtml(input)).toBe(input);
  });
});

describe("sanitizeHtml — defensive edge cases", () => {
  it("handles malformed tags without crashing", () => {
    expect(() => sanitizeHtml("<<p>>hi<<</p>")).not.toThrow();
  });
  it("handles deeply nested allowed tags", () => {
    const nested = "<div><p><strong><em>deep</em></strong></p></div>";
    expect(sanitizeHtml(nested)).toBe(nested);
  });
  it("handles uppercase tags by lowercasing them", () => {
    expect(sanitizeHtml("<P>hi</P>")).toBe("<p>hi</p>");
    expect(sanitizeHtml("<SCRIPT>alert(1)</SCRIPT>x")).toBe("x");
  });
  it("handles tags with extra whitespace", () => {
    expect(sanitizeHtml("<p   class='x'  >hi</p >")).toBe('<p class="x">hi</p>');
  });
});
