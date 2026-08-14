import { describe, it, expect } from "vitest";
import { renderWelcomeEmail } from "../lib/welcome-email-template";

/**
 * Arbitrary stand-in for whatever `buildLoginUrl()` resolves
 * `NEXT_PUBLIC_AUTH_URL` to at runtime. `renderWelcomeEmail` takes the URL as a
 * parameter and reads no env itself, so the test has to supply a literal — this
 * is NOT configuration and nothing in the shipped code reads it.
 */
const FIXTURE_LOGIN_URL = "https://auth.example.test/login";

describe("renderWelcomeEmail", () => {
  it("uses the trial subject line with the default 14 days", () => {
    const { subject } = renderWelcomeEmail({ firstName: "Jane" });
    expect(subject).toBe("Welcome to Quikit – Your 14-Day Free Trial Has Started");
  });

  it("reflects a custom trial length in both subject and body", () => {
    const { subject, html } = renderWelcomeEmail({ firstName: "Jane", trialDays: 30 });
    expect(subject).toContain("30-Day Free Trial");
    expect(html).toContain("30-day free trial");
  });

  it("greets by first name and includes every required content block", () => {
    const { html } = renderWelcomeEmail({ firstName: "Jane" });
    expect(html).toContain("Hi Jane,");
    expect(html).toContain("Welcome to Quikit! We're excited to have you on board.");
    expect(html).toContain("Today's Mission (5 minutes)");
    expect(html).toContain("AI Success Manager");
    expect(html).toContain("See you inside,");
    expect(html).toContain("The Quikit Team");
    for (const step of [
      "Create your first workflow",
      "Invite your team",
      "Explore AI-powered features",
      "Track your business progress",
    ]) {
      expect(html).toContain(step);
    }
  });

  it("renders a Get Started button pointing at the login URL", () => {
    // Test fixture only. The renderer is a pure function — the real URL comes
    // from buildLoginUrl() (NEXT_PUBLIC_AUTH_URL) in the calling app's mailer,
    // never from this module.
    const loginUrl = FIXTURE_LOGIN_URL;
    const { html } = renderWelcomeEmail({ firstName: "Jane", loginUrl });
    expect(html).toContain(`<a href="${loginUrl}"`);
    expect(html).toContain(">Get Started</a>");
    expect(html).toContain("background:#16130F");
    expect(html).toContain("color:#ffffff");
  });

  it("never shows the login URL as visible text", () => {
    const { html } = renderWelcomeEmail({ firstName: "Jane", loginUrl: FIXTURE_LOGIN_URL });
    // The URL appears exactly once — inside the href, not as link text.
    expect(html.split(FIXTURE_LOGIN_URL).length - 1).toBe(1);
    expect(html).not.toContain(`>${FIXTURE_LOGIN_URL}<`);
    expect(html).not.toContain("Sign in to your workspace");
  });

  it("places the button between the mission copy and the next-few-days lead-in", () => {
    const { html } = renderWelcomeEmail({ firstName: "Jane", loginUrl: FIXTURE_LOGIN_URL });
    const btn = html.indexOf("Get Started");
    expect(btn).toBeGreaterThan(html.indexOf("Complete your workspace setup"));
    expect(btn).toBeLessThan(html.indexOf("Over the next few days"));
  });

  it("omits the button entirely when no usable login URL is given", () => {
    for (const loginUrl of [undefined, "", "/login", "javascript:alert(1)"]) {
      const { html } = renderWelcomeEmail({ firstName: "Jane", loginUrl });
      expect(html).not.toContain("Get Started");
      expect(html).not.toContain("<a ");
    }
  });

  it("keeps the old CTA button out of the template", () => {
    const { html } = renderWelcomeEmail({ firstName: "Jane", loginUrl: FIXTURE_LOGIN_URL });
    expect(html).not.toContain("Complete Workspace Setup]");
  });

  it("keeps the layout plain — no branded card, header bar or footer chrome", () => {
    const { html } = renderWelcomeEmail({ firstName: "Jane" });
    expect(html).not.toContain("box-shadow");
    expect(html).not.toContain("border-top");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
  });

  it("escapes HTML in the first name", () => {
    const { html } = renderWelcomeEmail({ firstName: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("falls back to a neutral greeting when the first name is empty", () => {
    const { html } = renderWelcomeEmail({ firstName: "" });
    expect(html).toContain("Hi there,");
  });
});
