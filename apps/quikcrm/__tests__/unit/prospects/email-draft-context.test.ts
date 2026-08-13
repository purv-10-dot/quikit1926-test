/**
 * Prospect email-draft context + template fallback.
 *
 * The context builder is the boundary between raw scraped LinkedIn blobs and
 * the AI runtime, so these pin the two properties that matter there:
 *
 *   1. BOUNDED. Every list is capped and every string truncated, so one chatty
 *      profile cannot blow the model's context window or the org's AI budget.
 *   2. FAITHFUL. The DM thread is ordered by `messageOrder` (the authoritative
 *      chronological key per the schema) and the TAIL is kept, because a
 *      follow-up email cares about the latest exchange, not the opener.
 */
import { describe, expect, it } from "vitest";
import {
  buildDraftContext,
  firstNameOf,
  summarizeContext,
} from "@/lib/services/prospects/email-draft/context";
import { preview } from "@/lib/services/prospects/email-draft/log";
import { buildTemplateDraft } from "@/lib/services/prospects/email-draft/template";
import { toBodyHtml } from "@/lib/services/prospects/email-draft/draft";

function baseProspect(over: Record<string, unknown> = {}) {
  return {
    name: "Maria Shaikh",
    email: "maria@practo.com",
    title: "Head of Growth",
    company: "Practo",
    linkedinUrl: "https://linkedin.com/in/maria",
    shortSummary: null,
    about: null,
    companyIndustry: "Health Tech",
    companyWebsite: "https://practo.com",
    companyHeadquarters: "Bengaluru",
    companySize: "1001-5000 employees",
    companyEmployeeCount: 2400,
    posts: null,
    companyData: null,
    experiences: null,
    linkedinConversation: null,
    icp: null,
    ...over,
  } as Parameters<typeof buildDraftContext>[0];
}

const sender = {
  name: "Rep One",
  email: "rep@acme.co",
  companyName: "Acme",
  companyWebsite: "https://acme.co",
};

describe("firstNameOf", () => {
  it("takes the first token", () => {
    expect(firstNameOf("Maria Shaikh")).toBe("Maria");
  });

  it("falls back to the whole name when there is only one token", () => {
    expect(firstNameOf("Madonna")).toBe("Madonna");
  });
});

describe("buildDraftContext", () => {
  it("carries the promoted profile and company columns", () => {
    const ctx = buildDraftContext(baseProspect(), sender);

    expect(ctx.prospect.firstName).toBe("Maria");
    expect(ctx.prospect.title).toBe("Head of Growth");
    expect(ctx.company.industry).toBe("Health Tech");
    expect(ctx.company.employeeCount).toBe(2400);
    expect(ctx.sender.companyName).toBe("Acme");
  });

  it("prefers the promoted column over the scraped blob", () => {
    // The promoted columns are what the rest of the app filters on, so a draft
    // must not contradict them.
    const ctx = buildDraftContext(
      baseProspect({
        companyIndustry: "Health Tech",
        companyData: { industry: "Stale Industry", name: "Practo" },
      }),
      sender,
    );
    expect(ctx.company.industry).toBe("Health Tech");
  });

  it("truncates a runaway About section", () => {
    const ctx = buildDraftContext(baseProspect({ about: "x".repeat(5_000) }), sender);
    expect(ctx.prospect.about!.length).toBeLessThanOrEqual(1_201);
    expect(ctx.prospect.about!.endsWith("…")).toBe(true);
  });

  it("collapses scraped whitespace runs", () => {
    const ctx = buildDraftContext(baseProspect({ shortSummary: "a\n\n\n   b" }), sender);
    expect(ctx.prospect.shortSummary).toBe("a b");
  });

  it("caps recent posts at five", () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({
      text: `post ${i}`,
      reactions: i,
      comments: 0,
    }));
    const ctx = buildDraftContext(baseProspect({ posts }), sender);
    expect(ctx.recentPosts).toHaveLength(5);
  });

  it("keeps the TAIL of the conversation, ordered by messageOrder", () => {
    // Deliberately out of array order — messageOrder is authoritative.
    const messages = Array.from({ length: 30 }, (_, i) => ({
      messageId: `m${i}`,
      senderName: i % 2 ? "Maria Shaikh" : "Rep One",
      text: `message ${i}`,
      direction: i % 2 ? "received" : "sent",
      messageOrder: i,
    })).reverse();

    const ctx = buildDraftContext(
      baseProspect({ linkedinConversation: { messages, participantName: "Maria Shaikh" } }),
      sender,
    );

    expect(ctx.conversation).toHaveLength(12);
    // Newest 12 (18..29), in reading order.
    expect(ctx.conversation[0]!.text).toBe("message 18");
    expect(ctx.conversation.at(-1)!.text).toBe("message 29");
  });

  it("produces an empty conversation when nothing was captured", () => {
    const ctx = buildDraftContext(baseProspect({ linkedinConversation: null }), sender);
    expect(ctx.conversation).toEqual([]);
  });
});

describe("summarizeContext", () => {
  it("reports counts, never the customer text itself", () => {
    const ctx = buildDraftContext(
      baseProspect({
        about: "secret about text",
        posts: [{ text: "a confidential post", reactions: 1, comments: 0 }],
        linkedinConversation: {
          messages: [{ messageId: "m1", senderName: "Maria", text: "private DM", messageOrder: 1 }],
        },
      }),
      sender,
    );
    const summary = summarizeContext(ctx);
    const serialized = JSON.stringify(summary);

    expect(summary.posts).toBe(1);
    expect(summary.messages).toBe(1);
    expect(summary.aboutChars).toBe("secret about text".length);
    // The log line must never echo the org's customer data.
    expect(serialized).not.toContain("secret about text");
    expect(serialized).not.toContain("confidential");
    expect(serialized).not.toContain("private DM");
  });

  it("shows an empty context as zeros so a thin record is diagnosable", () => {
    const summary = summarizeContext(buildDraftContext(baseProspect(), sender));
    expect(summary.posts).toBe(0);
    expect(summary.messages).toBe(0);
    expect(summary.aboutChars).toBe(0);
    expect(summary.icp).toBe("—");
  });
});

describe("preview", () => {
  it("flattens <br/> into a single line", () => {
    expect(preview("one<br/><br/>two")).toBe("one ⏎ ⏎ two");
  });

  it("truncates long bodies", () => {
    expect(preview("x".repeat(500)).length).toBeLessThanOrEqual(161);
  });
});

describe("buildTemplateDraft", () => {
  it("opens as a follow-up when a LinkedIn thread exists", () => {
    const ctx = buildDraftContext(
      baseProspect({
        linkedinConversation: {
          messages: [{ messageId: "m1", senderName: "Maria Shaikh", text: "Sure", messageOrder: 1 }],
        },
      }),
      sender,
    );
    const draft = buildTemplateDraft(ctx);

    expect(draft.source).toBe("template");
    expect(draft.bodyHtml).toContain("Following up on our LinkedIn conversation");
    // "I came across your profile" to someone you have already messaged reads as
    // amnesia — it must not appear.
    expect(draft.bodyHtml).not.toContain("came across");
  });

  it("introduces the sender on a cold prospect", () => {
    const draft = buildTemplateDraft(buildDraftContext(baseProspect(), sender));
    expect(draft.bodyHtml).toContain("Hi Maria");
    expect(draft.bodyHtml).toContain("came across your profile");
    expect(draft.subject).toContain("Practo");
  });

  it("escapes HTML from scraped fields", () => {
    const ctx = buildDraftContext(
      baseProspect({ name: "<script>alert(1)</script> Shaikh", company: "A & B" }),
      sender,
    );
    const draft = buildTemplateDraft(ctx);
    expect(draft.bodyHtml).not.toContain("<script>");
    expect(draft.bodyHtml).toContain("&lt;script&gt;");
  });
});

describe("toBodyHtml", () => {
  it("turns blank-line-separated paragraphs into <br/><br/>", () => {
    expect(toBodyHtml("one\n\ntwo")).toBe("one<br/><br/>two");
  });

  it("keeps single newlines as single breaks", () => {
    expect(toBodyHtml("Best,\nRep")).toBe("Best,<br/>Rep");
  });

  it("escapes HTML the model may emit", () => {
    expect(toBodyHtml("a <b> c")).toBe("a &lt;b&gt; c");
  });
});
