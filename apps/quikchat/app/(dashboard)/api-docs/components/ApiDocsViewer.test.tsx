import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Swagger UI is stubbed, deliberately and unavoidably.
 *
 * It is a ~30-dependency Redux/Immutable component that needs real layout and a
 * real network to do anything, and jsdom gives it neither. So this file proves
 * the wiring around it — the banner, and the props that make "Try it out"
 * same-origin — and proves NOTHING about Swagger UI actually rendering an
 * operation or executing a request. That needs a browser and a human; do not
 * read a green run here as coverage of the feature working end to end.
 */
const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock("swagger-ui-react", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      captured.props = props;
      return React.createElement("div", { "data-testid": "swagger-ui-stub" });
    },
  };
});

import { ApiDocsViewer, sameOriginRequestInterceptor } from "./ApiDocsViewer";

beforeEach(() => {
  captured.props = null;
});

describe("ApiDocsViewer", () => {
  it("renders the mobile-auth warning banner", async () => {
    render(<ApiDocsViewer />);
    const banner = screen.getByRole("note", { name: /mobile authentication warning/i });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/UNRESOLVED/);
  });

  /**
   * The specific misunderstanding this page is most likely to cause is a mobile
   * dev seeing "Try it out" succeed and concluding auth is solved for React
   * Native. The banner has to say, in so many words, that it is not.
   */
  it("states that a working Try-it-out does not mean native auth is solved", () => {
    render(<ApiDocsViewer />);
    const banner = screen.getByRole("note", { name: /mobile authentication warning/i });
    expect(banner).toHaveTextContent(/does not mean otherwise/i);
    expect(banner).toHaveTextContent(/session cookie/i);
    expect(banner).toHaveTextContent(/No bearer-token, PKCE/i);
  });

  it("points Swagger UI at the same-origin, gated spec route", async () => {
    render(<ApiDocsViewer />);
    await screen.findByTestId("swagger-ui-stub");
    expect(captured.props?.url).toBe("/api-docs/spec");
  });

  it("passes an interceptor so the session cookie rides along", async () => {
    render(<ApiDocsViewer />);
    await screen.findByTestId("swagger-ui-stub");
    expect(typeof captured.props?.requestInterceptor).toBe("function");
  });
});

describe("sameOriginRequestInterceptor", () => {
  it("forces same-origin credentials on outgoing Try-it-out requests", () => {
    expect(sameOriginRequestInterceptor({ url: "/api/channels" })).toEqual({
      url: "/api/channels",
      credentials: "same-origin",
    });
  });

  it("leaves the rest of the request untouched", () => {
    const req = { url: "/api/channels", method: "POST", headers: { "x-a": "1" } };
    const out = sameOriginRequestInterceptor(req);
    expect(out.method).toBe("POST");
    expect(out.headers).toEqual({ "x-a": "1" });
  });
});
