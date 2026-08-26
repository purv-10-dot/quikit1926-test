"use client";

/**
 * One row in the project header's "..." menu. Split out of
 * `space-actions-menu.tsx` to keep that file under the 300-line ceiling in
 * `apps/quiktrack/CLAUDE.md`.
 */
export function SpaceMenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
        danger ? "text-red-600" : "text-gray-800"
      }`}
    >
      <span className={danger ? "text-red-500" : "text-gray-500"}>{icon}</span>
      {label}
    </button>
  );
}
