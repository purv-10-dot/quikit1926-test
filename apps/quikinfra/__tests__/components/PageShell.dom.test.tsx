// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PrimaryButton,
  SecondaryButton,
  PageContainer,
  PageHeader,
  StatusChip,
  EmptyState,
  TabBar,
  UserAvatar,
} from "@/components/PageShell";

describe("PrimaryButton", () => {
  it("renders its children as a button label", () => {
    render(<PrimaryButton>Save</PrimaryButton>);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("fires onClick when clicked", () => {
    const handler = vi.fn();
    render(<PrimaryButton onClick={handler}>Save</PrimaryButton>);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClick when disabled", () => {
    const handler = vi.fn();
    render(
      <PrimaryButton onClick={handler} disabled>
        Save
      </PrimaryButton>,
    );
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(handler).not.toHaveBeenCalled();
  });

  it("defaults to type=button and honours type=submit", () => {
    const { rerender } = render(<PrimaryButton>Go</PrimaryButton>);
    expect(screen.getByRole("button", { name: /go/i })).toHaveAttribute(
      "type",
      "button",
    );
    rerender(<PrimaryButton type="submit">Go</PrimaryButton>);
    expect(screen.getByRole("button", { name: /go/i })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});

describe("SecondaryButton", () => {
  it("renders its children and fires onClick", () => {
    const handler = vi.fn();
    render(<SecondaryButton onClick={handler}>Cancel</SecondaryButton>);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClick when disabled", () => {
    const handler = vi.fn();
    render(
      <SecondaryButton onClick={handler} disabled>
        Cancel
      </SecondaryButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("PageContainer", () => {
  it("renders its children", () => {
    render(
      <PageContainer>
        <p>inner content</p>
      </PageContainer>,
    );
    expect(screen.getByText("inner content")).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders the title and subtitle", () => {
    render(<PageHeader title="Vendors" subtitle="All suppliers" />);
    expect(screen.getByRole("heading", { name: /vendors/i })).toBeInTheDocument();
    expect(screen.getByText("All suppliers")).toBeInTheDocument();
  });

  it("renders breadcrumbs with links and current label", () => {
    render(
      <PageHeader
        title="Detail"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Current" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("fires onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    render(<PageHeader title="Detail" onBack={onBack} />);
    // back button is the only button when no actions are passed
    fireEvent.click(screen.getByRole("button"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders action nodes", () => {
    render(
      <PageHeader title="Detail" actions={<button>New</button>} />,
    );
    expect(screen.getByRole("button", { name: /new/i })).toBeInTheDocument();
  });
});

describe("StatusChip", () => {
  it("humanizes an underscored status into a readable label", () => {
    render(<StatusChip status="pending_approval" />);
    expect(screen.getByText("Pending Approval")).toBeInTheDocument();
  });

  it("falls back to an em-dash for an empty status", () => {
    render(<StatusChip status="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(<EmptyState title="No vendors" description="Add one to begin" />);
    expect(screen.getByRole("heading", { name: /no vendors/i })).toBeInTheDocument();
    expect(screen.getByText("Add one to begin")).toBeInTheDocument();
  });

  it("renders the action node when provided", () => {
    render(<EmptyState title="Empty" action={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });
});

describe("TabBar", () => {
  const tabs = [
    { key: "all", label: "All", count: 3 },
    { key: "open", label: "Open" },
  ];

  it("renders a button for each tab and its count", () => {
    render(<TabBar tabs={tabs} activeTab="all" onTabChange={() => {}} />);
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("fires onTabChange with the tab key when clicked", () => {
    const onTabChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="all" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onTabChange).toHaveBeenCalledWith("open");
  });
});

describe("UserAvatar", () => {
  it("renders the first initial when no src is given", () => {
    render(<UserAvatar name="Bhavna" />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders an img with alt text when a src is given", () => {
    render(<UserAvatar src="/me.png" name="Bhavna" />);
    const img = screen.getByRole("img", { name: /bhavna profile/i });
    expect(img).toHaveAttribute("src", "/me.png");
  });
});
