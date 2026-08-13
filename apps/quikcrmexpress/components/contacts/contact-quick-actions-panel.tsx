"use client";

import { ClipboardList, Pencil, History, Briefcase } from "lucide-react";

interface Props {
  onEdit: () => void;
  onTask: () => void;
  onLogActivity: () => void;
  onNewOpportunity: () => void;
  canEdit: boolean;
  canLogActivity: boolean;
  canNewOpp: boolean;
  isDeleted: boolean;
}

function ActionBtn({
  icon,
  children,
  onClick,
  disabled,
  title,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded border border-crm-border bg-white px-3 py-2 text-sm font-medium text-crm-text hover:bg-crm-panel disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

export function ContactQuickActionsPanel(props: Props) {
  const {
    onEdit,
    onTask,
    onLogActivity,
    onNewOpportunity,
    canEdit,
    canLogActivity,
    canNewOpp,
    isDeleted,
  } = props;

  if (isDeleted) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <ActionBtn icon={<Pencil className="h-4 w-4" />} onClick={onEdit} disabled={!canEdit}>
        Edit contact
      </ActionBtn>
      <ActionBtn icon={<ClipboardList className="h-4 w-4" />} onClick={onTask}>
        Task
      </ActionBtn>
      <ActionBtn
        icon={<History className="h-4 w-4" />}
        onClick={onLogActivity}
        disabled={!canLogActivity}
      >
        Log activity
      </ActionBtn>
      {canNewOpp ? (
        <ActionBtn icon={<Briefcase className="h-4 w-4" />} onClick={onNewOpportunity}>
          Opportunity
        </ActionBtn>
      ) : null}
    </div>
  );
}
