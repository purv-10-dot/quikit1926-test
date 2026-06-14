// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

type Config = React.ComponentProps<typeof QuickCreateDrawer>["config"];

const baseConfig: Config = {
  title: "New Indent",
  subtitle: "Raise a material indent",
  apiEndpoint: "/api/purchase/indents",
  fields: [
    { key: "title", label: "Indent Title", type: "text", required: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

function setup(
  configOverrides: Partial<Config> = {},
  props: Partial<React.ComponentProps<typeof QuickCreateDrawer>> = {},
) {
  const onClose = vi.fn();
  const config = { ...baseConfig, ...configOverrides };
  const utils = render(
    <QuickCreateDrawer open onClose={onClose} config={config} {...props} />,
  );
  return { onClose, config, ...utils };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("QuickCreateDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <QuickCreateDrawer open={false} onClose={() => {}} config={baseConfig} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, subtitle, fields and the Create button when open", () => {
    setup();
    expect(screen.getByText("New Indent")).toBeInTheDocument();
    expect(screen.getByText("Raise a material indent")).toBeInTheDocument();
    expect(screen.getByText("Indent Title")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument();
  });

  it("fires onClose from the Cancel button", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks submit and shows a required-field error when a required field is empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(screen.getByText("Indent Title is required")).toBeInTheDocument(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("typing into a text field updates it and a valid submit POSTs to the apiEndpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ind-1" }),
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", fetchSpy);
    const onSuccess = vi.fn();
    const { onClose } = setup({ onSuccess });

    // The text input is the first input in the body; find it by being a text type.
    const titleInput = document.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Cement order" } });
    expect(titleInput.value).toBe("Cement order");

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/purchase/indents");
    expect(JSON.parse(init.body).title).toBe("Cement order");
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "ind-1" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("renders line-item section with an Add Line button", () => {
    setup({
      lineItems: {
        label: "Material Lines",
        fields: [{ key: "material", label: "Material", type: "text" }],
      },
    });
    expect(screen.getByText("Material Lines")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add line/i })).toBeInTheDocument();
  });

  it("surfaces a server error in the banner when the POST fails", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "Duplicate indent" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    setup();
    const titleInput = document.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(screen.getByText("Duplicate indent")).toBeInTheDocument(),
    );
  });
});
