import { describe, it, expect } from "vitest";
import { canSeeDashboard, postLoginLanding } from "@/lib/api/landing";

describe("landing policy", () => {
  it("admins can see the dashboard", () => {
    expect(canSeeDashboard({ isAdmin: true, permissions: [] })).toBe(true);
    expect(postLoginLanding({ isAdmin: true, permissions: [] })).toBe("/dashboard");
  });

  it("non-admins with Dashboard:view can see the dashboard", () => {
    const perms = { isAdmin: false, permissions: ["Asset:view", "Dashboard:view"] };
    expect(canSeeDashboard(perms)).toBe(true);
    expect(postLoginLanding(perms)).toBe("/dashboard");
  });

  it("plain Members (no Dashboard:view) land on /employee-view", () => {
    const perms = { isAdmin: false, permissions: ["Asset:view", "AssetRequest:create"] };
    expect(canSeeDashboard(perms)).toBe(false);
    expect(postLoginLanding(perms)).toBe("/employee-view");
  });

  it("a user with no permissions at all lands on /employee-view", () => {
    expect(canSeeDashboard({ isAdmin: false, permissions: [] })).toBe(false);
    expect(postLoginLanding({ isAdmin: false, permissions: [] })).toBe("/employee-view");
  });
});
