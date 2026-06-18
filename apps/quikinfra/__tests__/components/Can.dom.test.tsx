// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// <Can> reads its allow/deny decision from usePermissions(). Mock the hook
// directly so we control isLoading / can / canAll / hasRole per test without
// any network or React Query plumbing.
const mockState: {
  isLoading: boolean;
  can: (p: string | string[]) => boolean;
  canAll: (p: string[]) => boolean;
  hasRole: (r: string | string[]) => boolean;
} = {
  isLoading: false,
  can: () => false,
  canAll: () => false,
  hasRole: () => false,
};

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => mockState,
}));

import { Can, CanDisable } from "@/components/rbac/can";

beforeEach(() => {
  mockState.isLoading = false;
  mockState.can = () => false;
  mockState.canAll = () => false;
  mockState.hasRole = () => false;
});

describe("Can", () => {
  it("renders children when the permission is granted", () => {
    mockState.can = (p) => p === "boq.lock";
    render(
      <Can permission="boq.lock">
        <button>Lock BOQ</button>
      </Can>,
    );
    expect(screen.getByRole("button", { name: /lock boq/i })).toBeInTheDocument();
  });

  it("renders nothing when the permission is denied and no fallback given", () => {
    mockState.can = () => false;
    const { container } = render(
      <Can permission="boq.lock">
        <button>Lock BOQ</button>
      </Can>,
    );
    expect(screen.queryByRole("button", { name: /lock boq/i })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the fallback when denied", () => {
    mockState.can = () => false;
    render(
      <Can permission="boq.unlock" fallback={<span>Locked</span>}>
        <button>Unlock</button>
      </Can>,
    );
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
  });

  it("renders the loading slot while permissions load", () => {
    mockState.isLoading = true;
    render(
      <Can permission="boq.lock" loading={<span>Loading…</span>}>
        <button>Lock BOQ</button>
      </Can>,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lock boq/i })).not.toBeInTheDocument();
  });

  it("with an array permission, passes when ANY matches (default)", () => {
    mockState.can = (p) =>
      Array.isArray(p) ? p.includes("purchase.po.approve_l2") : false;
    render(
      <Can permission={["purchase.po.approve_l1", "purchase.po.approve_l2"]}>
        <span>Approve</span>
      </Can>,
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("with all=true delegates to canAll", () => {
    const canAll = vi.fn(() => true);
    mockState.canAll = canAll;
    render(
      <Can permission={["a", "b"]} all>
        <span>Both</span>
      </Can>,
    );
    expect(canAll).toHaveBeenCalledWith(["a", "b"]);
    expect(screen.getByText("Both")).toBeInTheDocument();
  });

  it("role takes precedence and gates via hasRole", () => {
    mockState.hasRole = (r) =>
      Array.isArray(r) ? r.includes("site_admin") : r === "site_admin";
    render(
      <Can role={["site_admin", "ho_user"]}>
        <span>Project Settings</span>
      </Can>,
    );
    expect(screen.getByText("Project Settings")).toBeInTheDocument();
  });

  it("renders children when no criteria are supplied", () => {
    render(
      <Can>
        <span>Always</span>
      </Can>,
    );
    expect(screen.getByText("Always")).toBeInTheDocument();
  });
});

describe("CanDisable", () => {
  it("calls children with disabled=false when allowed", () => {
    mockState.can = () => true;
    render(
      <CanDisable permission="boq.lock">
        {(disabled) => <button disabled={disabled}>Lock</button>}
      </CanDisable>,
    );
    expect(screen.getByRole("button", { name: /lock/i })).not.toBeDisabled();
  });

  it("calls children with disabled=true when denied", () => {
    mockState.can = () => false;
    render(
      <CanDisable permission="boq.lock">
        {(disabled) => <button disabled={disabled}>Lock</button>}
      </CanDisable>,
    );
    expect(screen.getByRole("button", { name: /lock/i })).toBeDisabled();
  });

  it("calls children with disabled=true while loading", () => {
    mockState.isLoading = true;
    render(
      <CanDisable permission="boq.lock">
        {(disabled) => <button disabled={disabled}>Lock</button>}
      </CanDisable>,
    );
    expect(screen.getByRole("button", { name: /lock/i })).toBeDisabled();
  });
});
