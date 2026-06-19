"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";

export function NewTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: meRes } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => api.get<{ id: string }>("/api/v1/hrms/employees/me"),
    enabled: open,
    staleTime: 60_000,
  });
  const myId = meRes?.data?.id ?? null;

  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "Normal" as "Low" | "Normal" | "High" | "Urgent",
  });

  const createMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/tasks", {
      title: form.title,
      description: form.description || null,
      assigneeId: myId,
      dueDate: form.dueDate || null,
      priority: form.priority,
    }),
    onSuccess: async () => {
      toast.success("Todo created");
      await qc.refetchQueries({ queryKey: ["tasks"] });
      onClose();
      setForm({ title: "", description: "", dueDate: "", priority: "Normal" });
    },
    onError: (e: Error) => toast.error("Create failed", e.message),
  });

  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]";

  return (
    <Modal open={open} onClose={onClose} title="New Todo">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title || !myId) return;
          if (form.dueDate) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const due = new Date(form.dueDate); due.setHours(0, 0, 0, 0);
            if (due.getTime() < today.getTime()) {
              toast.error("Invalid due date", "Due date cannot be in the past.");
              return;
            }
          }
          createMut.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Title *">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputCls}
            placeholder="What needs doing?"
            autoFocus
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={inputCls}
            placeholder="Add notes (optional)"
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}
              options={["Low", "Normal", "High", "Urgent"].map((p) => ({ value: p, label: p }))}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="submit" disabled={createMut.isPending || !form.title || !myId} className="btn btn-primary btn-sm">
            {createMut.isPending ? "Creating…" : "Create Todo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
