import { KPI_HEALTH_STATUS, PRIORITY_STATUS, WWW_STATUS, KPIHealthStatus } from "./constants";

type ColorType = "green" | "yellow" | "red" | "blue" | "gray";

type StatusKey =
  | (typeof KPI_HEALTH_STATUS)[keyof typeof KPI_HEALTH_STATUS]
  | (typeof PRIORITY_STATUS)[keyof typeof PRIORITY_STATUS]
  | (typeof WWW_STATUS)[keyof typeof WWW_STATUS];

export const statusColors: Record<StatusKey, ColorType> = {
  // KPI Health Status
  "on-track": "green",
  "behind-schedule": "yellow",
  critical: "red",
  "not-started": "gray",
  complete: "blue",

  // Priority Status (overlaps with above)
  // WWW Status (overlaps with above)
  "in-progress": "blue",
  blocked: "red",
};

export const statusTailwindClasses: Record<ColorType, string> = {
  green: "bg-status-on-track text-white",
  yellow: "bg-status-behind text-black",
  red: "bg-status-critical text-white",
  blue: "bg-status-complete text-white",
  gray: "bg-status-not-started text-black",
};

export const statusBorderClasses: Record<ColorType, string> = {
  green: "border-status-on-track",
  yellow: "border-status-behind",
  red: "border-status-critical",
  blue: "border-status-complete",
  gray: "border-status-not-started",
};

export const statusTextClasses: Record<ColorType, string> = {
  green: "text-status-on-track",
  yellow: "text-status-behind",
  red: "text-status-critical",
  blue: "text-status-complete",
  gray: "text-status-not-started",
};

export function getColorForStatus(
  status: StatusKey
): ColorType {
  return statusColors[status] || "gray";
}

export function getTailwindClassForStatus(
  status: StatusKey
): string {
  const color = getColorForStatus(status);
  return statusTailwindClasses[color];
}

export function getBorderClassForStatus(
  status: StatusKey
): string {
  const color = getColorForStatus(status);
  return statusBorderClasses[color];
}

export function getTextClassForStatus(
  status: StatusKey
): string {
  const color = getColorForStatus(status);
  return statusTextClasses[color];
}

// Progress bar color based on percentage
export function getProgressColor(percent: number): ColorType {
  if (percent >= 100) return "green";
  if (percent >= 80) return "yellow";
  if (percent >= 60) return "red";
  return "red";
}
