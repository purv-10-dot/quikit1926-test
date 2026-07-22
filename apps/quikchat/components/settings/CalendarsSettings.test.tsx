import type { CalendarConnectionDto } from "@/lib/shared";
import { ToastProvider } from "@/components/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = { fetchCalendarConnection: vi.fn(), disconnectMicrosoftApi: vi.fn() };
vi.mock("@/lib/api", () => ({
  fetchCalendarConnection: () => api.fetchCalendarConnection(),
  disconnectMicrosoftApi: () => api.disconnectMicrosoftApi(),
  MICROSOFT_CONNECT_URL: "/api/calendar/microsoft/connect",
}));

import { CalendarsSettings } from "./CalendarsSettings";

function conn(over: Partial<CalendarConnectionDto> = {}): CalendarConnectionDto {
  return { provider: "stub", requiresUserConnect: false, connected: false, email: null, ...over };
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CalendarsSettings />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CalendarsSettings (S15b)", () => {
  it("shows a Connect affordance for an unconnected Microsoft provider", async () => {
    api.fetchCalendarConnection.mockResolvedValue(
      conn({ provider: "microsoft", requiresUserConnect: true, connected: false }),
    );
    renderSettings();
    expect(await screen.findByTestId("cal-disconnected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Microsoft/i })).toBeInTheDocument();
  });

  it("shows the connected mailbox + a Disconnect button, and disconnects", async () => {
    api.fetchCalendarConnection.mockResolvedValue(
      conn({
        provider: "microsoft",
        requiresUserConnect: true,
        connected: true,
        email: "a@acme.test",
      }),
    );
    api.disconnectMicrosoftApi.mockResolvedValue({ disconnected: true });
    renderSettings();
    expect(await screen.findByText("a@acme.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(api.disconnectMicrosoftApi).toHaveBeenCalled());
  });

  it("shows a no-connect note for the Google single-account provider", async () => {
    api.fetchCalendarConnection.mockResolvedValue(conn({ provider: "google" }));
    renderSettings();
    expect(await screen.findByTestId("cal-no-connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect/i })).toBeNull();
  });
});
