// @vitest-environment jsdom
/**
 * Tests for useSessionState — a useState that mirrors its value into
 * sessionStorage so filter selections survive navigation + a full refresh
 * (the cross-page owner filter and the WWW status filter rely on this).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionState } from "@/lib/hooks/useSessionState";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("useSessionState", () => {
  it("falls back to the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useSessionState("qs:test:k", "init"));
    expect(result.current[0]).toBe("init");
  });

  it("persists to sessionStorage on set (JSON-encoded)", () => {
    const { result } = renderHook(() => useSessionState<string>("qs:test:owner", ""));
    act(() => result.current[1]("user-123"));
    expect(result.current[0]).toBe("user-123");
    expect(window.sessionStorage.getItem("qs:test:owner")).toBe(JSON.stringify("user-123"));
  });

  it("seeds from a previously stored value on mount (survives a remount/refresh)", () => {
    window.sessionStorage.setItem("qs:test:q", JSON.stringify("Q3"));
    const { result } = renderHook(() => useSessionState("qs:test:q", "Q1"));
    expect(result.current[0]).toBe("Q3");
  });

  it("round-trips non-string values (numbers)", () => {
    window.sessionStorage.setItem("qs:test:year", JSON.stringify(2027));
    const { result } = renderHook(() => useSessionState<number>("qs:test:year", 2026));
    expect(result.current[0]).toBe(2027);
    act(() => result.current[1](2030));
    expect(window.sessionStorage.getItem("qs:test:year")).toBe(JSON.stringify(2030));
  });

  it("falls back to initial when the stored value is corrupt JSON", () => {
    window.sessionStorage.setItem("qs:test:bad", "{not-json");
    const { result } = renderHook(() => useSessionState("qs:test:bad", "safe"));
    expect(result.current[0]).toBe("safe");
  });

  it("keeps a stable setter identity across renders", () => {
    const { result, rerender } = renderHook(() => useSessionState("qs:test:stable", ""));
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });
});
