"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { RecordForm } from "@/components/forms/RecordForm";
import { useI18n } from "@/lib/i18n";
import type { ModuleConfig, TableRow } from "@/lib/modules";
import { itemPath } from "@/lib/utils/api";

/**
 * Inline edit modal used by ModulePage. Fetches the full record (falling back
 * to the grid row) and renders RecordForm in edit mode (PUT).
 */
export function RecordEditDialog({
  config,
  row,
  entityName,
  onClose,
  onSaved
}: {
  config: ModuleConfig;
  row: TableRow;
  entityName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();

  const { data: record } = useQuery({
    queryKey: ["record", config.key, row.id],
    queryFn: async () => {
      const response = await fetch(itemPath(config.apiPath, row.id));
      if (!response.ok) {
        return row as Record<string, unknown>;
      }
      const payload = (await response.json()) as { data?: Record<string, unknown> };
      return payload.data ?? (row as Record<string, unknown>);
    },
    initialData: row as Record<string, unknown>
  });

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {t("common.editEntity", "Edit {entity}", { entity: entityName })}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <RecordForm config={config} recordId={row.id} initialValues={record} onSuccess={onSaved} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
