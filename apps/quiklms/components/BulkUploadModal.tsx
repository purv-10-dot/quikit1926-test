'use client';
import { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui';

interface BulkUploadModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  endpoint?: string;
  templateUrl?: string;
  entityName?: string;
  [key: string]: unknown;
}

export function BulkUploadModal({ isOpen, onClose, onSuccess, endpoint = '/bulk-upload', entityName = 'records' }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api${endpoint}`, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setResult({ success: data.data?.created ?? 0, failed: data.data?.failed ?? 0 });
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-fg">Bulk Upload {entityName}</h3>
          <button onClick={onClose} className="text-fg-muted hover:text-fg"><X className="size-4" /></button>
        </div>
        {result ? (
          <div className="text-center py-6">
            <CheckCircle className="size-10 text-success mx-auto mb-3" />
            <p className="font-semibold text-fg">{result.success} {entityName} imported</p>
            {result.failed > 0 && <p className="text-sm text-danger mt-1">{result.failed} rows failed</p>}
            <Button className="mt-4" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-8 cursor-pointer hover:border-[var(--brand-primary)] transition-colors"
            >
              {file ? (
                <>
                  <FileText className="size-8 text-[var(--brand-primary)] mb-2" />
                  <p className="text-sm font-medium text-fg">{file.name}</p>
                  <p className="text-xs text-fg-muted mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-fg-muted mb-2" />
                  <p className="text-sm text-fg-muted">Click to select a CSV file</p>
                </>
              )}
              <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </div>
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" loading={uploading} disabled={!file} onClick={handleUpload}>
                <Upload className="size-4" /> Upload
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default BulkUploadModal;
