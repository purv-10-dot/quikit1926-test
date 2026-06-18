// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";

// Mock toast so error paths don't blow up and we can assert on them.
// `vi.hoisted` lets the spy exist before the hoisted vi.mock factory runs.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: toastError, success: vi.fn() },
  entityMeta: () => ({}),
}));

import { WhitebooksVendorSelect } from "@/components/WhitebooksVendorSelect";

const vendorOptions = [
  { value: "v1", label: "Acme Steel" },
  { value: "v2", label: "Bharat Cement" },
];
const vendorById = new Map<string, any>([
  ["v1", { companyName: "Acme Steel", email: "acme@test.io", gstin: "" }],
  ["v2", { companyName: "Bharat Cement", email: "bharat@test.io", gstin: "27AAAAA0000A1Z5" }],
]);

function setup(over: Partial<React.ComponentProps<typeof WhitebooksVendorSelect>> = {}) {
  const update = vi.fn();
  render(
    <WhitebooksVendorSelect
      line={{ vendorId: "" }}
      update={update}
      vendorOptions={vendorOptions}
      vendorById={vendorById}
      {...over}
    />,
    { wrapper: TestProviders },
  );
  return { update };
}

beforeEach(() => {
  toastError.mockClear();
});

describe("WhitebooksVendorSelect", () => {
  it("renders the vendor combobox placeholder", () => {
    // GST verify disabled → no fetch needed beyond the config probe.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { gstVerifyEnabled: false } }),
      })),
    );
    setup();
    expect(screen.getByText("Select vendor…")).toBeInTheDocument();
  });

  it("opens the dropdown and lists vendor options", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { gstVerifyEnabled: false } }),
      })),
    );
    setup();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Acme Steel")).toBeInTheDocument();
    expect(screen.getByText("Bharat Cement")).toBeInTheDocument();
  });

  it("picking a vendor (GST verify off) calls update with id + email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/config")) {
          return { ok: true, json: async () => ({ ok: true, data: { gstVerifyEnabled: false } }) } as any;
        }
        // vendor-gst verify endpoint
        return { ok: true, json: async () => ({ ok: true, data: { active: true } }) } as any;
      }),
    );
    const { update } = setup();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Acme Steel"));
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith({ vendorId: "v1", email: "acme@test.io" });
    });
  });

  it("clearing the selection (empty value) resets vendorId + email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { gstVerifyEnabled: false } }),
      })),
    );
    // Start with a selected vendor so the Clear (×) affordance shows.
    const { update } = setup({ line: { vendorId: "v1" } });
    const clear = screen.getByTitle("Clear");
    fireEvent.click(clear);
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith({ vendorId: "", email: "" });
    });
  });

  it("with GST verify ON, picking a vendor missing a GSTIN toasts and resets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { gstVerifyEnabled: true } }),
      })),
    );
    const { update } = setup();
    // wait for config to mark gstVerifyEnabled = true
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Acme Steel")); // v1 has empty gstin
    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({ vendorId: "", email: "" });
    });
  });
});
