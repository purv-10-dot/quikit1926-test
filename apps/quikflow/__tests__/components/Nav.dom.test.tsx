// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Nav.tsx computes LOGIN_HREF from `process.env.NEXT_PUBLIC_*` at MODULE
// scope (literal access, so webpack can inline it in the real build — see
// packages/shared/lib/login-url.ts). That means the env vars must be set
// and the module re-imported fresh in each test via `vi.resetModules()` +
// a dynamic `import()`, rather than a static top-level import.
async function loadNav() {
  const mod = await import("@/app/(marketing)/_components/Nav");
  return mod.default;
}

describe("Nav (marketing landing page)", () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_QUIKFLOW_URL = "http://localhost:3014";
    process.env.NEXT_PUBLIC_AUTH_URL = "http://localhost:3001";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("renders a QuikFlow logo link back to the landing page", async () => {
    const Nav = await loadNav();
    render(<Nav />);
    const logo = screen.getByRole("link", { name: /quikflow/i });
    expect(logo).toHaveAttribute("href", "/");
  });

  it("points Login at the central auth host, bridging back to /dashboard on this app's origin", async () => {
    const Nav = await loadNav();
    render(<Nav />);
    const login = screen.getByRole("link", { name: /^login$/i });
    const href = login.getAttribute("href")!;

    expect(href.startsWith("http://localhost:3001/login")).toBe(true);

    // Cross-origin login (auth host :3001 vs. this app :3014) routes through
    // the /api/post-login cookie bridge — see packages/shared/lib/login-url.ts.
    // Unwrap both hops of the nested callbackUrl to confirm the final
    // destination is this app's /dashboard.
    const outer = new URL(href);
    const bridge = new URL(outer.searchParams.get("callbackUrl")!);
    expect(bridge.origin).toBe("http://localhost:3001");
    expect(bridge.pathname).toBe("/api/post-login");
    expect(bridge.searchParams.get("callbackUrl")).toBe("http://localhost:3014/dashboard");
  });

  it("does not render a self-serve Sign Up CTA — QuikFlow access is admin-granted only", async () => {
    const Nav = await loadNav();
    render(<Nav />);
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
  });
});
