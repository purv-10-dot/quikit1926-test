// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DPRWeatherMetrics } from "@/components/DPRWeatherMetrics";
import type { DprWeatherDetail } from "@/lib/weather/dpr-weather";

function detail(over: Partial<DprWeatherDetail> = {}): DprWeatherDetail {
  return {
    tempMaxC: 34,
    tempMinC: 22,
    precipitationMm: 5,
    windMaxKmh: 18,
    weatherCode: 1,
    source: "openmeteo_forecast",
    ...over,
  };
}

describe("DPRWeatherMetrics", () => {
  it("renders nothing when detail is null", () => {
    const { container } = render(<DPRWeatherMetrics detail={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders temperature range, rainfall and wind from the detail", () => {
    render(<DPRWeatherMetrics detail={detail()} />);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("22°C – 34°C")).toBeInTheDocument();
    expect(screen.getByText("Rainfall")).toBeInTheDocument();
    expect(screen.getByText("5 mm")).toBeInTheDocument();
    expect(screen.getByText("Wind max")).toBeInTheDocument();
    expect(screen.getByText("18 km/h")).toBeInTheDocument();
  });

  it("shows 'Temp max' when only the high is present", () => {
    render(
      <DPRWeatherMetrics
        detail={detail({ tempMinC: null, precipitationMm: null, windMaxKmh: null })}
      />,
    );
    expect(screen.getByText("Temp max")).toBeInTheDocument();
    expect(screen.getByText("34°C")).toBeInTheDocument();
    expect(screen.queryByText("Rainfall")).not.toBeInTheDocument();
  });

  it("renders nothing when every metric is null", () => {
    const { container } = render(
      <DPRWeatherMetrics
        detail={detail({
          tempMaxC: null,
          tempMinC: null,
          precipitationMm: null,
          windMaxKmh: null,
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("applies a custom className on the grid wrapper", () => {
    const { container } = render(
      <DPRWeatherMetrics detail={detail()} className="mt-4" />,
    );
    expect(container.firstChild).toHaveClass("mt-4");
  });
});
