"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** A single instruction block (icon placeholder + title + bullet lines). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-4">
      <div className="mt-0.5 h-14 w-20 shrink-0 rounded border border-gray-200 bg-gray-50" aria-hidden />
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="mt-1 space-y-1 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
    {children}
  </kbd>
);

/**
 * "How to use the workflow diagram" — the help modal opened by the ? icon,
 * mirroring Jira's. Documents the interactions the editor supports.
 */
export function DiagramHelpDialog({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">How to use the workflow diagram</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="divide-y divide-gray-100 overflow-y-auto px-6">
          <Section title="Add a status">
            <p>Select a status type in the toolbar (<span className="font-medium">Add status</span>).</p>
          </Section>
          <Section title="Add a transition">
            <p>
              Use the toolbar (<span className="font-medium">Add Transition</span>) or drag from a
              connection handle on one status to another.
            </p>
          </Section>
          <Section title="Edit a status or transition">
            <p>Select it on the diagram and change its details in the right panel.</p>
            <p>
              To delete, select it and press <Kbd>Delete</Kbd> (or <Kbd>Backspace</Kbd>).
            </p>
          </Section>
          <Section title="Move a status">
            <p>Drag a status and drop it anywhere on the diagram.</p>
          </Section>
          <Section title="Reroute a transition">
            <p>Select a transition and drag its connection from one status to another.</p>
          </Section>
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
