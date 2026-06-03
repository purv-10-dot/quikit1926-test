"use client";

import {
  ClipboardList,
  Pencil,
  PhoneCall,
  UserPlus,
  Users,
  Briefcase,
  History,
} from "lucide-react";

interface Props {
  onEdit: () => void;
  onAddContact: () => void;
  onAddLead: () => void;
  onNewOpportunity: () => void;
  onAssignLeads: () => void;
  onTask: () => void;
  onLogActivity: () => void;
  onSalesActivity: () => void;
  canEdit: boolean;
  canAddContact: boolean;
  canAddLead: boolean;
  canNewOpp: boolean;
  canAssignLeads: boolean;
  canLogActivity: boolean;
  isDeleted: boolean;
  hasLeads: boolean;
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

export function AccountQuickActionsPanel(props: Props) {
  const {
    onEdit,
    onAddContact,
    onAddLead,
    onNewOpportunity,
    onAssignLeads,
    onTask,
    onLogActivity,
    onSalesActivity,
    canEdit,
    canAddContact,
    canAddLead,
    canNewOpp,
    canAssignLeads,
    canLogActivity,
    isDeleted,
    hasLeads,
  } = props;

  if (isDeleted) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <ActionBtn
        icon={<Pencil className="h-4 w-4" />}
        disabled={!canEdit}
        title={!canEdit ? "No permission to edit" : undefined}
        onClick={onEdit}
      >
        Edit account
      </ActionBtn>
      <ActionBtn
        icon={<Users className="h-4 w-4" />}
        disabled={!canAddContact}
        onClick={onAddContact}
      >
        Add contact
      </ActionBtn>
      <ActionBtn
        icon={<UserPlus className="h-4 w-4" />}
        disabled={!canAddLead}
        onClick={onAddLead}
      >
        Add lead
      </ActionBtn>
      <ActionBtn
        icon={<Briefcase className="h-4 w-4" />}
        disabled={!canNewOpp}
        onClick={onNewOpportunity}
      >
        New opportunity
      </ActionBtn>
      <ActionBtn
        icon={<Users className="h-4 w-4" />}
        disabled={!canAssignLeads || !hasLeads}
        onClick={onAssignLeads}
      >
        Assign leads
      </ActionBtn>
      <ActionBtn icon={<ClipboardList className="h-4 w-4" />} onClick={onTask}>
        Task
      </ActionBtn>
      <ActionBtn
        icon={<History className="h-4 w-4" />}
        disabled={!canLogActivity}
        onClick={onLogActivity}
      >
        Log activity
      </ActionBtn>
      <ActionBtn
        icon={<PhoneCall className="h-4 w-4" />}
        disabled={!canLogActivity}
        onClick={onSalesActivity}
      >
        Sales activity
      </ActionBtn>
    </div>
  );
}
