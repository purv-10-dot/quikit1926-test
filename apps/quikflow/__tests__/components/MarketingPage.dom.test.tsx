// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { setSession } from "../setup";
import MarketingPage from "@/app/(marketing)/page";

/**
 * Public landing page at `/`. Mirrors the reference behaviour in
 * apps/quikscale/app/(marketing)/page.tsx:
 *   - no session          → render the landing page (200 OK)
 *   - session present     → redirect("/dashboard")
 *   - session + ?reason=no_app_access → render the landing page anyway
 *     (a user bounced here for lacking app access must still see the
 *     AppAccessDeniedPopup, not be redirect-looped back to /dashboard).
 */
describe("MarketingPage", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("renders the landing page content for an unauthenticated visitor", async () => {
    setSession(null);
    const jsx = await MarketingPage({ searchParams: {} });
    render(jsx);

    // Nav logo link — exact match, since other CTAs ("Open QuikFlow") also
    // have "QuikFlow" in their accessible name.
    expect(screen.getByRole("link", { name: "QuikFlow" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /connect every quikit app/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /built to connect quikit/i }),
    ).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an authenticated visitor straight to /dashboard", async () => {
    setSession({ id: "user-1", orgId: "org-1" });
    await MarketingPage({ searchParams: {} });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("does NOT redirect an authenticated visitor bounced here with ?reason=no_app_access", async () => {
    setSession({ id: "user-1", orgId: "org-1" });
    const jsx = await MarketingPage({ searchParams: { reason: "no_app_access" } });
    render(jsx);

    expect(redirect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /connect every quikit app/i }),
    ).toBeInTheDocument();
  });
});
