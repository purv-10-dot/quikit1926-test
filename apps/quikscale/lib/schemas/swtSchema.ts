import { z } from "zod";

export type SWTType = "strength" | "weakness" | "trend";
export type TrendDirection = "positive" | "negative" | "neutral";

export const SWT_TYPE_CONFIG = {
  strength: {
    label: "Strengths",
    description: "Internal competitive advantages",
    color: "green",
    bg: "bg-green-50",
    border: "border-green-200",
    headerBg: "bg-green-100",
    headerText: "text-green-800",
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
    dotColor: "bg-green-500",
  },
  weakness: {
    label: "Weaknesses",
    description: "Internal areas to improve",
    color: "red",
    bg: "bg-red-50",
    border: "border-red-200",
    headerBg: "bg-red-100",
    headerText: "text-red-800",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    dotColor: "bg-red-500",
  },
  trend: {
    label: "Trends",
    description: "External forces & market shifts",
    color: "blue",
    bg: "bg-blue-50",
    border: "border-blue-200",
    headerBg: "bg-blue-100",
    headerText: "text-blue-800",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
  },
} as const;

export const TREND_DIRECTION_CONFIG = {
  positive: { label: "Positive", bg: "bg-green-100", text: "text-green-700" },
  negative: { label: "Negative", bg: "bg-red-100",   text: "text-red-700"   },
  neutral:  { label: "Neutral",  bg: "bg-gray-100",  text: "text-gray-600"  },
} as const;

// ─── Trend categories from the book ───────────────────────────────────────────
export const TREND_CATEGORIES = ["technology", "distribution", "product", "markets", "consumer", "social"] as const;
export type TrendCategory = (typeof TREND_CATEGORIES)[number];

export const TREND_CATEGORY_CONFIG: Record<TrendCategory, { label: string; bg: string; text: string }> = {
  technology:   { label: "Technology",        bg: "bg-indigo-100", text: "text-indigo-700" },
  distribution: { label: "Distribution",      bg: "bg-teal-100",   text: "text-teal-700" },
  product:      { label: "Product Innovation",bg: "bg-purple-100", text: "text-purple-700" },
  markets:      { label: "Markets",           bg: "bg-blue-100",   text: "text-blue-700" },
  consumer:     { label: "Consumer",          bg: "bg-amber-100",  text: "text-amber-700" },
  social:       { label: "Social",            bg: "bg-rose-100",   text: "text-rose-700" },
};

// Contextual "impact / why" label per type — mirrors the Scaling Up book prompts.
export const IMPACT_LABEL: Record<SWTType, string> = {
  strength: "Why is this a source of your success?",
  weakness: "Why is this unlikely to change?",
  trend:    "How does this impact your industry/organization?",
};

// The book questions themselves, for section subtitles.
export const BOOK_QUESTION: Record<SWTType, string> = {
  strength: "What are the inherent strengths of the organization that have been the source of your success?",
  weakness: "What are the inherent weaknesses of the organization that aren't likely to change?",
  trend:    "What are the significant changes in technology, distribution, product innovation, markets, consumer, and social trends around the world that might impact your industry and organization?",
};

export const createSWTEntrySchema = z.object({
  quarter:        z.string().min(1),
  year:           z.number().int().min(2020).max(2035),
  type:           z.enum(["strength", "weakness", "trend"]),
  content:        z.string().min(1).max(500),
  /// Optional "why / impact" context — see IMPACT_LABEL for the contextual prompt.
  impact:         z.string().max(2000).optional().nullable(),
  /// Trends only — one of TREND_CATEGORIES.
  category:       z.enum(TREND_CATEGORIES).optional().nullable(),
  trendDirection: z.enum(["positive", "negative", "neutral"]).optional().nullable(),
  sortOrder:      z.number().int().min(0).optional(),
});

export const updateSWTEntrySchema = createSWTEntrySchema.partial().omit({ quarter: true, year: true, type: true }).extend({
  content:        z.string().min(1).max(500).optional(),
  impact:         z.string().max(2000).optional().nullable(),
  category:       z.enum(TREND_CATEGORIES).optional().nullable(),
  trendDirection: z.enum(["positive", "negative", "neutral"]).optional().nullable(),
  sortOrder:      z.number().int().min(0).optional(),
});

export type CreateSWTEntryInput = z.infer<typeof createSWTEntrySchema>;
export type UpdateSWTEntryInput = z.infer<typeof updateSWTEntrySchema>;
