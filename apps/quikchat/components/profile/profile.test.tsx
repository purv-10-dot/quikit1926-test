import type { PublicUser } from "@/lib/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile, type ProfileTarget } from "./ProfileProvider";

const bob: PublicUser = { id: "u-bob", displayName: "Bob", avatarUrl: null };
const me: PublicUser = { id: "me", displayName: "Me", avatarUrl: null };

function Harness({
  target,
  startDm,
  schedule,
}: {
  target: ProfileTarget;
  startDm?: (id: string) => void;
  schedule?: (id: string) => void;
}) {
  const { openProfile, registerStartDm, registerScheduleWith } = useProfile();
  useEffect(() => {
    if (startDm) registerStartDm(startDm);
    if (schedule) registerScheduleWith(schedule);
    openProfile(target);
  }, [openProfile, registerStartDm, registerScheduleWith, target, startDm, schedule]);
  return null;
}

function renderProfile(
  target: ProfileTarget,
  startDm?: (id: string) => void,
  schedule?: (id: string) => void,
) {
  return render(
    <ProfileProvider currentUserId="me">
      <Harness target={target} startDm={startDm} schedule={schedule} />
    </ProfileProvider>,
  );
}

describe("ProfileProvider / ProfileCard (S14b)", () => {
  it("opens a member profile with presence + role and a Message action", () => {
    renderProfile({ user: bob, roleInChannel: "admin", online: true });
    expect(screen.getByTestId("profile-card")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message" })).toBeInTheDocument();
  });

  it('"Message" triggers the registered DM-start opener', () => {
    const startDm = vi.fn();
    renderProfile({ user: bob }, startDm);
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(startDm).toHaveBeenCalledWith("u-bob");
  });

  it("own profile shows no Message action (read-only, account menu handles self)", () => {
    renderProfile({ user: me });
    expect(screen.getByTestId("profile-card")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
  });

  it('"Schedule meeting" shows only when a scheduler is registered and triggers it (S15a)', () => {
    // No scheduler registered → no action.
    renderProfile({ user: bob });
    expect(screen.queryByRole("button", { name: /Schedule meeting/i })).toBeNull();

    const schedule = vi.fn();
    renderProfile({ user: bob }, undefined, schedule);
    fireEvent.click(screen.getByRole("button", { name: /Schedule meeting/i }));
    expect(schedule).toHaveBeenCalledWith("u-bob");
  });
});
