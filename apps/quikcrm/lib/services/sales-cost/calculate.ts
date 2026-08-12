/**
 * Pure cost math for Sales Cost Management. No DB, no session — every function
 * here is a total function over plain numbers so the arithmetic can be unit
 * tested without a database.
 *
 *   total monthly cost = salary + allocated tool costs + other costs
 *   cost per X         = total monthly cost / (that rep's count of X)
 *
 * The counts come from existing CRM records (see ./counts.ts); nothing in this
 * module knows how they were obtained.
 */

/** One tool's contribution to a rep's monthly cost, for the UI table. */
export interface ToolCostLine {
  allocationId: string;
  toolId: string;
  toolName: string;
  vendor: string | null;
  category: string | null;
  /** The tool's full invoice amount, as entered. */
  toolCost: number;
  billingFrequency: string;
  /** `toolCost` amortised to a month (annual/12, quarterly/3, one_time → 0). */
  toolMonthlyCost: number;
  /** This rep's share, 0.01–100. */
  percentage: number;
  /** `toolMonthlyCost * percentage / 100` — what this rep actually carries. */
  allocatedMonthlyCost: number;
  active: boolean;
  currency: string;
}

/** One non-salary, non-tool cost line. */
export interface OtherCostLine {
  id: string;
  label: string;
  monthlyAmount: number;
  currency: string;
  notes: string | null;
}

/** The four CRM record counts a rep's cost is divided by. */
export interface RepCounts {
  leads: number;
  prospects: number;
  opportunities: number;
  wonDeals: number;
}

/**
 * Cost per record. `null` — never Infinity or NaN — when the count is zero,
 * because "no leads yet" has no defined cost per lead. The UI renders null as
 * an em dash; a 0 or an Infinity would both read as a real figure.
 */
export interface CostEfficiency {
  costPerLead: number | null;
  costPerProspect: number | null;
  costPerOpportunity: number | null;
  costPerWonDeal: number | null;
}

/** Everything the Sales Cost page shows for one rep in one period. */
export interface RepCostBreakdown {
  userId: string;
  userName: string;
  /** `YYYY-MM`. */
  period: string;
  currency: string;
  salary: number;
  toolsCost: number;
  otherCost: number;
  totalMonthlyCost: number;
  tools: ToolCostLine[];
  otherCosts: OtherCostLine[];
  counts: RepCounts;
  efficiency: CostEfficiency;
}

/**
 * Round to 2 decimal places, the precision money is stored at
 * (Decimal(18,2)). Applied at every boundary where a derived figure is
 * returned so a repeating amortisation (₹8,000/3) doesn't leak float noise into
 * the response, and so `salary + tools + other` equals the displayed total
 * rather than being off by a fraction of a paisa.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Divide safely. Returns null when the divisor is zero or either side is not a
 * usable finite number — this is the single guard that keeps Infinity and NaN
 * out of the API response, per the zero-count requirement.
 */
export function safeDivide(total: number, count: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(count)) return null;
  if (count <= 0) return null;
  return round2(total / count);
}

/**
 * A rep's share of one tool: the tool's monthly cost times their allocation
 * percentage.
 *
 * This is where shared tools stop being double-counted. The tool row holds the
 * TOTAL (₹16,000); each rep is charged only `percentage` of it, so a 50/50
 * split bills ₹8,000 twice rather than ₹16,000 twice. Allocations are validated
 * on write to sum to ≤ 100 for any overlapping period, so the sum of all reps'
 * shares can never exceed the tool's real cost.
 */
export function allocatedCost(toolMonthlyCost: number, percentage: number): number {
  if (!Number.isFinite(toolMonthlyCost) || !Number.isFinite(percentage)) return 0;
  return round2((toolMonthlyCost * percentage) / 100);
}

/** Sum of the allocated shares of every tool line. */
export function sumToolCosts(tools: ToolCostLine[]): number {
  return round2(tools.reduce((acc, t) => acc + t.allocatedMonthlyCost, 0));
}

/** Sum of the other-cost lines. */
export function sumOtherCosts(lines: OtherCostLine[]): number {
  return round2(lines.reduce((acc, l) => acc + l.monthlyAmount, 0));
}

/** salary + tools + other. */
export function totalMonthlyCost(
  salary: number,
  toolsCost: number,
  otherCost: number,
): number {
  return round2((salary || 0) + (toolsCost || 0) + (otherCost || 0));
}

/**
 * The four cost-per-record figures. Every one is `safeDivide`d, so a rep with
 * no won deals gets `costPerWonDeal: null` rather than Infinity.
 */
export function computeEfficiency(total: number, counts: RepCounts): CostEfficiency {
  return {
    costPerLead: safeDivide(total, counts.leads),
    costPerProspect: safeDivide(total, counts.prospects),
    costPerOpportunity: safeDivide(total, counts.opportunities),
    costPerWonDeal: safeDivide(total, counts.wonDeals),
  };
}

/**
 * Assemble a full breakdown from already-resolved parts. Kept separate from the
 * DB layer so the whole calculation is testable with literals.
 */
export function buildBreakdown(input: {
  userId: string;
  userName: string;
  period: string;
  currency: string;
  salary: number;
  tools: ToolCostLine[];
  otherCosts: OtherCostLine[];
  counts: RepCounts;
}): RepCostBreakdown {
  const salary = round2(input.salary || 0);
  const toolsCost = sumToolCosts(input.tools);
  const otherCost = sumOtherCosts(input.otherCosts);
  const total = totalMonthlyCost(salary, toolsCost, otherCost);

  return {
    userId: input.userId,
    userName: input.userName,
    period: input.period,
    currency: input.currency,
    salary,
    toolsCost,
    otherCost,
    totalMonthlyCost: total,
    tools: input.tools,
    otherCosts: input.otherCosts,
    counts: input.counts,
    efficiency: computeEfficiency(total, input.counts),
  };
}
