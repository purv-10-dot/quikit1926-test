// @vitest-environment jsdom
import { Component, type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardError from "@/app/(dashboard)/error";
import RootError from "@/app/error";
import { ErrorFallback } from "@/components/error-fallback";

// REL-01 regression: a render throw must land on a recoverable fallback with a
// working retry, not a white screen.

let shouldThrow = true;

function Boom() {
  if (shouldThrow) throw new Error("child exploded");
  return <div>recovered content</div>;
}

class TestBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <ErrorFallback
          error={this.state.err}
          reset={() => this.setState({ err: null })}
        />
      );
    }
    return this.props.children;
  }
}

describe("REL-01 error boundaries", () => {
  it("dashboard boundary renders a recoverable fallback with a working retry", () => {
    const reset = vi.fn();
    render(
      <DashboardError
        error={Object.assign(new Error("boom"), { digest: "abc123" })}
        reset={reset}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument(); // digest surfaced

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("root boundary also renders the fallback", () => {
    render(<RootError error={new Error("kaboom")} reset={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("catches a throwing child and recovers after retry", () => {
    shouldThrow = true;
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    // The throw was caught — fallback shown instead of a white screen.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("recovered content")).not.toBeInTheDocument();

    // Underlying cause resolved, then retry re-renders the segment successfully.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
