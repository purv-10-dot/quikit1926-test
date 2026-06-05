import { describe, expect, it } from "vitest";
import { buildGmailComposeUrl, buildMailtoUrl } from "@/lib/utils/mailto";

describe("buildMailtoUrl", () => {
  it("builds a minimal mailto link", () => {
    expect(buildMailtoUrl({ to: "buyer@example.com" })).toBe("mailto:buyer@example.com");
  });

  it("encodes subject and body query params", () => {
    const url = buildMailtoUrl({
      to: "buyer@example.com",
      subject: "Regarding Acme",
      body: "Hello there",
    });
    expect(url).toBe(
      "mailto:buyer@example.com?subject=Regarding+Acme&body=Hello+there",
    );
  });

  it("rejects empty recipient", () => {
    expect(() => buildMailtoUrl({ to: "   " })).toThrow(/required/i);
  });
});

describe("buildGmailComposeUrl", () => {
  it("builds a Gmail compose link", () => {
    const url = buildGmailComposeUrl({
      to: "buyer@example.com",
      subject: "Hello",
    });
    expect(url).toContain("mail.google.com");
    expect(url).toContain("to=buyer%40example.com");
    expect(url).toContain("su=Hello");
  });
});
