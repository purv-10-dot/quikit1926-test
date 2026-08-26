import { describe, expect, it } from "vitest";
import {
  connectorErrorResponse,
  errorMessage,
  isAuthExpiredError,
  isUnconfiguredError,
  safeErrorLog,
} from "@/lib/connectors/errors";

describe("isUnconfiguredError", () => {
  it("treats every '… not set' throw as needs-configuring, not a server fault", () => {
    // These are the exact strings thrown by the connectors. Before this helper
    // none of them matched the routes' checks, so a platform that was
    // authorised but had no site/property picked returned a hard 500.
    const messages = [
      "Search Console site not set",
      "GA4 property not set",
      "GBP location not set",
      "LinkedIn organization not set",
      "Dynamics org URL not set",
    ];
    for (const m of messages) {
      expect(isUnconfiguredError(new Error(m))).toBe(true);
    }
  });

  it("still covers the original not-connected / not-configured cases", () => {
    expect(isUnconfiguredError(new Error("Google Search Console not connected"))).toBe(true);
    expect(isUnconfiguredError(new Error("Mailchimp not configured"))).toBe(true);
    expect(isUnconfiguredError(new Error("Google Ads not connected: no accessible customers found"))).toBe(true);
    expect(isUnconfiguredError(new Error("Meta Ads not connected: no ad account found"))).toBe(true);
    expect(isUnconfiguredError(new Error("No YouTube channel found for this account"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isUnconfiguredError(new Error("SEARCH CONSOLE SITE NOT SET"))).toBe(true);
  });

  it("does NOT swallow genuine failures", () => {
    // These must keep returning 500 — silently reporting them as
    // "not connected" would hide real outages behind an empty state.
    const real = [
      "Google Ads GAQL error 403: permission denied",
      "Token refresh failed: 400",
      "GA4 WoW timed out after 15000ms",
      "fetch failed",
      "Request failed with status code 500",
    ];
    for (const m of real) {
      expect(isUnconfiguredError(new Error(m))).toBe(false);
    }
  });

  it("handles non-Error throws without blowing up", () => {
    expect(isUnconfiguredError("not connected")).toBe(true);
    expect(isUnconfiguredError(null)).toBe(false);
    expect(isUnconfiguredError(undefined)).toBe(false);
    expect(isUnconfiguredError({ weird: true })).toBe(false);
  });
});

describe("errorMessage", () => {
  it("unwraps an Error and falls back otherwise", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("boom")).toBe("Failed");
    expect(errorMessage(null, "Custom")).toBe("Custom");
  });

  it("digs the real reason out of a Google API error", () => {
    // .message alone is "Request failed with status code 403" — useless.
    const err = Object.assign(new Error("Request failed with status code 403"), {
      response: {
        status: 403,
        data: { error: { message: "User does not have sufficient permission for site 'sc-domain:example.com'." } },
      },
    });
    expect(errorMessage(err)).toBe(
      "403: User does not have sufficient permission for site 'sc-domain:example.com'.",
    );
  });

  it("reads an OAuth token-endpoint error shape", () => {
    const err = Object.assign(new Error("Request failed"), {
      response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
    });
    expect(errorMessage(err)).toBe("400: invalid_grant — Token has been expired or revoked.");
  });

  it("falls back to .message when there is no provider payload", () => {
    const err = Object.assign(new Error("socket hang up"), { response: { status: 500 } });
    expect(errorMessage(err)).toBe("socket hang up");
  });
});

/** A realistic Gaxios token-refresh failure, including the outbound request. */
function gaxiosInvalidGrant() {
  const REFRESH = "1//0gSECRET-REFRESH-TOKEN-VALUE";
  return Object.assign(new Error("invalid_grant"), {
    name: "GaxiosError",
    code: 400,
    status: 400,
    config: {
      url: "https://oauth2.googleapis.com/token",
      // Gaxios redacts client_secret but NOT the refresh token.
      data: { refresh_token: REFRESH, client_id: "abc.apps.googleusercontent.com" },
      body: { refresh_token: REFRESH },
    },
    response: {
      status: 400,
      data: { error: "invalid_grant", error_description: "Token has been expired or revoked." },
    },
  });
}

describe("safeErrorLog", () => {
  it("never carries the refresh token into the log", () => {
    // console.error(err) on the raw object writes a live credential to the
    // terminal and to production log aggregation.
    const serialised = JSON.stringify(safeErrorLog(gaxiosInvalidGrant()));
    expect(serialised).not.toContain("SECRET-REFRESH-TOKEN-VALUE");
    expect(serialised).not.toContain("refresh_token");
    expect(serialised).not.toContain("client_id");
  });

  it("still records enough to diagnose", () => {
    const safe = safeErrorLog(gaxiosInvalidGrant());
    expect(safe.name).toBe("GaxiosError");
    expect(String(safe.message)).toContain("Token has been expired or revoked");
    expect(safe.status).toBe(400);
  });

  it("survives non-Error input", () => {
    expect(() => safeErrorLog("boom")).not.toThrow();
    expect(() => safeErrorLog(null)).not.toThrow();
  });
});

describe("isAuthExpiredError", () => {
  it("recognises a dead Google grant", () => {
    expect(isAuthExpiredError(gaxiosInvalidGrant())).toBe(true);
  });

  it("does not treat ordinary failures as expired auth", () => {
    expect(isAuthExpiredError(new Error("Request failed with status code 500"))).toBe(false);
    expect(isAuthExpiredError(new Error("GSC timed out"))).toBe(false);
  });
});

describe("connectorErrorResponse", () => {
  it("reports a dead grant as not-connected rather than a 500", () => {
    // Retrying can never succeed, so a hard 500 on every page load is wrong.
    const { body, status } = connectorErrorResponse("search-console", gaxiosInvalidGrant());
    expect(status).toBe(200);
    expect(body).toEqual({ connected: false, needsReauth: true });
  });

  it("keeps returning 500 for genuine failures", () => {
    const { status } = connectorErrorResponse("search-console", new Error("socket hang up"));
    expect(status).toBe(500);
  });

  it("maps unconfigured state to connected:false", () => {
    const { body, status } = connectorErrorResponse("gsc", new Error("Search Console site not set"));
    expect(status).toBe(200);
    expect(body).toEqual({ connected: false });
  });
});
