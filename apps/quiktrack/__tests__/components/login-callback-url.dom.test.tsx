// @vitest-environment jsdom
/**
 * Regression: an emailed "View task" link opened by a signed-out user must land
 * on the task after login, not the dashboard.
 *
 * `createMiddleware` bounces the unauthenticated request to
 * `/login?callbackUrl=/browse/SCRUM-58` (packages/auth/middleware.ts). This page
 * used to hardcode `callbackUrl: "/dashboard"` on `signIn()`, discarding that —
 * so the user finished SSO on the dashboard and had to hunt for the ticket.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const signIn = vi.fn();
const replace = vi.fn();
let sessionStatus: "authenticated" | "unauthenticated" | "loading" = "unauthenticated";
let search = new URLSearchParams();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  useSession: () => ({ status: sessionStatus }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

import LoginPage from "@/app/login/page";

const DEEP_LINK = "/browse/SCRUM-58";

describe("login page callbackUrl handling", () => {
  beforeEach(() => {
    signIn.mockClear();
    replace.mockClear();
    sessionStatus = "unauthenticated";
    search = new URLSearchParams();
  });

  it("carries the work-item deep link through SSO sign-in", () => {
    search = new URLSearchParams({ callbackUrl: DEEP_LINK });
    render(<LoginPage />);
    expect(signIn).toHaveBeenCalledWith("quikit", { callbackUrl: DEEP_LINK });
  });

  it("sends an already-authenticated visitor straight to the work item", () => {
    sessionStatus = "authenticated";
    search = new URLSearchParams({ callbackUrl: DEEP_LINK });
    render(<LoginPage />);
    expect(replace).toHaveBeenCalledWith(DEEP_LINK);
  });

  it("preserves a callbackUrl that carries a query string", () => {
    search = new URLSearchParams({ callbackUrl: "/browse/SCRUM-58?tab=comments" });
    render(<LoginPage />);
    expect(signIn).toHaveBeenCalledWith("quikit", {
      callbackUrl: "/browse/SCRUM-58?tab=comments",
    });
  });

  it("still defaults to the dashboard with no callbackUrl", () => {
    render(<LoginPage />);
    expect(signIn).toHaveBeenCalledWith("quikit", { callbackUrl: "/dashboard" });
  });

  it("refuses an off-origin callbackUrl", () => {
    search = new URLSearchParams({ callbackUrl: "https://evil.test/phish" });
    render(<LoginPage />);
    expect(signIn).toHaveBeenCalledWith("quikit", { callbackUrl: "/dashboard" });
  });
});
