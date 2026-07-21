/**
 * Microsoft OAuth authorize-URL construction. The regression this guards:
 * the normal per-user connect flow must NOT send `prompt=consent` — doing so
 * forced the "need admin approval" screen on every login even after tenant
 * admin consent was granted. Only the explicit admin-consent flow requests a
 * prompt, and it uses `prompt=admin_consent` (tenant-wide approval).
 */
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env.MICROSOFT_CLIENT_ID = "mid";
  process.env.MICROSOFT_CLIENT_SECRET = "msecret";
  process.env.MICROSOFT_TENANT_ID = "tenant-123";
});

import { microsoftProvider } from "@/lib/services/email/providers/microsoft";

const base = { redirectUri: "https://app.example.com/api/email/mailbox/callback", state: "signed-state" };

describe("microsoftProvider.getAuthUrl", () => {
  it("does NOT send any prompt param on the normal connect flow", () => {
    const url = new URL(microsoftProvider.getAuthUrl(base));
    expect(url.searchParams.has("prompt")).toBe(false);
  });

  it("uses the tenant-specific authorize endpoint", () => {
    const url = new URL(microsoftProvider.getAuthUrl(base));
    expect(url.pathname).toBe("/tenant-123/oauth2/v2.0/authorize");
  });

  it("keeps the existing scopes", () => {
    const url = new URL(microsoftProvider.getAuthUrl(base));
    expect(url.searchParams.get("scope")).toBe(
      "offline_access openid email User.Read Mail.Read Mail.Send",
    );
  });

  it("preserves the callback redirect_uri and state unchanged", () => {
    const url = new URL(microsoftProvider.getAuthUrl(base));
    expect(url.searchParams.get("redirect_uri")).toBe(base.redirectUri);
    expect(url.searchParams.get("state")).toBe(base.state);
  });

  it("requests prompt=admin_consent ONLY on the admin-consent flow", () => {
    const url = new URL(microsoftProvider.getAuthUrl({ ...base, adminConsent: true }));
    expect(url.searchParams.get("prompt")).toBe("admin_consent");
  });
});
