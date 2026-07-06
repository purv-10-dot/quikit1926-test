'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Award, Save, X, Upload, Trash2, Image as ImageIcon, Loader2,
  Type, PenLine, Palette, LayoutTemplate, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button, Input, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

/* ──────────────────────────────────────────────────────────────────────────
 * Certificate Template Designer
 *
 * Lets a tenant admin author a certificate TEMPLATE: title, body copy,
 * signatory, logo / signature / background images, accent colour, orientation
 * and which dynamic fields appear. Saving wires to the real template
 * create/update endpoints (POST /certificates, PUT /certificates/:id) — the
 * server stamps approvalStatus (pending_approval when the approval workflow is
 * on). A live preview renders the certificate with sample data.
 *
 * Mapping to the Prisma `Certificate` model:
 *   name, designation, signatoryName, logoImageUrl, signatureImageUrl,
 *   backgroundImageUrl are real columns. The richer designer config (title,
 *   body text, accent colour, orientation, dynamic-field toggles) is persisted
 *   inside the flexible `textPlacements` JSON column under a `design` key.
 * ────────────────────────────────────────────────────────────────────────── */

const ACCENT_PRESETS = [
  '#4f46e5', '#2563eb', '#0ea5e9', '#059669',
  '#d97706', '#dc2626', '#db2777', '#475569',
];

type Orientation = 'landscape' | 'portrait';

interface DynamicFields {
  recipientName: boolean;
  courseName: boolean;
  date: boolean;
  score: boolean;
  certId: boolean;
}

interface DesignConfig {
  title: string;
  body: string;
  accent: string;
  orientation: Orientation;
  fields: DynamicFields;
}

interface CertificateDesignerProps {
  certificateId?: string;
  templateId?: string;
  onClose?: () => void;
  onSave?: (data: unknown) => void;
  isTenantAdmin?: boolean;
  approvalEnabled?: boolean;
  [key: string]: unknown;
}

const DEFAULT_DESIGN: DesignConfig = {
  title: 'Certificate of Completion',
  body: 'for successfully completing the course',
  accent: '#4f46e5',
  orientation: 'landscape',
  fields: { recipientName: true, courseName: true, date: true, score: false, certId: true },
};

const SAMPLE = {
  recipient: 'Jane Doe',
  course: 'Advanced Project Management',
  score: 92,
  certId: 'CERT-2026-0001',
};

const FIELD_LABELS: { key: keyof DynamicFields; label: string }[] = [
  { key: 'recipientName', label: 'Recipient name' },
  { key: 'courseName', label: 'Course title' },
  { key: 'date', label: 'Completion date' },
  { key: 'score', label: 'Score' },
  { key: 'certId', label: 'Certificate ID' },
];

/** Pull the stored design config out of a loaded template's textPlacements JSON. */
function readDesign(textPlacements: unknown): DesignConfig {
  const raw = (textPlacements as { design?: Partial<DesignConfig> } | null)?.design;
  if (!raw) return { ...DEFAULT_DESIGN };
  return {
    ...DEFAULT_DESIGN,
    ...raw,
    fields: { ...DEFAULT_DESIGN.fields, ...(raw.fields || {}) },
  };
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function CertificateDesigner(props: CertificateDesignerProps) {
  const certificateId = props.certificateId ?? props.templateId;
  const { onClose, onSave, isTenantAdmin = true, approvalEnabled = true } = props;

  const [name, setName] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [designation, setDesignation] = useState('');
  const [logoImageUrl, setLogoImageUrl] = useState<string | null>(null);
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [design, setDesign] = useState<DesignConfig>({ ...DEFAULT_DESIGN });

  const [loading, setLoading] = useState(Boolean(certificateId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<null | 'logo' | 'signature' | 'background'>(null);

  const logoInput = useRef<HTMLInputElement>(null);
  const signInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);

  // ── Load when editing ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!certificateId) return;
    (async () => {
      try {
        const res = await api.get<{ data: Record<string, unknown> }>(`/certificates/${certificateId}`);
        const cert = ((res as { data?: unknown }).data ?? res) as Record<string, unknown>;
        setName((cert.name as string) || '');
        setSignatoryName((cert.signatoryName as string) || '');
        setDesignation((cert.designation as string) || '');
        setLogoImageUrl((cert.logoImageUrl as string) || null);
        setSignatureImageUrl((cert.signatureImageUrl as string) || null);
        const bg = (cert.backgroundImageUrl as string) || '';
        setBackgroundImageUrl(bg && bg.startsWith('data:') ? bg : bg || null);
        setDesign(readDesign(cert.textPlacements));
      } catch {
        toast.error('Failed to load template');
      } finally {
        setLoading(false);
      }
    })();
  }, [certificateId]);

  const patchFields = (key: keyof DynamicFields) =>
    setDesign((d) => ({ ...d, fields: { ...d.fields, [key]: !d.fields[key] } }));

  // ── Image uploads (reuse the existing base64 upload endpoints) ────────────
  const handleUpload = useCallback(
    async (
      e: React.ChangeEvent<HTMLInputElement>,
      kind: 'logo' | 'signature' | 'background',
      endpoint: string,
      setter: (v: string | null) => void,
    ) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
      if (file.size > 4 * 1024 * 1024) return toast.error('Image must be smaller than 4 MB');
      setUploading(kind);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post<{ data?: { dataUrl?: string; url?: string } }>(endpoint, form);
        const dataUrl = res?.data?.dataUrl || res?.data?.url;
        if (!dataUrl) throw new Error('No image returned');
        setter(dataUrl);
      } catch (err) {
        toast.error((err as { message?: string })?.message || 'Upload failed');
      } finally {
        setUploading(null);
      }
    },
    [],
  );

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Give your template a name');
      return;
    }
    setSaving(true);
    const toastId = toast.loading(certificateId ? 'Updating template…' : 'Submitting template…');
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        designation: designation.trim() || null,
        signatoryName: signatoryName.trim() || null,
        logoImageUrl,
        signatureImageUrl,
        // backgroundImageUrl is a required (non-null) column — default to ''.
        backgroundImageUrl: backgroundImageUrl || '',
        // Persist the full designer config in the flexible JSON column.
        textPlacements: { design },
      };

      if (certificateId) {
        await api.put(`/certificates/${certificateId}`, payload);
      } else {
        await api.post('/certificates', payload);
      }

      toast.success(
        approvalEnabled && isTenantAdmin
          ? certificateId
            ? 'Updated and resubmitted for approval'
            : 'Submitted for Super Admin approval'
          : certificateId
            ? 'Template updated'
            : 'Template created',
        { id: toastId },
      );
      onSave?.(payload);
      onClose?.();
    } catch (err) {
      toast.error((err as { message?: string })?.message || 'Failed to save template', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-fg-muted">
        <Loader2 className="size-6 animate-spin" />
        <span className="ml-3 text-sm">Loading template…</span>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-12">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 py-4 sm:py-6">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: design.accent }}
          >
            <Award className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-fg truncate">
              {certificateId ? 'Edit Certificate Template' : 'New Certificate Template'}
            </h2>
            <p className="text-xs text-fg-muted truncate">
              {name || 'Untitled template'}
              {approvalEnabled && isTenantAdmin && ' · submits for approval'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onClose?.()} disabled={saving}>
            <X className="size-4" /> Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            <Save className="size-4" /> {approvalEnabled && isTenantAdmin ? 'Submit for Approval' : 'Save Template'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Editor ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-5">
          {/* Content */}
          <section className="rounded-xl border border-line bg-surface p-5 space-y-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Type className="size-4 text-fg-muted" /> Content
            </h3>
            <Input
              label="Template name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Completion 2026"
              hint="Internal name shown in your template list."
            />
            <Input
              label="Certificate title"
              value={design.title}
              onChange={(e) => setDesign((d) => ({ ...d, title: e.target.value }))}
              placeholder="Certificate of Completion"
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cert-body" className="text-sm font-medium text-fg">Body text</label>
              <textarea
                id="cert-body"
                value={design.body}
                onChange={(e) => setDesign((d) => ({ ...d, body: e.target.value }))}
                rows={2}
                placeholder="for successfully completing the course"
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
          </section>

          {/* Signatory */}
          <section className="rounded-xl border border-line bg-surface p-5 space-y-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <PenLine className="size-4 text-fg-muted" /> Signatory
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Signatory name"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="Dr. Sarah Jenkins"
              />
              <Input
                label="Designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Chief Learning Officer"
              />
            </div>
            <ImageField
              label="Signature image"
              value={signatureImageUrl}
              busy={uploading === 'signature'}
              onPick={() => signInput.current?.click()}
              onClear={() => setSignatureImageUrl(null)}
              inputRef={signInput}
              onChange={(e) => handleUpload(e, 'signature', '/certificates/upload-signature', setSignatureImageUrl)}
            />
          </section>

          {/* Branding */}
          <section className="rounded-xl border border-line bg-surface p-5 space-y-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Palette className="size-4 text-fg-muted" /> Branding
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImageField
                label="Logo"
                value={logoImageUrl}
                busy={uploading === 'logo'}
                onPick={() => logoInput.current?.click()}
                onClear={() => setLogoImageUrl(null)}
                inputRef={logoInput}
                onChange={(e) => handleUpload(e, 'logo', '/certificates/upload-logo', setLogoImageUrl)}
              />
              <ImageField
                label="Background (optional)"
                value={backgroundImageUrl}
                busy={uploading === 'background'}
                onPick={() => bgInput.current?.click()}
                onClear={() => setBackgroundImageUrl(null)}
                inputRef={bgInput}
                onChange={(e) => handleUpload(e, 'background', '/certificates/upload-background', setBackgroundImageUrl)}
              />
            </div>

            {/* Accent colour */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-fg">Accent colour</span>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDesign((d) => ({ ...d, accent: c }))}
                    aria-label={`Accent ${c}`}
                    className={cn(
                      'size-8 rounded-full border-2 transition-transform hover:scale-110',
                      design.accent.toLowerCase() === c ? 'border-fg' : 'border-line',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-line">
                  <input
                    type="color"
                    value={design.accent}
                    onChange={(e) => setDesign((d) => ({ ...d, accent: e.target.value }))}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  <Palette className="size-4 text-fg-muted" />
                </label>
              </div>
            </div>
          </section>

          {/* Layout */}
          <section className="rounded-xl border border-line bg-surface p-5 space-y-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <LayoutTemplate className="size-4 text-fg-muted" /> Layout & fields
            </h3>
            <div className="space-y-2">
              <span className="text-sm font-medium text-fg">Orientation</span>
              <div className="grid grid-cols-2 gap-2">
                {(['landscape', 'portrait'] as Orientation[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setDesign((d) => ({ ...d, orientation: o }))}
                    className={cn(
                      'h-10 rounded-md border text-sm font-medium capitalize transition-colors',
                      design.orientation === o
                        ? 'border-transparent text-white'
                        : 'border-line-strong bg-surface text-fg hover:bg-surface-muted',
                    )}
                    style={design.orientation === o ? { backgroundColor: design.accent } : undefined}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium text-fg">Dynamic fields shown</span>
              <div className="flex flex-wrap gap-2">
                {FIELD_LABELS.map(({ key, label }) => {
                  const on = design.fields[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => patchFields(key)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        on ? 'border-transparent text-white' : 'border-line-strong text-fg-muted hover:bg-surface-muted',
                      )}
                      style={on ? { backgroundColor: design.accent } : undefined}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* ── Live preview ───────────────────────────────────────────────── */}
        <div className="lg:col-span-7 lg:sticky lg:top-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Sparkles className="size-4 text-fg-muted" /> Live Preview
            </h3>
            <Badge tone="neutral">Sample data</Badge>
          </div>
          <CertificatePreview
            design={design}
            name={name}
            signatoryName={signatoryName}
            designation={designation}
            logoImageUrl={logoImageUrl}
            signatureImageUrl={signatureImageUrl}
            backgroundImageUrl={backgroundImageUrl}
          />
          <p className="text-xs text-fg-subtle text-center">
            Rendered with sample recipient &ldquo;{SAMPLE.recipient}&rdquo; · {todayLabel()}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Image upload tile ─────────────────────────────────────────────────────── */
function ImageField({
  label, value, busy, onPick, onClear, inputRef, onChange,
}: {
  label: string;
  value: string | null;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-surface-muted transition-colors hover:border-fg-subtle disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin text-fg-muted" />
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="size-full object-contain p-1" />
          ) : (
            <ImageIcon className="size-5 text-fg-subtle" />
          )}
        </button>
        <div className="flex flex-col gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onPick} disabled={busy}>
            <Upload className="size-3.5" /> {value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-danger">
              <Trash2 className="size-3.5" /> Remove
            </Button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
      </div>
    </div>
  );
}

/* ── Certificate preview ───────────────────────────────────────────────────── */
function CertificatePreview({
  design, name, signatoryName, designation,
  logoImageUrl, signatureImageUrl, backgroundImageUrl,
}: {
  design: DesignConfig;
  name: string;
  signatoryName: string;
  designation: string;
  logoImageUrl: string | null;
  signatureImageUrl: string | null;
  backgroundImageUrl: string | null;
}) {
  const { accent, orientation, fields } = design;
  const aspect = orientation === 'landscape' ? '11.69 / 8.27' : '8.27 / 11.69';

  return (
    <div className="rounded-xl border border-line bg-surface-muted p-4 shadow-sm">
      <div
        className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-lg bg-white text-slate-900 shadow-lg"
        style={{ aspectRatio: aspect }}
      >
        {/* Background image */}
        {backgroundImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backgroundImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}

        {/* Decorative double border in accent colour */}
        <div className="absolute inset-3 rounded-md" style={{ border: `3px solid ${accent}` }} />
        <div className="absolute inset-[18px] rounded-sm" style={{ border: `1px solid ${accent}66` }} />
        {/* Accent corner ribbon */}
        <div className="absolute left-0 top-0 size-0"
          style={{ borderTop: `48px solid ${accent}`, borderRight: '48px solid transparent' }} />

        {/* Content */}
        <div className="relative flex size-full flex-col items-center justify-center px-[8%] py-[6%] text-center">
          {logoImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoImageUrl} alt="Logo" className="mb-[2%] max-h-[14%] object-contain" />
          )}

          <h1
            className="font-serif font-bold leading-tight"
            style={{ color: accent, fontSize: 'clamp(18px, 3.4vw, 38px)' }}
          >
            {design.title || 'Certificate of Completion'}
          </h1>

          <p className="mt-[2%] text-slate-500" style={{ fontSize: 'clamp(9px, 1.2vw, 15px)' }}>
            This is proudly presented to
          </p>

          {fields.recipientName && (
            <p
              className="mt-[1.5%] border-b-2 pb-1 font-serif font-bold"
              style={{ borderColor: `${accent}55`, fontSize: 'clamp(16px, 2.8vw, 32px)' }}
            >
              {SAMPLE.recipient}
            </p>
          )}

          <p className="mt-[2.5%] text-slate-500" style={{ fontSize: 'clamp(9px, 1.2vw, 15px)' }}>
            {design.body || 'for successfully completing the course'}
          </p>

          {fields.courseName && (
            <p className="mt-[1%] font-semibold text-slate-800" style={{ fontSize: 'clamp(12px, 1.9vw, 22px)' }}>
              {SAMPLE.course}
            </p>
          )}

          {fields.score && (
            <p className="mt-[1.5%] text-slate-500" style={{ fontSize: 'clamp(8px, 1.1vw, 13px)' }}>
              Score: {SAMPLE.score}%
            </p>
          )}

          {/* Footer row: date · signature · cert id */}
          <div className="absolute inset-x-[10%] bottom-[8%] flex items-end justify-between gap-4">
            <div className="min-w-0 text-left">
              {fields.date && (
                <>
                  <p className="font-medium text-slate-700" style={{ fontSize: 'clamp(8px, 1vw, 12px)' }}>
                    {todayLabel()}
                  </p>
                  <p className="text-slate-400" style={{ fontSize: 'clamp(6px, 0.8vw, 10px)' }}>Date issued</p>
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col items-center">
              {signatureImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureImageUrl} alt="Signature" className="max-h-[42px] object-contain" />
              ) : (
                <div className="h-[1px] w-24" style={{ backgroundColor: `${accent}99` }} />
              )}
              <div className="mt-1 w-full border-t border-slate-300 pt-1 text-center">
                {signatoryName && (
                  <p className="font-semibold text-slate-700" style={{ fontSize: 'clamp(8px, 1vw, 12px)' }}>
                    {signatoryName}
                  </p>
                )}
                {designation && (
                  <p className="italic text-slate-400" style={{ fontSize: 'clamp(6px, 0.8vw, 10px)' }}>
                    {designation}
                  </p>
                )}
                {!signatoryName && !designation && (
                  <p className="text-slate-400" style={{ fontSize: 'clamp(6px, 0.8vw, 10px)' }}>Authorised signature</p>
                )}
              </div>
            </div>

            <div className="min-w-0 text-right">
              {fields.certId && (
                <>
                  <p className="font-mono text-slate-500" style={{ fontSize: 'clamp(6px, 0.8vw, 10px)' }}>
                    {SAMPLE.certId}
                  </p>
                  <p className="text-slate-400" style={{ fontSize: 'clamp(6px, 0.7vw, 9px)' }}>Certificate ID</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CertificateDesigner;
