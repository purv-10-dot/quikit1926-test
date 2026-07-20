"use client";

/**
 * MasterDataMoreActions — the "More" overflow menu for the FeatureGrid-based
 * master-data grids (Category / Unit / Quarter). A trimmed sibling of
 * ModuleMoreActions: it offers just "View / Exit Trash" + "Manage Columns"
 * (these grids have no bulk export). Reused across all three pages so the menu
 * copy and behaviour stay identical.
 */
import { useState } from "react";
import { MoreMenu, type MoreMenuItem, ManageColsModal, type ManageColumn, TrashBanner } from "@quikit/ui";
import { Trash2, Columns } from "lucide-react";

export { TrashBanner };

export function MasterDataMoreActions({
  columns,
  hiddenCols,
  onHiddenColsChange,
  isTrashActive,
  onToggleTrash,
  showTrash = true,
}: {
  columns: ManageColumn[];
  hiddenCols: string[];
  onHiddenColsChange: (next: string[]) => void;
  isTrashActive: boolean;
  onToggleTrash: (next: boolean) => void;
  /** Hide the Trash toggle (e.g. when the user lacks delete permission). */
  showTrash?: boolean;
}) {
  const [showManage, setShowManage] = useState(false);

  const items: MoreMenuItem[] = [
    ...(showTrash
      ? [
          {
            key: "trash",
            label: isTrashActive ? "Exit Trash" : "View Trash",
            icon: Trash2,
            onSelect: () => onToggleTrash(!isTrashActive),
            accessory: isTrashActive ? (
              <span className="text-[9px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                ON
              </span>
            ) : undefined,
          } as MoreMenuItem,
        ]
      : []),
    {
      key: "manage-cols",
      label: "Manage Columns",
      icon: Columns,
      onSelect: () => setShowManage(true),
    },
  ];

  return (
    <>
      <MoreMenu items={items} />
      <ManageColsModal
        open={showManage}
        onClose={() => setShowManage(false)}
        columns={columns}
        hiddenCols={hiddenCols}
        onChange={onHiddenColsChange}
      />
    </>
  );
}
