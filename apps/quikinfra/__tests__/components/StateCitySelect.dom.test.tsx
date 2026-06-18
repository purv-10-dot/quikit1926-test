// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateCitySelect } from "@/components/StateCitySelect";

/**
 * StateCitySelect wraps two portal-based <SelectInput>s (from FormDrawer)
 * fed by the static india-geo data. The portal dropdowns position via
 * getBoundingClientRect (zeroed in jsdom), so these tests assert on the
 * always-rendered trigger labels + the state→city cascade-reset effect,
 * which is the component's real logic.
 */
function setup(overrides: Partial<React.ComponentProps<typeof StateCitySelect>> = {}) {
  const onStateChange = vi.fn();
  const onCityChange = vi.fn();
  const utils = render(
    <StateCitySelect
      state=""
      city=""
      onStateChange={onStateChange}
      onCityChange={onCityChange}
      {...overrides}
    />,
  );
  return { onStateChange, onCityChange, ...utils };
}

describe("StateCitySelect", () => {
  it("renders both the State and City field labels", () => {
    setup();
    expect(screen.getByText("State")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
  });

  it("honours custom field labels", () => {
    setup({ stateLabel: "Origin State", cityLabel: "Origin City" });
    expect(screen.getByText("Origin State")).toBeInTheDocument();
    expect(screen.getByText("Origin City")).toBeInTheDocument();
  });

  it("shows the state placeholder and a disabled city prompt before a state is picked", () => {
    setup();
    expect(screen.getByText("Select state")).toBeInTheDocument();
    expect(screen.getByText("Select state first")).toBeInTheDocument();
  });

  it("renders the chosen state and city in their triggers", () => {
    setup({ state: "Maharashtra", city: "Pune" });
    expect(screen.getByText("Maharashtra")).toBeInTheDocument();
    expect(screen.getByText("Pune")).toBeInTheDocument();
  });

  it("resets the city when the selected state no longer contains it", () => {
    // Gujarat does not contain "Pune" -> the cascade effect wipes the city.
    const { onCityChange } = setup({ state: "Gujarat", city: "Pune" });
    expect(onCityChange).toHaveBeenCalledWith("");
  });

  it("keeps a valid city when it belongs to the selected state", () => {
    const { onCityChange } = setup({ state: "Maharashtra", city: "Pune" });
    expect(onCityChange).not.toHaveBeenCalled();
  });

  it("renders inline (no FormRow grid) when unwrapped", () => {
    const { container } = setup({ unwrapped: true });
    // The FormRow wrapper is a grid; unwrapped mode renders the fields bare.
    expect(container.querySelector(".grid")).toBeNull();
    expect(screen.getByText("State")).toBeInTheDocument();
  });
});
