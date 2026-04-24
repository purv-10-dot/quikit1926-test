"use client";

/**
 * ModuleMoreActions — composite "More" pill + 3 modal handlers for module pages.
 *
 * Wraps {MoreMenu, ExportModal, ManageColsModal, TrashBanner} with the usual
 * wiring so each module page (KPI / Team KPI / Priority / WWW) can drop it in
 * as a single component.
 *
 * Render this BESIDE your <AddButton/> (to its left), and put <TrashBanner/>
 * above your table via `renderTrashBanner`.
 */
import { useState } from "react";
import {
  MoreMenu,
  type MoreMenuItem,
  ManageColsModal,
  type ManageColumn,
  ExportModal,
  type ExportColumn,
  type ExportSelection,
  TrashBanner,
} from "@quikit/ui";
import { Download, Trash2, Columns } from "lucide-react";

interface ModuleMoreActionsProps {
  // Columns that exist for both Manage + Export lists
  columns: ManageColumn[];
  // Which column keys are currently hidden (from useTablePrefs)
  hiddenCols: string[];
  onHiddenColsChange: (next: string[]) => void;

  // Trash toggle
  isTrashActive: boolean;
  onToggleTrash: (next: boolean) => void;

  // Export row counts + handler
  rowCounts: { page: number; filtered: number; all: number };
  onExport: (sel: ExportSelection) => Promise<void>;

  // What visible-column keys are selected by default on export
  defaultExportColumnKeys: string[];
}

export function ModuleMoreActions({
  columns,
  hiddenCols,
  onHiddenColsChange,
  isTrashActive,
  onToggleTrash,
  rowCounts,
  onExport,
  defaultExportColumnKeys,
}: ModuleMoreActionsProps) {
  const [showExport, setShowExport] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const items: MoreMenuItem[] = [
    {
      key: "export",
      label: "Export Data",
      icon: Download,
      onSelect: () => setShowExport(true),
    },
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
    },
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

      <ExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        columns={columns as ExportColumn[]}
        defaultCheckedKeys={defaultExportColumnKeys}
        rowCounts={rowCounts}
        onExport={onExport}
        isTrashActive={isTrashActive}
      />
    </>
  );
}

// Thin wrapper so pages don't need to import TrashBanner directly
export { TrashBanner };
