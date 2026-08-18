"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  Bell,
  Monitor,
  LayoutGrid,
  Rocket,
  ListChecks,
  AppWindow,
  Headphones,
  Users as UsersIcon,
  Receipt,
  ExternalLink,
  Lock,
  Braces,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface PopoverItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Route to push on click. Omit + set `disabled` for "coming soon" items. */
  href?: string;
  /** Renders the small external-link icon at the right edge. */
  external?: boolean;
  /** Open `href` in a new browser tab instead of client-side navigation. */
  newTab?: boolean;
  disabled?: boolean;
}

interface PopoverSection {
  key: string;
  label: string;
  items: PopoverItem[];
  /** Section is only shown to admins (QuikTrack app-admin / org admin). */
  adminOnly?: boolean;
}

const SECTIONS: PopoverSection[] = [
  {
    key: "personal",
    label: "Personal QuikTrack settings",
    items: [
      {
        key: "general",
        label: "General settings",
        description: "Manage appearance (light / dark / system) and other personal preferences",
        icon: User,
        href: "/settings/general",
      },
      {
        key: "notifications",
        label: "Notification settings",
        description: "Manage email and in-app notifications from QuikTrack",
        icon: Bell,
        href: "/settings/notifications",
      },
    ],
  },
  {
    key: "admin",
    label: "QuikTrack admin settings",
    adminOnly: true,
    items: [
      {
        key: "system",
        label: "System",
        description: "Manage general configuration, security, automation, user interface, and more",
        icon: Monitor,
        disabled: true,
      },
      {
        key: "apps",
        label: "QuikTrack apps",
        description: "Manage access, settings, and integrations across QuikTrack",
        icon: LayoutGrid,
        disabled: true,
      },
      {
        key: "spaces",
        label: "Spaces",
        description: "Manage space settings, categories, and more",
        icon: Rocket,
        href: "/spaces",
      },
      {
        key: "work-items",
        label: "Work items",
        description: "Configure custom fields for work items across all spaces",
        icon: ListChecks,
        href: "/settings/work-items/fields",
      },
      {
        key: "test-statuses",
        label: "QuikTest",
        description:
          "Test statuses and case templates, shared by every space in this org",
        icon: FlaskConical,
        href: "/settings/test-statuses",
      },
      {
        key: "api-docs",
        label: "API Documentation",
        description: "Reference and test the QuikTrack REST API for integrations",
        icon: Braces,
        href: "/api/v1/docs",
        external: true,
        newTab: true,
      },
      {
        key: "marketplace",
        label: "Marketplace apps",
        description: "Add and manage QuikTrack Marketplace apps and integrations",
        icon: AppWindow,
        disabled: true,
      },
      {
        key: "operations",
        label: "Operations",
        description: "Manage alerts and incidents, setup on-call schedules, and more",
        icon: Headphones,
        disabled: true,
      },
    ],
  },
  {
    key: "atlassian",
    label: "Organisation admin settings",
    adminOnly: true,
    items: [
      {
        key: "user-management",
        label: "User management",
        description: "Manage users, groups, and access requests",
        icon: UsersIcon,
        href: "/settings/user-management",
        external: true,
      },
      {
        key: "billing",
        label: "Billing",
        description: "Update your billing details, manage subscriptions, and more",
        icon: Receipt,
        external: true,
        disabled: true,
      },
    ],
  },
];

export function SettingsPopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);
  const perms = useMyPermissions();
  // Admin sections (Spaces / User management) are gated. While permissions
  // load, treat as non-admin to avoid flashing admin options to everyone.
  const isAdmin = !perms.loading && perms.isAdmin;

  // Outside-click and Escape to dismiss.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  function handleClick(item: PopoverItem) {
    if (item.disabled || !item.href) return;
    onClose();
    if (item.newTab) {
      // The API reference is a route handler that renders HTML, not a Next
      // page — open it in a new tab rather than pushing it through the router.
      window.open(item.href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(item.href);
  }

  return (
    <div
      ref={popoverRef}
      className="absolute top-full right-0 mt-1 w-[560px] max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[1000]"
      role="menu"
    >
      {/* Search row */}
      {/* <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-end">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search ( Ctrl + K )"
            className="h-9 w-64 pl-9 pr-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            disabled
          />
        </div>
      </div> */}

      {/* Hide disabled (coming-soon) items so only implemented destinations
          show, and hide admin-only sections from non-admins. */}
      {SECTIONS.filter((s) => !s.adminOnly || isAdmin).map((section) => {
        const visibleItems = section.items.filter((i) => !i.disabled);
        if (visibleItems.length === 0) return null;
        return (
        <section key={section.key} className="py-2">
          <h3 className="px-4 py-2 text-xs font-semibold text-gray-900">
            {section.label}
          </h3>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const interactive = !item.disabled && !!item.href;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleClick(item)}
                disabled={!interactive}
                className={`group w-full px-4 py-2 flex items-start gap-3 text-left text-sm ${
                  interactive
                    ? "hover:bg-gray-50 text-gray-900"
                    : "text-gray-400 cursor-not-allowed"
                }`}
                role="menuitem"
              >
                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${interactive ? "text-gray-500" : "text-gray-300"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium leading-tight">{item.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5 leading-snug">
                    {item.description}
                  </span>
                </span>
                {item.external && (
                  <ExternalLink className="h-3.5 w-3.5 text-gray-400 mt-1 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </section>
        );
      })}

      {/* Non-admins: explain why admin settings aren't available. */}
      {!perms.loading && !isAdmin && (
        <div className="mx-4 mb-3 mt-1 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5">
          <Lock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-xs leading-snug text-amber-800">
            You don&apos;t have access to admin settings. Contact your organisation admin to
            request access.
          </p>
        </div>
      )}
    </div>
  );
}
