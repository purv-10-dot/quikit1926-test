'use client';
import { Button } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  loading?: boolean;
  [key: string]: unknown;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Delete',
  message = 'Are you sure you want to delete this? This action cannot be undone.',
  loading,
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft">
            <AlertTriangle className="size-5 text-danger" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-fg">{title}</h3>
            <p className="mt-1 text-sm text-fg-muted">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" loading={!!loading} onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}
export default DeleteConfirmationModal;
