import { describe, expect, it, vi } from "vitest";
import {
  clampCommandIndex,
  stepCommandIndex,
} from "@/components/leads/dashboard/command-palette";
import { buildLeadCommandActions } from "@/lib/leads/build-lead-command-actions";
import { resolvePipelineStage } from "@/lib/leads/pipeline-stage-resolve";
import { buildLeadSummarySnippet } from "@/lib/leads/command-ai-snippets";

function build(overrides: Partial<Parameters<typeof buildLeadCommandActions>[0]> = {}) {
  return buildLeadCommandActions({
    onNavigateTab: vi.fn(),
    onClose: vi.fn(),
    onQuickEdit: vi.fn(),
    onCall: vi.fn(),
    onWhatsApp: vi.fn(),
    onComposeEmail: vi.fn(),
    onCopyPhone: vi.fn(),
    onCopyEmail: vi.fn(),
    onScheduleFollowUp: vi.fn(),
    onLogActivity: vi.fn(),
    onAddMeeting: vi.fn(),
    onCreateTask: vi.fn(),
    onAddNote: vi.fn(),
    onUploadDocument: vi.fn(),
    onConvert: vi.fn(),
    onToggleStar: vi.fn(),
    onMarkWon: vi.fn(),
    onMarkLost: vi.fn(),
    onChangeOwner: vi.fn(),
    onChangeStage: vi.fn(),
    onChangeStatus: vi.fn(),
    onAiSummarize: vi.fn(),
    onAiSuggestNext: vi.fn(),
    onAiFollowUpEmail: vi.fn(),
    onAiAnalyzeHealth: vi.fn(),
    onAiPredictConversion: vi.fn(),
    canEdit: true,
    canLogActivity: true,
    canCall: true,
    hasPhone: true,
    hasEmail: true,
    isStarred: false,
    isTrashed: false,
    ...overrides,
  });
}

describe("buildLeadCommandActions", () => {
  it("includes communication, lead, and AI commands", () => {
    const actions = build();
    const labels = actions.map((a) => a.label);
    // "Send WhatsApp" was removed from the palette (no row, no onWhatsApp
    // handler, orphaned modal). The WhatsApp comms-center tab is a separate,
    // still-live feature.
    expect(labels).toContain("Convert lead");
    expect(labels).toContain("Summarize lead");
    expect(labels).toContain("Mark won");
  });

  it("finds convert via keyword search", () => {
    const actions = build();
    const filtered = actions.filter((a) => {
      const needle = "convert";
      if (a.label.toLowerCase().includes(needle)) return true;
      return (a.keywords ?? []).some((k) => k.toLowerCase().includes(needle));
    });
    expect(filtered.some((a) => a.id === "convert")).toBe(true);
  });

  it("hides convert when lead already linked to a contact", () => {
    const actions = build({ linkedContactId: "contact-1" });
    expect(actions.find((a) => a.id === "convert")).toBeUndefined();
  });

  it("hides edit actions when trashed", () => {
    const actions = build({ isTrashed: true });
    expect(actions.find((a) => a.id === "convert")).toBeUndefined();
    expect(actions.find((a) => a.id === "timeline")).toBeDefined();
  });
});

describe("command palette keyboard index", () => {
  it("clamps selection when list shrinks", () => {
    expect(clampCommandIndex(5, 3)).toBe(2);
    expect(clampCommandIndex(0, 0)).toBe(0);
  });

  it("steps up and down within bounds", () => {
    expect(stepCommandIndex(0, "down", 4)).toBe(1);
    expect(stepCommandIndex(3, "down", 4)).toBe(3);
    expect(stepCommandIndex(2, "up", 4)).toBe(1);
    expect(stepCommandIndex(0, "up", 4)).toBe(0);
  });
});

describe("resolvePipelineStage", () => {
  it("resolves won and lost from tenant stage labels", () => {
    const stages = ["New", "Contacted", "Closed Won", "Closed Lost"];
    expect(resolvePipelineStage(stages, "won")).toBe("Closed Won");
    expect(resolvePipelineStage(stages, "lost")).toBe("Closed Lost");
  });
});

describe("command AI snippets", () => {
  it("builds a summary with health and recommendation", () => {
    const text = buildLeadSummarySnippet({
      name: "Acme",
      company: "Acme Co",
      stage: "Proposal",
      status: "Open",
      source: "Web",
      ownerName: "Rep",
      score: 40,
      insights: {
        healthScore: 50,
        engagementScore: 60,
        conversionProbability: 55,
        lastResponseHours: 2,
        recommendedAction: "Call today",
        riskLevel: "low",
      },
      activitiesCount: 3,
      openTasks: 1,
    });
    expect(text).toContain("Acme");
    expect(text).toContain("Call today");
    expect(text).toContain("Health 50%");
  });
});
