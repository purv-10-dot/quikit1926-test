import type { CommandAction } from "@/components/leads/dashboard/command-palette";
import type { TabKey } from "@/components/leads/lead-detail-tabs";

export type CommandGroupId = "communication" | "lead" | "ai" | "workspace";

const GROUP_LABEL: Record<CommandGroupId, string> = {
  communication: "Communication",
  lead: "Lead actions",
  ai: "AI assist",
  workspace: "Workspace",
};

export function commandGroupLabel(group: CommandGroupId): string {
  return GROUP_LABEL[group];
}

export type BuildLeadCommandActionsInput = {
  onNavigateTab: (tab: TabKey) => void;
  onClose: () => void;
  onQuickEdit: () => void;
  onCall: () => void;
  onWhatsApp: () => void;
  onComposeEmail: () => void;
  onCopyPhone: () => void;
  onCopyEmail: () => void;
  onScheduleFollowUp: () => void;
  onLogActivity: () => void;
  onAddMeeting: () => void;
  onCreateTask: () => void;
  onAddNote: () => void;
  onUploadDocument: () => void;
  onConvert: () => void;
  onToggleStar: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onChangeOwner: () => void;
  onChangeStage: () => void;
  onChangeStatus: () => void;
  onAiSummarize: () => void;
  onAiSuggestNext: () => void;
  onAiFollowUpEmail: () => void;
  onAiAnalyzeHealth: () => void;
  onAiPredictConversion: () => void;
  canEdit: boolean;
  canLogActivity: boolean;
  canCall: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  isStarred: boolean;
  linkedContactId?: string | null;
  isTrashed: boolean;
};

export function buildLeadCommandActions(input: BuildLeadCommandActionsInput): CommandAction[] {
  const closeAnd = (fn: () => void) => () => {
    fn();
    input.onClose();
  };
  const tab = (key: TabKey, hint = "Tab") =>
    closeAnd(() => input.onNavigateTab(key));

  if (input.isTrashed) {
    return [
      {
        id: "timeline",
        group: "workspace",
        label: "Open timeline",
        keywords: ["history", "activity"],
        hint: "Tab",
        run: tab("timeline"),
      },
    ];
  }

  const actions: CommandAction[] = [
    // Communication
    {
      id: "whatsapp",
      group: "communication",
      label: "Send WhatsApp",
      keywords: ["whatsapp", "wa", "message", "chat"],
      run: closeAnd(input.onWhatsApp),
    },
    {
      id: "email-compose",
      group: "communication",
      label: "Compose email",
      keywords: ["email", "compose", "mail", "send email"],
      run: closeAnd(input.onComposeEmail),
    },
    {
      id: "copy-phone",
      group: "communication",
      label: "Copy phone",
      keywords: ["phone", "mobile", "copy", "clipboard", "number"],
      run: closeAnd(input.onCopyPhone),
    },
    {
      id: "copy-email",
      group: "communication",
      label: "Copy email",
      keywords: ["email", "copy", "clipboard", "address"],
      run: closeAnd(input.onCopyEmail),
    },
    {
      id: "follow-up",
      group: "communication",
      label: "Schedule follow-up",
      keywords: ["follow-up", "followup", "schedule", "reminder", "task"],
      run: closeAnd(input.onScheduleFollowUp),
    },
    {
      id: "call",
      group: "communication",
      label: "Start call",
      keywords: ["phone", "dial", "telephony", "call"],
      run: closeAnd(input.onCall),
    },
    {
      id: "activity",
      group: "communication",
      label: "Log activity",
      keywords: ["log", "touchpoint", "activity"],
      run: closeAnd(input.onLogActivity),
    },
    {
      id: "meeting",
      group: "communication",
      label: "Add meeting",
      keywords: ["meeting", "calendar", "schedule", "demo"],
      run: closeAnd(input.onAddMeeting),
    },
    // Lead actions
    {
      id: "star",
      group: "lead",
      label: input.isStarred ? "Unstar lead" : "Star lead",
      keywords: ["star", "favorite", "important", "bookmark"],
      run: closeAnd(input.onToggleStar),
    },
    {
      id: "mark-won",
      group: "lead",
      label: "Mark won",
      keywords: ["won", "closed won", "convert", "success", "deal"],
      run: closeAnd(input.onMarkWon),
    },
    {
      id: "mark-lost",
      group: "lead",
      label: "Mark lost",
      keywords: ["lost", "closed lost", "disqualified", "dead"],
      run: closeAnd(input.onMarkLost),
    },
    {
      id: "change-owner",
      group: "lead",
      label: "Change owner",
      keywords: ["owner", "assign", "rep", "salesperson"],
      run: closeAnd(input.onChangeOwner),
    },
    {
      id: "change-stage",
      group: "lead",
      label: "Change stage",
      keywords: ["stage", "pipeline", "step"],
      run: closeAnd(input.onChangeStage),
    },
    {
      id: "change-status",
      group: "lead",
      label: "Change status",
      keywords: ["status", "working", "open", "closed"],
      run: closeAnd(input.onChangeStatus),
    },
    {
      id: "edit",
      group: "lead",
      label: "Quick edit lead",
      keywords: ["edit", "update", "fields"],
      run: closeAnd(input.onQuickEdit),
    },
    {
      id: "task",
      group: "lead",
      label: "Create task",
      keywords: ["task", "todo"],
      run: closeAnd(input.onCreateTask),
    },
    {
      id: "note",
      group: "lead",
      label: "Add note",
      keywords: ["note", "notes"],
      run: closeAnd(input.onAddNote),
    },
    {
      id: "upload",
      group: "lead",
      label: "Upload document",
      keywords: ["upload", "document", "file"],
      run: closeAnd(input.onUploadDocument),
    },
    {
      id: "convert",
      group: "lead",
      label: "Convert lead",
      keywords: ["convert", "contact", "opportunity"],
      run: closeAnd(input.onConvert),
    },
    // AI assist (rule-based intelligence — no external LLM)
    {
      id: "ai-summarize",
      group: "ai",
      label: "Summarize lead",
      keywords: ["ai", "summary", "summarize", "overview"],
      hint: "Signals",
      run: closeAnd(input.onAiSummarize),
    },
    {
      id: "ai-suggest",
      group: "ai",
      label: "Suggest next action",
      keywords: ["ai", "suggest", "recommend", "next", "action"],
      hint: "Signals",
      run: closeAnd(input.onAiSuggestNext),
    },
    {
      id: "ai-email",
      group: "ai",
      label: "Generate follow-up email",
      keywords: ["ai", "email", "draft", "follow-up", "template"],
      hint: "Draft",
      run: closeAnd(input.onAiFollowUpEmail),
    },
    {
      id: "ai-health",
      group: "ai",
      label: "Analyze lead health",
      keywords: ["ai", "health", "risk", "engagement", "analyze"],
      hint: "Signals",
      run: closeAnd(input.onAiAnalyzeHealth),
    },
    {
      id: "ai-conversion",
      group: "ai",
      label: "Predict conversion",
      keywords: ["ai", "conversion", "probability", "forecast", "predict"],
      hint: "Signals",
      run: closeAnd(input.onAiPredictConversion),
    },
    // Workspace navigation
    {
      id: "timeline",
      group: "workspace",
      label: "Open timeline",
      keywords: ["timeline", "history"],
      hint: "Tab",
      run: tab("timeline"),
    },
    {
      id: "comms",
      group: "workspace",
      label: "Communication center",
      keywords: ["communications", "inbox"],
      hint: "Tab",
      run: tab("communications"),
    },
    {
      id: "tasks",
      group: "workspace",
      label: "Open tasks",
      keywords: ["tasks"],
      hint: "Tab",
      run: tab("tasks"),
    },
    {
      id: "notes",
      group: "workspace",
      label: "Open notes",
      keywords: ["notes"],
      hint: "Tab",
      run: tab("notes"),
    },
    {
      id: "documents",
      group: "workspace",
      label: "Open documents",
      keywords: ["documents", "files"],
      hint: "Tab",
      run: tab("documents"),
    },
    {
      id: "analytics",
      group: "workspace",
      label: "Open analytics",
      keywords: ["analytics", "charts", "intelligence"],
      hint: "Tab",
      run: tab("analytics"),
    },
  ];

  return actions.filter((row) => {
    if (!input.canCall && row.id === "call") return false;
    if (!input.hasPhone && (row.id === "copy-phone" || row.id === "whatsapp")) return false;
    if (!input.hasEmail && row.id === "copy-email") return false;
    if (!input.canLogActivity && (row.id === "activity" || row.id === "meeting")) return false;
    if (
      !input.canEdit &&
      [
        "edit",
        "task",
        "note",
        "upload",
        "convert",
        "star",
        "mark-won",
        "mark-lost",
        "change-owner",
        "change-stage",
        "change-status",
        "follow-up",
      ].includes(row.id)
    ) {
      return false;
    }
    if (input.linkedContactId && row.id === "convert") return false;
    return true;
  });
}
