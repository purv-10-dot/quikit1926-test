// Re-export common utils from shared package
export {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeDate,
  generateInitials,
  slugify,
  isValidEmail,
  truncateText,
} from "@quikit/ui";

// ─── QuikScale-specific utils (not in @quikit/ui) ───────────────────────────

export function calculateProgress(achieved: number, goal: number): number {
  if (!goal || goal === 0) return 0;
  return Math.min(Math.round((achieved / goal) * 100), 100);
}

export function getQuarterFromMonth(month: number): "Q1" | "Q2" | "Q3" | "Q4" {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

export function getMonthsForQuarter(quarter: string): number[] {
  switch (quarter) {
    case "Q1": return [1, 2, 3];
    case "Q2": return [4, 5, 6];
    case "Q3": return [7, 8, 9];
    case "Q4": return [10, 11, 12];
    default: return [];
  }
}

export function getCurrentQuarter(): "Q1" | "Q2" | "Q3" | "Q4" {
  return getQuarterFromMonth(new Date().getMonth() + 1);
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function getCurrentWeek(): number {
  const firstDayOfYear = new Date(new Date().getFullYear(), 0, 1);
  const pastDaysOfYear =
    (new Date().getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function hasOwnProperty<T extends object>(
  obj: T,
  prop: PropertyKey
): prop is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error("Retry failed");
}
