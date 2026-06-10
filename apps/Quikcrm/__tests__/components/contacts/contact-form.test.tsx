// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ContactForm } from "@/components/contacts/contact-form";

// Vitest doesn't auto-cleanup React Testing Library renders the way Jest does,
// so explicit cleanup keeps duplicate testids from leaking across test cases.
afterEach(() => {
  cleanup();
});

const ACCOUNTS = [{ id: "a1", label: "Acme Corp" }];
const OWNERS = [{ id: "u1", label: "Alice" }];

describe("<ContactForm>", () => {
  it("blocks submission when first/last name are missing", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <ContactForm
        mode="create"
        accountOptions={ACCOUNTS}
        ownerOptions={OWNERS}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
  });

  it("submits trimmed values when valid", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <ContactForm
        mode="create"
        accountOptions={ACCOUNTS}
        ownerOptions={OWNERS}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByTestId("contact-form-first-name"), {
      target: { value: "  John  " },
    });
    fireEvent.change(screen.getByTestId("contact-form-last-name"), {
      target: { value: "Doe" },
    });
    fireEvent.change(screen.getByTestId("contact-form-email"), {
      target: { value: "john@acme.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      firstName: "John",
      lastName: "Doe",
      email: "john@acme.test",
    });
  });

  it("renders a read-only banner and hides the submit button when readOnly is true", () => {
    render(
      <ContactForm
        mode="edit"
        readOnly
        accountOptions={ACCOUNTS}
        ownerOptions={OWNERS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/you don't have permission to edit contacts/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).toBeNull();
  });

  it("maps server fieldErrors.email to the email field and shows the open-existing link on duplicate", () => {
    render(
      <ContactForm
        mode="create"
        serverError={{
          formError: "A contact with this email already exists.",
          fieldErrors: { email: "A contact with this email already exists." },
          existingId: "c-99",
        }}
        accountOptions={ACCOUNTS}
        ownerOptions={OWNERS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getAllByText(/a contact with this email already exists/i).length,
    ).toBeGreaterThan(0);
    const link = screen.getByRole("link", { name: /open existing contact/i });
    expect(link.getAttribute("href")).toBe("/contacts/c-99");
  });
});
