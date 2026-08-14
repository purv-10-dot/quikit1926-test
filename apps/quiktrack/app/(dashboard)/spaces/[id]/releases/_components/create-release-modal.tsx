"use client";

import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import { showToast } from "@/lib/ui/toast";
import { PortalDropdown } from "../_shared/portal-dropdown";
import { DatePickerInput } from "../_shared/date-picker-input";
import type { ReleaseListItem, ReleaseMember } from "./releases-meta";
import { memberLabel } from "./releases-meta";

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function CreateReleaseModal({
  open,
  onClose,
  projectId,
  members,
  initialRelease,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  members: ReleaseMember[];
  initialRelease?: ReleaseListItem | null;
  onSaved: () => void;
}) {
  const isEdit = !!initialRelease;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [driverId, setDriverId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialRelease?.name ?? "");
    setDescription(initialRelease?.description ?? "");
    setStartDate(toDateInput(initialRelease?.startDate ?? null));
    setReleaseDate(toDateInput(initialRelease?.releaseDate ?? null));
    setDriverId(initialRelease?.driverId ?? "");
  }, [open, initialRelease]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const body = {
        ...(isEdit ? {} : { projectId }),
        name: trimmed,
        description: description.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        releaseDate: releaseDate ? new Date(releaseDate).toISOString() : undefined,
        driverId: driverId || undefined,
      };
      const res = await fetch(
        isEdit ? `/api/releases/${initialRelease!.id}` : "/api/releases",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ).then((r) => r.json());
      if (!res?.success) {
        showToast(res?.error || "Couldn't save the release.", "error");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} className="max-w-lg">
      <ModalContent>
        <ModalHeader onClose={onClose}>
          <ModalTitle>{isEdit ? "Edit release" : "Create release"}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Release name<span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2.4.0"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
              <DatePickerInput value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Release date</label>
              <DatePickerInput value={releaseDate} onChange={setReleaseDate} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Driver</label>
            <PortalDropdown
              placeholder="Unassigned"
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.userId, label: memberLabel(m) })),
              ]}
              selected={[driverId]}
              onChange={(next) => setDriverId(next[0] ?? "")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={save}
            className="h-9 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
