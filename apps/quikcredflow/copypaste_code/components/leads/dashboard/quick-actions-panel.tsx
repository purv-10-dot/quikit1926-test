"use client";

import {
  CheckSquare,
  Mail,
  MessageCircle,
  Phone,
  StickyNote,
  UserPlus,
  Activity,
} from "lucide-react";

export interface QuickActionsHandlers {
  onCall: () => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onNote: () => void;
  onTask: () => void;
  onLogActivity: () => void;
  onConvert: () => void;
}

interface Props extends QuickActionsHandlers {
  canCall: boolean;
  canConvert: boolean;
  linkedContactId: string | null;
  className?: string;
}

const ACTIONS: {
  key: keyof QuickActionsHandlers;
  label: string;
  icon: typeof Phone;
  variant?: "primary";
}[] = [
  { key: "onCall", label: "Call", icon: Phone, variant: "primary" },
  { key: "onWhatsApp", label: "WhatsApp", icon: MessageCircle },
  { key: "onEmail", label: "Email", icon: Mail },
  { key: "onNote", label: "Add note", icon: StickyNote },
  { key: "onTask", label: "Create task", icon: CheckSquare },
  { key: "onLogActivity", label: "Log activity", icon: Activity },
  { key: "onConvert", label: "Convert", icon: UserPlus },
];

export function QuickActionsPanel({
  onCall,
  onWhatsApp,
  onEmail,
  onNote,
  onTask,
  onLogActivity,
  onConvert,
  canCall,
  canConvert,
  linkedContactId,
  className = "",
}: Props) {
  const handlers: QuickActionsHandlers = {
    onCall,
    onWhatsApp,
    onEmail,
    onNote,
    onTask,
    onLogActivity,
    onConvert,
  };

  return (
    <nav
      className={`crm-card sticky top-4 space-y-1 p-3 shadow-sm ${className}`}
      aria-label="Quick actions"
    >
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-crm-muted">
        Quick actions
      </p>
      {ACTIONS.map((a) => {
        if (a.key === "onConvert" && linkedContactId) return null;
        const Icon = a.icon;
        const disabled = a.key === "onCall" && !canCall;
        const hideConvert = a.key === "onConvert" && !canConvert;
        if (hideConvert) return null;
        return (
          <button
            key={a.key}
            type="button"
            disabled={disabled}
            onClick={handlers[a.key]}
            className={
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
              (a.variant === "primary"
                ? "bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                : "text-crm-text hover:bg-crm-panel disabled:opacity-50")
            }
          >
            <Icon size={16} />
            {a.label}
          </button>
        );
      })}
    </nav>
  );
}

export function QuickActionsMobileBar(props: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-crm-border bg-white/95 px-2 py-2 shadow-lg backdrop-blur-md xl:hidden dark:bg-slate-900/95">
      <div className="flex justify-around gap-1">
        <MobileBtn icon={Phone} label="Call" onClick={props.onCall} disabled={!props.canCall} primary />
        <MobileBtn icon={MessageCircle} label="WA" onClick={props.onWhatsApp} />
        <MobileBtn icon={Mail} label="Email" onClick={props.onEmail} />
        <MobileBtn icon={StickyNote} label="Note" onClick={props.onNote} />
        <MobileBtn icon={CheckSquare} label="Task" onClick={props.onTask} />
      </div>
    </div>
  );
}

function MobileBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium disabled:opacity-40 " +
        (primary ? "text-accent-600" : "text-crm-muted")
      }
    >
      <Icon size={20} />
      {label}
    </button>
  );
}
