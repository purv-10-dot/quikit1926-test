import type { CommandAction } from "@/components/leads/dashboard/command-palette";
import type { TabKey } from "@/components/contacts/contact-detail-tabs";

export type ContactCommandGroupId = "communication" | "contact" | "workspace";

export function contactCommandGroupLabel(group: ContactCommandGroupId): string {
  const labels: Record<ContactCommandGroupId, string> = {
    communication: "Communication",
    contact: "Contact actions",
    workspace: "Workspace",
  };
  return labels[group];
}

export type BuildContactCommandActionsInput = {
  onNavigateTab: (tab: TabKey) => void;
  onClose: () => void;
  onEdit: () => void;
  onTask: () => void;
  onLogActivity: () => void;
  onAddNote: () => void;
  onNewOpportunity: () => void;
  onCopyEmail: () => void;
  onCopyPhone: () => void;
  canEdit: boolean;
  canLogActivity: boolean;
  canNewOpp: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  isDeleted: boolean;
};

export function buildContactCommandActions(
  input: BuildContactCommandActionsInput,
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
      group: "contact",
      label: "Edit contact",
      keywords: ["edit", "update"],
      run: closeAnd(input.onEdit),
    },
    {
      id: "task",
      group: "contact",
      label: "Add task",
      keywords: ["task", "follow up"],
      run: closeAnd(input.onTask),
    },
    {
      id: "activity",
      group: "communication",
      label: "Log activity",
      keywords: ["log", "call", "email"],
      run: closeAnd(input.onLogActivity),
    },
    {
      id: "note",
      group: "communication",
      label: "Add note",
      keywords: ["note", "memo"],
      run: closeAnd(input.onAddNote),
    },
    {
      id: "timeline",
      group: "workspace",
      label: "Open timeline",
      keywords: ["history", "feed"],
      hint: "Tab",
      run: tab("timeline"),
    },
    {
      id: "tasks-tab",
      group: "workspace",
      label: "Open tasks",
      keywords: ["tasks", "todo"],
      hint: "Tab",
      run: tab("tasks"),
    },
    {
      id: "notes-tab",
      group: "workspace",
      label: "Open notes",
      keywords: ["notes"],
      hint: "Tab",
      run: tab("notes"),
    },
    {
      id: "related",
      group: "workspace",
      label: "Related account & lead",
      keywords: ["account", "lead", "links"],
      hint: "Tab",
      run: tab("related"),
    },
  ];

  if (input.canNewOpp) {
    actions.push({
      id: "opp",
      group: "contact",
      label: "Create opportunity",
      keywords: ["opportunity", "deal"],
      run: closeAnd(input.onNewOpportunity),
    });
  }

  if (input.hasEmail) {
    actions.push({
      id: "copy-email",
      group: "communication",
      label: "Copy email",
      keywords: ["email", "clipboard"],
      run: closeAnd(input.onCopyEmail),
    });
  }

  if (input.hasPhone) {
    actions.push({
      id: "copy-phone",
      group: "communication",
      label: "Copy phone",
      keywords: ["phone", "clipboard"],
      run: closeAnd(input.onCopyPhone),
    });
  }

  return actions.filter((a) => {
    if (a.id === "edit" && !input.canEdit) return false;
    if (a.id === "activity" && !input.canLogActivity) return false;
    return true;
  });
}
