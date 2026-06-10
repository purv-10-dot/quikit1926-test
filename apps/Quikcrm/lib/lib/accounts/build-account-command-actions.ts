import type { CommandAction } from "@/components/leads/dashboard/command-palette";
import type { TabKey } from "@/components/accounts/account-detail-tabs";

export type AccountCommandGroupId = "communication" | "account" | "workspace";

export function accountCommandGroupLabel(group: AccountCommandGroupId): string {
  const labels: Record<AccountCommandGroupId, string> = {
    communication: "Communication",
    account: "Account actions",
    workspace: "Workspace",
  };
  return labels[group];
}

export type BuildAccountCommandActionsInput = {
  onNavigateTab: (tab: TabKey) => void;
  onClose: () => void;
  onEdit: () => void;
  onAddContact: () => void;
  onAddLead: () => void;
  onNewOpportunity: () => void;
  onAssignLeads: () => void;
  onTask: () => void;
  onLogActivity: () => void;
  onSalesActivity: () => void;
  onAddNote: () => void;
  onViewTrends: () => void;
  onCopyWebsite: () => void;
  canEdit: boolean;
  canAddContact: boolean;
  canAddLead: boolean;
  canNewOpp: boolean;
  canAssignLeads: boolean;
  canLogActivity: boolean;
  hasLeads: boolean;
  hasWebsite: boolean;
  isDeleted: boolean;
};

export function buildAccountCommandActions(
  input: BuildAccountCommandActionsInput,
): CommandAction[] {
  const closeAnd = (fn: () => void) => () => {
    fn();
    input.onClose();
  };
  const tab = (key: TabKey, hint = "Tab") => closeAnd(() => input.onNavigateTab(key));

  if (input.isDeleted) {
    return [
      {
        id: "timeline",
        group: "workspace",
        label: "Open timeline",
        keywords: ["history"],
        hint: "Tab",
        run: tab("timeline"),
      },
    ];
  }

  const actions: CommandAction[] = [
    {
      id: "edit",
      group: "account",
      label: "Edit account",
      keywords: ["edit", "update"],
      run: closeAnd(input.onEdit),
    },
    {
      id: "contact",
      group: "account",
      label: "Add contact",
      keywords: ["contact", "person"],
      run: closeAnd(input.onAddContact),
    },
    {
      id: "lead",
      group: "account",
      label: "Add lead",
      keywords: ["lead", "prospect"],
      run: closeAnd(input.onAddLead),
    },
    {
      id: "opp",
      group: "account",
      label: "New opportunity",
      keywords: ["opportunity", "deal"],
      run: closeAnd(input.onNewOpportunity),
    },
    {
      id: "assign-leads",
      group: "account",
      label: "Assign leads",
      keywords: ["assign", "owner"],
      run: closeAnd(input.onAssignLeads),
    },
    {
      id: "note",
      group: "account",
      label: "Add account note",
      keywords: ["note", "internal", "strategy", "risk", "meeting"],
      run: closeAnd(input.onAddNote),
    },
    {
      id: "task",
      group: "account",
      label: "Create task",
      keywords: ["task", "follow-up"],
      run: closeAnd(input.onTask),
    },
    {
      id: "activity",
      group: "communication",
      label: "Log activity",
      keywords: ["activity", "log"],
      run: closeAnd(input.onLogActivity),
    },
    {
      id: "sales",
      group: "communication",
      label: "Sales activity",
      keywords: ["sales", "touch"],
      run: closeAnd(input.onSalesActivity),
    },
    {
      id: "website",
      group: "communication",
      label: "Copy website URL",
      keywords: ["website", "url", "copy"],
      run: closeAnd(input.onCopyWebsite),
    },
    {
      id: "trends",
      group: "account",
      label: "View score trends",
      keywords: ["health", "engagement", "revenue", "trend", "analytics"],
      hint: "Tab",
      run: closeAnd(input.onViewTrends),
    },
    {
      id: "timeline",
      group: "workspace",
      label: "Open timeline",
      keywords: ["timeline"],
      hint: "Tab",
      run: tab("timeline"),
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
      id: "contacts",
      group: "workspace",
      label: "Open contacts",
      hint: "Tab",
      run: tab("contacts"),
    },
    {
      id: "leads",
      group: "workspace",
      label: "Open leads",
      hint: "Tab",
      run: tab("leads"),
    },
    {
      id: "opportunities",
      group: "workspace",
      label: "Open opportunities",
      hint: "Tab",
      run: tab("opportunities"),
    },
    {
      id: "documents",
      group: "workspace",
      label: "Open documents",
      keywords: ["files", "upload"],
      hint: "Tab",
      run: tab("documents"),
    },
    {
      id: "hierarchy",
      group: "workspace",
      label: "Open hierarchy",
      keywords: ["parent", "subsidiary"],
      hint: "Tab",
      run: tab("hierarchy"),
    },
  ];

  return actions.filter((row) => {
    if (!input.canEdit && row.id === "edit") return false;
    if (!input.canAddContact && row.id === "contact") return false;
    if (!input.canAddLead && row.id === "lead") return false;
    if (!input.canNewOpp && row.id === "opp") return false;
    if ((!input.canAssignLeads || !input.hasLeads) && row.id === "assign-leads") return false;
    if (!input.canLogActivity && (row.id === "activity" || row.id === "sales")) return false;
    if (!input.hasWebsite && row.id === "website") return false;
    if (!input.canEdit && row.id === "note") return false;
    return true;
  });
}
