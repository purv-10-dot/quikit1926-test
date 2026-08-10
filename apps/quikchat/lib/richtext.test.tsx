import type { Mention } from "@/lib/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { flattenMarkdown, RichText } from "./richtext";

describe("flattenMarkdown (preview/quote plain text)", () => {
  it("unwraps inline emphasis, code, strike, and link label", () => {
    expect(flattenMarkdown("**Hello** *world* `code`")).toBe("Hello world code");
    expect(flattenMarkdown("__under__ ~strike~")).toBe("under strike");
    expect(flattenMarkdown("see [the docs](https://x.io) now")).toBe("see the docs now");
  });

  it("is faithful to the real grammar: __x__ → x (underline), lone _ stays literal", () => {
    expect(flattenMarkdown("__x__")).toBe("x");
    expect(flattenMarkdown("snake_case_name")).toBe("snake_case_name");
  });

  it("collapses block syntax to one readable line", () => {
    expect(flattenMarkdown("> quoted **bit**")).toBe("quoted bit");
    expect(flattenMarkdown("- one\n- two")).toBe("one two");
    expect(flattenMarkdown("1. first\n2. second")).toBe("first second");
    expect(flattenMarkdown("```\nconst x = 1;\n```")).toBe("const x = 1;");
  });

  it("empty / plain / whitespace", () => {
    expect(flattenMarkdown("")).toBe("");
    expect(flattenMarkdown("just plain text")).toBe("just plain text");
    expect(flattenMarkdown("multi\nline\ntext")).toBe("multi line text");
  });
});

function html(content: string, mentions: Mention[] = []): HTMLElement {
  const { container } = render(<RichText content={content} mentions={mentions} />);
  return container;
}

describe("RichText markdown", () => {
  it("renders inline bold/italic/underline/strike/code", () => {
    const c = html("**b** *i* __u__ ~s~ `code`");
    expect(c.querySelector("strong")?.textContent).toBe("b");
    expect(c.querySelector("em")?.textContent).toBe("i");
    expect(c.querySelector("u")?.textContent).toBe("u");
    expect(c.querySelector("s")?.textContent).toBe("s");
    expect(c.querySelector("code.qc-code")?.textContent).toBe("code");
  });

  it("renders fenced code, blockquote, bullet + numbered lists", () => {
    expect(html("```\nx = 1\n```").querySelector("pre.qc-pre")?.textContent).toBe("x = 1");
    expect(html("> quote").querySelector("blockquote.qc-md-quote")?.textContent).toBe("quote");
    expect(html("- one\n- two").querySelectorAll("ul.qc-md-list li").length).toBe(2);
    expect(html("1. a\n2. b").querySelectorAll("ol.qc-md-list li").length).toBe(2);
  });

  it("renders a [label](url) markdown link", () => {
    const a = html("see [docs](https://example.com)").querySelector("a.qc-link");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.textContent).toBe("docs");
  });
});

describe("RichText linkify", () => {
  it("autolinks a bare URL without swallowing trailing punctuation", () => {
    const c = html("go to https://example.com. now");
    const a = c.querySelector("a.qc-link");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    // trailing "." stays as text
    expect(c.textContent).toContain("https://example.com. now");
  });

  it("external links get target=_blank rel=noopener", () => {
    const a = html("https://example.com").querySelector("a.qc-link");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("RichText security", () => {
  it("does not produce a javascript: link (sanitized / left as text)", () => {
    const c = html("[x](javascript:alert(1))");
    expect(c.querySelector("a")).toBeNull();
    expect(c.textContent).toContain("javascript:alert(1)");
  });
});

describe("RichText composition with mentions", () => {
  it("composes a mention pill + bold + link in one message", () => {
    const mentions: Mention[] = [
      { userId: "u-bob", displayName: "Bob", offsetStart: 0, offsetEnd: 4 },
    ];
    const c = html("@Bob **hi** https://example.com", mentions);
    expect(c.querySelector(".qc-mention")?.textContent).toBe("@Bob");
    expect(c.querySelector("strong")?.textContent).toBe("hi");
    expect(c.querySelector("a.qc-link")?.getAttribute("href")).toBe("https://example.com");
  });
});
