"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIONS, RESOURCES, isValidPermissionPair } from "@/lib/api/permissionsRegistry";

export const permKey = (resource: string, action: string) => `${resource}:${action}`;

/** Friendlier column headers for actions whose camelCase reads poorly. */
const ACTION_LABELS: Record<string, string> = { viewAll: "View all" };

interface Props {
  /** Editable grants (toggleable). */
  value: Set<string>;
  onToggle: (key: string) => void;
  /** Grants shown checked but locked (e.g. role grants under a user's extras). */
  locked?: Set<string>;
  /** When true nothing can be toggled (system-role / read-only view). */
  readOnly?: boolean;
}

/**
 * Resource × action grid. A cell renders only for pairs valid in the registry
 * (VIEW_ONLY resources expose just `view`). Locked cells display as granted but
 * can't be changed — used to show inherited role grants beneath a user's
 * additive extras.
 */
export function PermissionMatrix({ value, onToggle, locked, readOnly }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-accent-50 text-[10px] uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 text-left font-semibold">Resource</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-3 py-2 text-center font-semibold capitalize">
                {ACTION_LABELS[a] ?? a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((resource) => (
            <tr key={resource} className="border-t border-gray-100 hover:bg-gray-50/60">
              <td className="px-3 py-2 font-medium text-gray-700">{resource}</td>
              {ACTIONS.map((action) => {
                const key = permKey(resource, action);
                if (!isValidPermissionPair(resource, action)) {
                  return (
                    <td key={action} className="px-3 py-2 text-center text-gray-200">
                      —
                    </td>
                  );
                }
                // Role-granted permissions are inherited and locked — shown as a
                // lock, never a lookalike checkbox, so they can't be mistaken for a
                // toggle that "won't respond". Only extras render as checkboxes.
                if (locked?.has(key)) {
                  return (
                    <td key={action} className="px-3 py-2 text-center">
                      <span title="Granted by role — change the role to adjust" className="inline-flex">
                        <Lock className="mx-auto h-3.5 w-3.5 text-accent-600" aria-label="Granted by role (locked)" />
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={action} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={value.has(key)}
                      disabled={readOnly}
                      onChange={() => onToggle(key)}
                      className={cn(
                        "h-3.5 w-3.5 rounded border-gray-300 accent-accent-600",
                        readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                      )}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
