// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useDisabledModules,
  _resetDisabledModulesCache,
} from "@/lib/hooks/useFeatureFlagsForApp";

const STORAGE_KEY = "ff:me:quikscale:v1";
const fetchMock = vi.fn();

function seedLocal(keys: string[]) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ disabledKeys: keys, storedAt: Date.now() }),
  );
}

beforeEach(() => {
  _resetDisabledModulesCache();
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: { appSlug: "quikscale", disabledKeys: ["orgSetup.quarters"] },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetDisabledModulesCache();
});

function Probe() {
  const disabled = useDisabledModules();
  return <span>{disabled.size}</span>;
}

describe("useDisabledModules — SSR hydration safety", () => {
  it("initial render is EMPTY even with a fresh localStorage entry (matches the server)", () => {
    // Regression: the server has no localStorage, so it renders all modules
    // enabled (size 0). If the hook seeded from localStorage synchronously in
    // its useState initializer, the first client render would be size 1 and the
    // sidebar would mismatch the server HTML -> hydration error. renderToString
    // runs ONLY the initial render (no effects), exactly like the server.
    seedLocal(["orgSetup.quarters"]);
    const html = renderToString(<Probe />);
    expect(html).toContain(">0<");
  });

  it("hydrates from localStorage and revalidates against the server after mount", async () => {
    seedLocal(["orgSetup.quarters"]);
    const { result } = renderHook(() => useDisabledModules());

    // Post-mount effect adopts the cached/fresh disabled set.
    await waitFor(() =>
      expect(result.current.has("orgSetup.quarters")).toBe(true),
    );

    // ...and it revalidated against the server once.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feature-flags/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
