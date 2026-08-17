import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Regression coverage for the mail/calendar connectors' env-var names.
 *
 * History: these vars were originally the bare GOOGLE_CLIENT_ID / MS_CLIENT_ID /
 * MS_CLIENT_SECRET / MS_TENANT names, which collided with other apps' own,
 * unrelated OAuth app registrations of the same shape (e.g. QuikHRMS's
 * MS_TEAMS_CLIENT_ID for a separate Azure app) wherever env vars are shared
 * across apps. That was fixed by renaming to QUIKFLOW_GOOGLE_* / QUIKFLOW_MS_* /
 * QUIKFLOW_TEAMS_*, with tests here pinning the prefixed names.
 *
 * On 2026-08-17 this was deliberately reverted back to the global names
 * (GOOGLE_CLIENT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET /
 * MICROSOFT_TENANT_ID), with Teams now sharing the same MICROSOFT_* vars as
 * Outlook mail (one Azure app registration backs both). This was an informed
 * decision, not an oversight — see apps/quikflow/.env.example for the
 * rationale and the collision/rotation tradeoffs it reintroduces. These tests
 * now pin the global names and guard against a silent fallback to the old
 * QUIKFLOW_*-prefixed ones.
 */

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "QUIKFLOW_GOOGLE_CLIENT_ID",
  "QUIKFLOW_GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "QUIKFLOW_MS_CLIENT_ID",
  "QUIKFLOW_MS_CLIENT_SECRET",
  "QUIKFLOW_MS_TENANT",
  "QUIKFLOW_TEAMS_CLIENT_ID",
  "QUIKFLOW_TEAMS_CLIENT_SECRET",
  "QUIKFLOW_TEAMS_TENANT",
] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("gmail.ts — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", () => {
  it("throws the current var name when unset", async () => {
    const { GMAIL } = await import("../../lib/connectors/gmail");
    expect(() => GMAIL.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "GOOGLE_CLIENT_ID is not set.",
    );
  });

  it("does not fall back to the retired QUIKFLOW_GOOGLE_CLIENT_ID name", async () => {
    process.env.QUIKFLOW_GOOGLE_CLIENT_ID = "old-id";
    process.env.QUIKFLOW_GOOGLE_CLIENT_SECRET = "old-secret";
    const { GMAIL } = await import("../../lib/connectors/gmail");
    expect(() => GMAIL.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "GOOGLE_CLIENT_ID is not set.",
    );
  });

  it("builds the auth URL from GOOGLE_CLIENT_ID once set", async () => {
    process.env.GOOGLE_CLIENT_ID = "new-id";
    process.env.GOOGLE_CLIENT_SECRET = "new-secret";
    const { GMAIL } = await import("../../lib/connectors/gmail");
    const url = GMAIL.buildAuthUrl("http://localhost/callback", "state");
    expect(new URL(url).searchParams.get("client_id")).toBe("new-id");
  });
});

describe("microsoft.ts (Outlook mail) — MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID", () => {
  it("throws the current var name when unset", async () => {
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    expect(() => OUTLOOK.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "MICROSOFT_CLIENT_ID is not set.",
    );
  });

  it("does not fall back to the retired QUIKFLOW_MS_CLIENT_ID name", async () => {
    process.env.QUIKFLOW_MS_CLIENT_ID = "old-id";
    process.env.QUIKFLOW_MS_CLIENT_SECRET = "old-secret";
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    expect(() => OUTLOOK.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "MICROSOFT_CLIENT_ID is not set.",
    );
  });

  it("builds the auth URL from MICROSOFT_CLIENT_ID and defaults tenant to common", async () => {
    process.env.MICROSOFT_CLIENT_ID = "new-id";
    process.env.MICROSOFT_CLIENT_SECRET = "new-secret";
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    const url = new URL(OUTLOOK.buildAuthUrl("http://localhost/callback", "state"));
    expect(url.searchParams.get("client_id")).toBe("new-id");
    expect(url.pathname.startsWith("/common/")).toBe(true);
  });

  it("honors a MICROSOFT_TENANT_ID override, ignoring the retired QUIKFLOW_MS_TENANT", async () => {
    process.env.MICROSOFT_CLIENT_ID = "new-id";
    process.env.MICROSOFT_CLIENT_SECRET = "new-secret";
    process.env.MICROSOFT_TENANT_ID = "contoso-tenant";
    process.env.QUIKFLOW_MS_TENANT = "old-tenant";
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    const url = new URL(OUTLOOK.buildAuthUrl("http://localhost/callback", "state"));
    expect(url.pathname.startsWith("/contoso-tenant/")).toBe(true);
  });
});

describe('microsoft-identity.ts msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID") — Teams calendar connector', () => {
  it("throws MICROSOFT_CLIENT_ID_is_not_set when client id missing", async () => {
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(() => msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID")).toThrow(
      "MICROSOFT_CLIENT_ID is not set.",
    );
  });

  it("throws MICROSOFT_CLIENT_SECRET_is_not_set when secret missing", async () => {
    process.env.MICROSOFT_CLIENT_ID = "teams-id";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(() => msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID")).toThrow(
      "MICROSOFT_CLIENT_SECRET is not set.",
    );
  });

  it("reads client id/secret and defaults tenant to common", async () => {
    process.env.MICROSOFT_CLIENT_ID = "teams-id";
    process.env.MICROSOFT_CLIENT_SECRET = "teams-secret";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID")).toEqual({
      clientId: "teams-id",
      clientSecret: "teams-secret",
      tenant: "common",
    });
  });

  it("honors a MICROSOFT_TENANT_ID override", async () => {
    process.env.MICROSOFT_CLIENT_ID = "teams-id";
    process.env.MICROSOFT_CLIENT_SECRET = "teams-secret";
    process.env.MICROSOFT_TENANT_ID = "contoso-tenant";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID").tenant).toBe("contoso-tenant");
  });

  it("shares config with the Outlook mail connector (same Azure app)", async () => {
    process.env.MICROSOFT_CLIENT_ID = "shared-id";
    process.env.MICROSOFT_CLIENT_SECRET = "shared-secret";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    const teamsCfg = msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID");
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    const outlookUrl = new URL(OUTLOOK.buildAuthUrl("http://localhost/callback", "state"));
    expect(outlookUrl.searchParams.get("client_id")).toBe(teamsCfg.clientId);
  });
});
