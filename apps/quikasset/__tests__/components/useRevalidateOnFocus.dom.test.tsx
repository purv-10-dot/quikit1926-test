// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRevalidateOnFocus } from "@/lib/hooks/useRevalidateOnFocus";

function fireFocus() {
  window.dispatchEvent(new Event("focus"));
}
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}
function fireVisibilityChange(state: "visible" | "hidden") {
  setVisibility(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useRevalidateOnFocus", () => {
  it("does NOT fire on mount", () => {
    const cb = vi.fn();
    renderHook(() => useRevalidateOnFocus(cb));
    expect(cb).not.toHaveBeenCalled();
  });

  it("fires on window focus", () => {
    const cb = vi.fn();
    renderHook(() => useRevalidateOnFocus(cb));
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("fires on visibilitychange → visible, but not when hidden", () => {
    const cb = vi.fn();
    renderHook(() => useRevalidateOnFocus(cb));
    fireVisibilityChange("hidden");
    expect(cb).not.toHaveBeenCalled();
    fireVisibilityChange("visible");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("debounces focus + visibility firing together into a single call", () => {
    const cb = vi.fn();
    renderHook(() => useRevalidateOnFocus(cb));
    fireFocus();
    fireVisibilityChange("visible"); // within the 800ms window → suppressed
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("removes its listeners on unmount", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useRevalidateOnFocus(cb));
    unmount();
    fireFocus();
    expect(cb).not.toHaveBeenCalled();
  });

  it("does nothing when enabled is false", () => {
    const cb = vi.fn();
    renderHook(() => useRevalidateOnFocus(cb, { enabled: false }));
    fireFocus();
    expect(cb).not.toHaveBeenCalled();
  });

  it("always invokes the latest callback (ref, not a stale closure)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ f }) => useRevalidateOnFocus(f), { initialProps: { f: first } });
    rerender({ f: second });
    fireFocus();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
