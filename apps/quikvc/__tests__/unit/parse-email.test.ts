/**
 * Inbound-email parser tests — exercises the field extractors used by
 * /api/webhooks/email/sourced.
 */
import { describe, it, expect } from "vitest";
import {
  cleanSubject,
  extractFundingAskLakhs,
  extractOriginalSender,
  extractPitch,
  extractWebsite,
  parseInboundEmail,
} from "@/lib/sourcing/parse-email";

describe("cleanSubject", () => {
  it("strips Fwd: / Re: prefixes (case-insensitive, repeated)", () => {
    expect(cleanSubject("Fwd: Re: FW: Acme Corp pitch")).toBe("Acme Corp pitch");
    expect(cleanSubject("FWD: hello")).toBe("hello");
    expect(cleanSubject("Acme Corp")).toBe("Acme Corp");
    expect(cleanSubject("")).toBe("");
  });
});

describe("extractOriginalSender", () => {
  it("pulls name + email from From: header in forwarded body", () => {
    const body = `Forwarding for your review.

---------- Forwarded message ---------
From: Jane Doe <jane@acme.test>
Date: Wed, 1 Jan 2026 at 10:00
Subject: Acme funding round

Hi VC,
...`;
    expect(extractOriginalSender(body)).toEqual({
      name: "Jane Doe",
      email: "jane@acme.test",
    });
  });

  it("handles bare email with no display name", () => {
    const body = `From: jane@acme.test\n\nHi.`;
    expect(extractOriginalSender(body)).toEqual({ email: "jane@acme.test" });
  });

  it("returns empty when no From: header found", () => {
    expect(extractOriginalSender("Just a regular email body.")).toEqual({});
  });
});

describe("extractWebsite", () => {
  it("returns first URL", () => {
    expect(extractWebsite("Visit https://acme.test for more.")).toBe("https://acme.test");
  });
  it("strips trailing punctuation", () => {
    expect(extractWebsite("see https://acme.test/about?utm=x.")).toBe("https://acme.test/about?utm=x");
    expect(extractWebsite("https://acme.test/page),")).toBe("https://acme.test/page");
  });
  it("returns undefined when no URL", () => {
    expect(extractWebsite("plain text")).toBeUndefined();
  });
});

describe("extractFundingAskLakhs", () => {
  it("parses lakhs", () => {
    expect(extractFundingAskLakhs("asking ₹50L")).toBe(50);
    expect(extractFundingAskLakhs("Rs 25 lakhs")).toBe(25);
    expect(extractFundingAskLakhs("INR 100 lakh")).toBe(100);
  });
  it("converts crore to lakhs (1 cr = 100 L)", () => {
    expect(extractFundingAskLakhs("seeking ₹1.5Cr")).toBe(150);
    expect(extractFundingAskLakhs("Rs 2 crore")).toBe(200);
  });
  it("prefers crore over lakhs when both present", () => {
    // The crore regex is matched first; "1Cr" wins over a later "5L".
    expect(extractFundingAskLakhs("₹1Cr or ₹5L bridge")).toBe(100);
  });
  it("returns undefined when no amount", () => {
    expect(extractFundingAskLakhs("hello world")).toBeUndefined();
  });
});

describe("extractPitch", () => {
  it("returns first 1-3 substantive lines, skipping headers + signature", () => {
    const body = `On Wed, Jan 1 2026, Jane wrote:
> Quoted text from older email.

We're building an AI-powered VC operating system.
We've raised $1M from Acme Capital.
Looking to close a $5M round in Q2.

Best,
Jane
--`;
    const pitch = extractPitch(body);
    expect(pitch).toContain("AI-powered VC operating system");
    expect(pitch).toContain("Acme Capital");
    expect(pitch).not.toContain("Quoted text");
    expect(pitch).not.toContain("Best,");
  });

  it("returns undefined when body is empty", () => {
    expect(extractPitch("")).toBeUndefined();
  });
});

describe("parseInboundEmail (integration)", () => {
  it("extracts everything from a typical forwarded pitch", () => {
    const result = parseInboundEmail({
      from: "partner@valleynxt.com",
      to: "sourcing+valleynxt@in.quikvc.test",
      subject: "Fwd: Re: Acme Corp - Series A pitch",
      text: `Take a look — strong fit for us.

---------- Forwarded message ---------
From: Jane Doe <jane@acme.test>
Date: Wed, 1 Jan 2026 at 10:00
Subject: Acme Corp - Series A pitch

Hi,

We're building an AI-powered logistics platform for D2C brands.
We've shipped v1 to 12 paying customers and crossed ₹2L MRR.
Asking ₹50L for an 18-month runway.

Website: https://acme.test
Best,
Jane`,
    });

    expect(result.startupName).toBe("Acme Corp - Series A pitch");
    expect(result.contactEmail).toBe("jane@acme.test");
    expect(result.contactName).toBe("Jane Doe");
    expect(result.website).toBe("https://acme.test");
    expect(result.fundingAskLakhs).toBe(50);
    expect(result.pitch).toContain("AI-powered logistics platform");
  });

  it("falls back to forwarder email when no original sender header", () => {
    const result = parseInboundEmail({
      from: "founder@startup.test",
      to: "sourcing+valleynxt@in.quikvc.test",
      subject: "Pitch deck",
      text: "We make widgets. Asking 25L.",
    });

    expect(result.contactEmail).toBe("founder@startup.test");
    expect(result.contactName).toBeUndefined();
    expect(result.fundingAskLakhs).toBe(25);
  });

  it("always returns a startupName even with empty subject", () => {
    const result = parseInboundEmail({
      from: "x@test",
      to: "sourcing+t@in.quikvc.test",
      subject: "",
      text: "",
    });
    expect(result.startupName).toBe("Untitled opportunity");
  });
});
