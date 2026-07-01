import { describe, it, expect } from "vitest";
import { normalizeJiraHost } from "@/lib/services/migration/jira-client";

// SEC-05 regression: the Jira migration must only ever talk to Atlassian Cloud
// (*.atlassian.net). Internal/private hosts, non-Atlassian domains, embedded
// credentials, and explicit ports are rejected BEFORE any outbound request.

describe("normalizeJiraHost (SEC-05 SSRF allow-list)", () => {
  it("accepts a valid Atlassian Cloud site and strips protocol/path/slash", () => {
    expect(normalizeJiraHost("acme.atlassian.net")).toBe("acme.atlassian.net");
    expect(normalizeJiraHost("https://acme.atlassian.net/jira")).toBe("acme.atlassian.net");
    expect(normalizeJiraHost("  ACME.ATLASSIAN.NET/  ")).toBe("acme.atlassian.net");
    expect(normalizeJiraHost("team.acme.atlassian.net")).toBe("team.acme.atlassian.net");
  });

  it("rejects an internal / link-local / loopback host", () => {
    expect(() => normalizeJiraHost("169.254.169.254")).toThrow();
    expect(() => normalizeJiraHost("http://127.0.0.1")).toThrow();
    expect(() => normalizeJiraHost("localhost")).toThrow();
    expect(() => normalizeJiraHost("10.0.0.5")).toThrow();
    expect(() => normalizeJiraHost("metadata.internal")).toThrow();
  });

  it("rejects non-Atlassian domains, including look-alikes", () => {
    expect(() => normalizeJiraHost("evil.com")).toThrow();
    expect(() => normalizeJiraHost("atlassian.net")).toThrow(); // bare apex, no site
    expect(() => normalizeJiraHost("acme.atlassian.net.evil.com")).toThrow();
    expect(() => normalizeJiraHost("xatlassian.net")).toThrow();
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeJiraHost("user:pass@acme.atlassian.net")).toThrow();
    expect(() => normalizeJiraHost("https://user@acme.atlassian.net")).toThrow();
    // Credential smuggling that would otherwise resolve to an internal host.
    expect(() => normalizeJiraHost("acme.atlassian.net@169.254.169.254")).toThrow();
  });

  it("rejects explicit ports", () => {
    expect(() => normalizeJiraHost("acme.atlassian.net:8080")).toThrow();
  });

  it("rejects empty / missing input", () => {
    expect(() => normalizeJiraHost("")).toThrow();
    expect(() => normalizeJiraHost("   ")).toThrow();
    // @ts-expect-error — guarding runtime misuse
    expect(() => normalizeJiraHost(null)).toThrow();
  });
});
