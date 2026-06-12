"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronRight,
  Users,
  Building2,
  UserPlus,
  Briefcase,
  FileText,
  Package,
  Tags,
  Activity,
  CheckSquare,
  Phone,
  Workflow,
  BarChart3,
  LayoutDashboard,
  Settings,
  BookOpen,
} from "lucide-react";

interface DocSection {
  id: string;
  title: string;
  icon: React.ElementType;
  items: { heading: string; body: string }[];
}

const DOCS: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    items: [
      {
        heading: "What is QuikCRM?",
        body: "QuikCRM is a full-featured Sales OS for managing leads, accounts, contacts, opportunities, and customer interactions — all in one place.",
      },
      {
        heading: "Navigating the app",
        body: "Use the sidebar on the left to switch between modules. The top bar gives you quick access to search, notifications, and your profile. The Dashboard is your home base for key metrics.",
      },
      {
        heading: "Quick actions",
        body: "Click the + New button at the top of any list page to create a record. Use the global search (⌘K) to find leads, accounts, or contacts instantly.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    items: [
      {
        heading: "Overview",
        body: "The Dashboard displays real-time KPIs: open leads, pipeline value, activities due today, and conversion trends. Admins see team-wide data; others see their own.",
      },
      {
        heading: "Pinned telephony reports",
        body: "Admins can pin specific call-log reports to the dashboard for quick visibility into team telephony performance.",
      },
    ],
  },
  {
    id: "leads",
    title: "Leads",
    icon: UserPlus,
    items: [
      {
        heading: "Creating a lead",
        body: "Go to Leads → click + New Lead. Fill in the name (required), contact details, company, source, and assign an owner. The lead starts in the New stage.",
      },
      {
        heading: "Lead stages",
        body: "Leads progress through stages: New → Contacted → Qualified → Proposal → Negotiation → Closed Won / Closed Lost. Update the stage from the lead detail page or the list view.",
      },
      {
        heading: "Importing leads via CSV",
        body: "Click Import on the Leads page, then Download Example CSV to see all supported columns. Fill in your data and upload. Leads with a matching externalId + sourceSystem are upserted instead of duplicated.",
      },
      {
        heading: "Lead scoring",
        body: "Each lead has an auto-calculated score based on activity recency and engagement. A higher score indicates a more engaged prospect.",
      },
      {
        heading: "Converting a lead",
        body: "Once qualified, use Convert to create a linked Account, Contact, and Opportunity in one step.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Accounts",
    icon: Building2,
    items: [
      {
        heading: "Creating an account",
        body: "Accounts represent companies or organisations. Go to Accounts → + New Account and fill in the name, industry, and website.",
      },
      {
        heading: "Account 360° view",
        body: "Open any account to see all related Contacts, Leads, Opportunities, Quotes, Activities, Tasks, Notes, and Call logs in one place.",
      },
      {
        heading: "Parent–child hierarchy",
        body: "Link a subsidiary account to a parent account using the Parent Account field to model enterprise hierarchies.",
      },
    ],
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: Users,
    items: [
      {
        heading: "Adding a contact",
        body: "Go to Contacts → + New Contact. Contacts are individual people. Link them to an Account for full relationship visibility.",
      },
      {
        heading: "Linking to leads",
        body: "A contact can be linked to a lead to track which individual is driving the engagement. This link is set automatically when a lead is converted.",
      },
    ],
  },
  {
    id: "opportunities",
    title: "Opportunities",
    icon: Briefcase,
    items: [
      {
        heading: "Creating an opportunity",
        body: "Go to Opportunities → + New Opportunity. Set the name, account, amount, close date, and probability. The default stage is Prospecting.",
      },
      {
        heading: "Stage progression",
        body: "Opportunities move through: Prospecting → Qualification → Proposal → Negotiation → Won / Lost. Use the Stage button on the detail page. Closed states are terminal — re-opening requires an Admin.",
      },
      {
        heading: "Pipeline value",
        body: "The pipeline value is the sum of all open opportunity amounts weighted by probability, visible on the Dashboard.",
      },
    ],
  },
  {
    id: "quotes",
    title: "Quotes",
    icon: FileText,
    items: [
      {
        heading: "Creating a quote",
        body: "Create a quote from an Opportunity (recommended) or standalone via Quotes → + New Quote. Select a price list and add line items from your product catalog.",
      },
      {
        heading: "Quote statuses",
        body: "Draft → Sent → Accepted / Rejected. Send the quote to the customer with the Send button; track open/accepted status from the list view.",
      },
      {
        heading: "Approval workflow",
        body: "Quotes above the configured threshold require approval. An approver receives a notification and can Approve or Reject from their Quotes list.",
      },
    ],
  },
  {
    id: "products",
    title: "Products & Price Lists",
    icon: Package,
    items: [
      {
        heading: "Product catalog",
        body: "Go to Products to manage your full catalog. Each product has a name, SKU, category, unit price, tax rates (CGST/SGST/IGST for Indian GST compliance), and optional weight/dimensions.",
      },
      {
        heading: "Price lists",
        body: "Price lists allow different pricing for different customer segments (e.g. Retail, Wholesale, Partner). Assign a price list to an Opportunity to auto-populate pricing in Quotes.",
      },
    ],
  },
  {
    id: "activities",
    title: "Activities & Tasks",
    icon: Activity,
    items: [
      {
        heading: "Logging an activity",
        body: "Open any Lead, Contact, Account, or Opportunity and click Log Activity. Choose the type (Call, Email, Meeting, Demo), set the date, and write a summary.",
      },
      {
        heading: "Tasks",
        body: "Tasks are follow-up action items with a due date and priority. Create them from the record's Timeline tab or from the global Tasks page. Mark complete when done.",
      },
      {
        heading: "Activity timeline",
        body: "Every record shows a full timeline of all activities, tasks, notes, call logs, and system events in chronological order.",
      },
    ],
  },
  {
    id: "telephony",
    title: "Telephony",
    icon: Phone,
    items: [
      {
        heading: "Making a call",
        body: "Open the Dialer from Telephony → Dialer. Enter or select a contact number and click Call. The call is automatically logged against the associated lead or contact.",
      },
      {
        heading: "Call logs",
        body: "All inbound and outbound calls appear in the Call Logs section with duration, outcome, and agent. Admins can view team-wide call history.",
      },
    ],
  },
  {
    id: "automations",
    title: "Automations",
    icon: Workflow,
    items: [
      {
        heading: "Workflow builder",
        body: "Go to Automations → Workflows to create trigger-action workflows. Example triggers: lead stage changed, field updated, time elapsed.",
      },
      {
        heading: "Example automations",
        body: "Auto-create a task when a lead reaches Proposal stage. Send a notification when an opportunity is marked Won. Escalate a lead if no activity for 7 days.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart3,
    items: [
      {
        heading: "Available reports",
        body: "Lead pipeline by stage, conversion funnel, team activity summary, call volume, revenue forecast, and won/lost analysis.",
      },
      {
        heading: "Filters",
        body: "All reports support filters by date range, owner, team, stage, source, and industry. Use Export to download a CSV of any report.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    items: [
      {
        heading: "Team management",
        body: "Admins can invite team members, assign roles (Admin, Manager, Sales Rep), and deactivate users from Settings → Team.",
      },
      {
        heading: "Roles & permissions",
        body: "Permissions control which modules a user can view, create, edit, or delete. Roles bundle permissions for easy assignment.",
      },
      {
        heading: "Pipeline configuration",
        body: "Customise lead stages, sources, industries, and lead quality labels from Settings → Pipeline to match your sales process.",
      },
    ],
  },
];

function DocAccordion({ section }: { section: DocSection }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;
  return (
    <div className="border-b border-crm-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-crm-panel"
        aria-expanded={open}
      >
        <Icon size={16} className="shrink-0 text-crm-blue" />
        <span className="flex-1 text-sm font-medium text-crm-text">{section.title}</span>
        <ChevronRight
          size={15}
          className={
            "shrink-0 text-crm-muted transition-transform duration-150 " +
            (open ? "rotate-90" : "")
          }
        />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-4 pt-1">
          {section.items.map((item) => (
            <div key={item.heading}>
              <p className="mb-0.5 text-xs font-semibold text-crm-text">{item.heading}</p>
              <p className="text-xs leading-relaxed text-crm-muted">{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset search when panel opens
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = query.trim()
    ? DOCS.filter(
        (s) =>
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.items.some(
            (i) =>
              i.heading.toLowerCase().includes(query.toLowerCase()) ||
              i.body.toLowerCase().includes(query.toLowerCase()),
          ),
      )
    : DOCS;

  if (!mounted || !open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help and documentation"
        className="fixed inset-y-0 right-0 z-[101] flex w-full max-w-md flex-col border-l border-crm-border bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-crm-border px-5">
          <div className="flex items-center gap-2.5">
            <BookOpen size={18} className="text-crm-blue" />
            <span className="text-sm font-semibold text-crm-text">Help &amp; Docs</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-crm-muted hover:bg-crm-panel hover:text-crm-text"
            aria-label="Close help panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-crm-border px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs…"
            className="w-full rounded-lg border border-crm-border bg-crm-panel px-3 py-2 text-sm outline-none placeholder:text-crm-muted focus:border-crm-blue focus:ring-1 focus:ring-crm-blue-glow"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            filtered.map((section) => (
              <DocAccordion key={section.id} section={section} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-crm-border px-5 py-3">
          <p className="text-xs text-crm-muted">
            QuikCRM &mdash; Sales OS by{" "}
            <span className="font-medium text-crm-text">QuikIT</span>
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}
