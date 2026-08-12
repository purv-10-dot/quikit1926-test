import { describe, expect, it } from "vitest";
import {
  computeEngagementPoints,
  computeFitPoints,
  computeLeadScore,
  evaluateLeadScoringRule,
} from "@/lib/services/leads/lead-scoring/compute-score";
import { DEFAULT_LEAD_SCORING_CONFIG } from "@/lib/services/leads/lead-scoring/defaults";
import type {
  LeadScoringContext,
  LeadScoringLeadInput,
} from "@/lib/services/leads/lead-scoring/types";

const baseLead: LeadScoringLeadInput = {
  name: "Acme Corp",
  email: "buyer@acme.com",
  phone: "+911234567890",
  mobile: "+911234567890",
  company: "Acme",
  jobTitle: "VP Sales",
  source: "Referral",
  stage: "Qualified",
  status: "Working",
  substatus: null,
  industry: "SaaS",
  country: "IN",
  leadQuality: null,
  isStarred: true,
  isDisengaged: false,
  followupPriority: "High",
  website: "https://acme.com",
  linkedinUrl: null,
  dynamicFields: null,
};

const baseCtx: LeadScoringContext = {
  activitiesCount: 3,
  callsCount: 2,
  notesCount: 1,
  openTasks: 1,
  lastTouchHours: 12,
  daysSinceCreated: 5,
};

describe("evaluateLeadScoringRule", () => {
  it("matches contains on source", () => {
    expect(
      evaluateLeadScoringRule(
        {
          id: "1",
          enabled: true,
          field: "source",
          operator: "contains",
          value: "referral",
          points: 10,
        },
        baseLead,
      ),
    ).toBe(true);
  });

  it("applies disengaged penalty rule", () => {
    expect(
      evaluateLeadScoringRule(
        {
          id: "2",
          enabled: true,
          field: "isDisengaged",
          operator: "is_true",
          value: true,
          points: -20,
        },
        { ...baseLead, isDisengaged: true },
      ),
    ).toBe(true);
  });
});

describe("computeLeadScore", () => {
  it("clamps total between 0 and 100", () => {
    const result = computeLeadScore(
      baseLead,
      { ...baseCtx, activitiesCount: 50, callsCount: 50 },
      {
        ...DEFAULT_LEAD_SCORING_CONFIG,
        rules: [
          {
            id: "big",
            enabled: true,
            field: "followupPriority",
            operator: "equals",
            value: "High",
            points: 80,
          },
        ],
      },
    );
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThan(0);
  });

  it("adds rule points when conditions match", () => {
    const withoutRules = computeLeadScore(baseLead, baseCtx, DEFAULT_LEAD_SCORING_CONFIG);
    const withRules = computeLeadScore(baseLead, baseCtx, {
      ...DEFAULT_LEAD_SCORING_CONFIG,
      rules: [
        {
          id: "ref",
          enabled: true,
          field: "source",
          operator: "contains",
          value: "referral",
          points: 25,
        },
      ],
    });
    expect(withRules.rulePoints).toBe(25);
    expect(withRules.total).toBeGreaterThan(withoutRules.total);
  });

  it("returns zero when scoring disabled", () => {
    const result = computeLeadScore(baseLead, baseCtx, {
      ...DEFAULT_LEAD_SCORING_CONFIG,
      enabled: false,
    });
    expect(result.total).toBe(0);
  });
});

describe("baseline components", () => {
  it("rewards profile completeness", () => {
    expect(computeFitPoints(baseLead)).toBeGreaterThan(20);
  });

  it("rewards recent engagement", () => {
    const hot = computeEngagementPoints(baseLead, baseCtx);
    const cold = computeEngagementPoints(baseLead, {
      ...baseCtx,
      activitiesCount: 0,
      callsCount: 0,
      lastTouchHours: 20 * 24,
    });
    expect(hot).toBeGreaterThan(cold);
  });
});
