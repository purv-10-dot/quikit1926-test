'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Award, Save, X, Upload, Plus, Image as ImageIcon, Loader2,
  Type, Move, Building2, Check, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

/* ──────────────────────────────────────────────────────────────────────────
 * Certificate Template Designer
 *
 * Authors a certificate TEMPLATE: identity, images, per-element POSITIONING,
 * and tenant assignment.
 *
 * THE CONTRACT WITH THE RENDERER — do not break this again.
 *
 * A previous version of this file invented its own config shape and stored it
 * as `textPlacements: { design: { title, body, accent, orientation, fields } }`.
 * `buildCertificatePdf` reads `textPlacements.userName / .courseName / .date /
 * .signatoryName / .designation` plus `logoPlacement` / `signaturePlacement` —
 * none of which that shape produced. The result: EVERY template silently
 * rendered with the renderer's hardcoded defaults, and the live preview
 * described a PDF the system could not produce.
 *
 * So the payload below is fixed by the renderer, not by this component:
 *
 *   textPlacements: {
 *     userName?      { x, y, fontSize, color }
 *     courseName?    { x, y, fontSize, color }
 *     date?          { x, y, fontSize, color }
 *     signatoryName? { x, y, fontSize, color }
 *     designation?   { x, y, fontSize, color }
 *   }
 *   logoPlacement:      { x, y, width, height }
 *   signaturePlacement: { x, y, width, height }
 *
 * `x`/`y` are PERCENTAGES of the page and denote the element's CENTRE (the
 * renderer applies the CSS `translate(-50%,-50%)` equivalent). `width`/`height`
 * are pixels measured against the PREV_W x PREV_H = 1000 x 707 design canvas
 * that `certificates-service.ts` scales from. `fontSize` is preview pixels,
 * scaled by FONT_SCALE = 1.4025 at render time.
 *
 * The canvas below is therefore locked to A4 landscape (11.69 / 8.27) so what
 * is dragged here matches what is rendered.
 * ────────────────────────────────────────────────────────────────────────── */

type Placement = { x: number; y: number; fontSize: number; color: string };
type BoxPlacement = { x: number; y: number; width: number; height: number };
type TextField = 'userName' | 'courseName' | 'date' | 'signatoryName' | 'designation';
type Step = 'identity' | 'assets' | 'canvas' | 'assign';

interface Tenant {
  _id: string;
  orgName: string;
  contactEmail?: string;
}

interface CertificateDesignerProps {
  certificateId?: string;
  onClose?: () => void;
  onSuccess?: () => void;
  isTenantAdmin?: boolean;
  approvalEnabled?: boolean;
}

/** Drag-chip defaults — mirror the reference designer exactly. */
const FIELD_DEFAULTS: Record<TextField, Placement> = {
  userName: { x: 50, y: 40, fontSize: 32, color: '#4f46e5' },
  courseName: { x: 50, y: 52, fontSize: 24, color: '#10b981' },
  date: { x: 50, y: 65, fontSize: 16, color: '#64748b' },
  signatoryName: { x: 75, y: 85, fontSize: 16, color: '#1e293b' },
  designation: { x: 75, y: 89, fontSize: 12, color: '#64748b' },
};

const DEFAULT_LOGO: BoxPlacement = { x: 50, y: 15, width: 120, height: 60 };
const DEFAULT_SIGNATURE: BoxPlacement = { x: 75, y: 80, width: 420, height: 150 };

const STEPS: { id: Step; icon: typeof Type; label: string }[] = [
  { id: 'identity', icon: Type, label: 'Basics' },
  { id: 'assets', icon: ImageIcon, label: 'Images' },
  { id: 'canvas', icon: Move, label: 'Layout' },
  { id: 'assign', icon: Building2, label: 'Tenants' },
];

const DRAFT_KEY = 'cert_draft';

export default function CertificateDesigner({
  certificateId,
  onClose,
  onSuccess,
  isTenantAdmin = false,
  approvalEnabled = true,
}: CertificateDesignerProps) {
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [signatoryName, setSignatoryName] = useState('');

  // Persisted values (data URLs) vs display-only previews (blob: while uploading).
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [logoImageUrl, setLogoImageUrl] = useState<string | null>(null);
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);

  const [textPlacements, setTextPlacements] = useState<Partial<Record<TextField, Placement>>>({});
  const [logoPlacement, setLogoPlacement] = useState<BoxPlacement>(DEFAULT_LOGO);
  const [signaturePlacement, setSignaturePlacement] = useState<BoxPlacement>(DEFAULT_SIGNATURE);

  const [dragging, setDragging] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [activeStep, setActiveStep] = useState<Step>('identity');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);

  /* ── load ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    api
      .get<{ data?: Tenant[] }>('/tenants')
      .then((r) => setTenants(r?.data ?? []))
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    if (!certificateId) {
      // Restore an in-progress layout, as the reference does. Placements only —
      // never images, which would blow past the localStorage quota.
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) setTextPlacements(JSON.parse(raw));
      } catch {
        /* corrupt draft — ignore */
      }
      return;
    }

    api
      .get<{ data?: Record<string, unknown> }>(`/certificates/${certificateId}`)
      .then((r) => {
        const c = r?.data;
        if (!c) return;
        setName((c.name as string) ?? '');
        setDesignation((c.designation as string) ?? '');
        setSignatoryName((c.signatoryName as string) ?? '');

        setBackgroundImageUrl((c.backgroundImageUrl as string) ?? null);
        setLogoImageUrl((c.logoImageUrl as string) ?? null);
        setSignatureImageUrl((c.signatureImageUrl as string) ?? null);
        // Presigned preview urls win for display; the raw column is what we save back.
        setBackgroundPreview((c.backgroundPreviewUrl as string) ?? (c.backgroundImageUrl as string) ?? null);
        setLogoPreview((c.logoPreviewUrl as string) ?? (c.logoImageUrl as string) ?? null);
        setSignaturePreview((c.signaturePreviewUrl as string) ?? (c.signatureImageUrl as string) ?? null);

        const tp = c.textPlacements as Record<string, unknown> | null;
        // Ignore the legacy `{ design: … }` blob the previous designer wrote — it
        // carries no coordinates, so there is nothing to restore from it.
        if (tp && !('design' in tp)) setTextPlacements(tp as Partial<Record<TextField, Placement>>);
        if (c.logoPlacement) setLogoPlacement(c.logoPlacement as BoxPlacement);
        if (c.signaturePlacement) setSignaturePlacement(c.signaturePlacement as BoxPlacement);

        const st = c.selectedTenants as Array<string | { _id?: string; orgId?: string }> | undefined;
        if (Array.isArray(st)) {
          setSelectedTenants(st.map((t) => (typeof t === 'string' ? t : t._id ?? t.orgId ?? '')).filter(Boolean));
        }
      })
      .catch(() => toast.error('Failed to load certificate template'));
  }, [certificateId]);

  // Debounced layout autosave (reference: 2000ms, create-mode only).
  useEffect(() => {
    if (certificateId || Object.keys(textPlacements).length === 0) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(textPlacements));
      } catch {
        /* quota — non-fatal */
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [textPlacements, certificateId]);

  /* ── uploads ──────────────────────────────────────────────────────────── */

  const upload = async (
    file: File,
    endpoint: 'background' | 'logo' | 'signature',
    setUrl: (v: string | null) => void,
    setPrev: (v: string | null) => void,
  ) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPrev(objectUrl); // instant feedback while the request is in flight
    setUploading(endpoint);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post<{ data?: { url?: string; dataUrl?: string } }>(
        `/certificates/upload-${endpoint}`,
        form,
      );
      // The server returns a base64 data URL — that is what the template stores,
      // so the renderer never has to re-fetch a private object at render time.
      const stored = r?.data?.dataUrl || r?.data?.url;
      if (!stored) throw new Error('no url returned');
      setUrl(stored);
      setPrev(stored);
    } catch (e) {
      setPrev(null);
      const msg = (e as { message?: string })?.message;
      toast.error(msg || `Failed to upload ${endpoint} image`);
    } finally {
      setUploading(null);
      URL.revokeObjectURL(objectUrl);
    }
  };

  /* ── drag ─────────────────────────────────────────────────────────────── */

  const handleDrag = useCallback(
    (e: React.MouseEvent, field: string) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      if (field === 'logo') setLogoPlacement((p) => ({ ...p, x, y }));
      else if (field === 'signature') setSignaturePlacement((p) => ({ ...p, x, y }));
      else {
        const f = field as TextField;
        setTextPlacements((p) => ({ ...p, [f]: { ...(p[f] ?? FIELD_DEFAULTS[f]), x, y } }));
      }
    },
    [],
  );

  const placementOf = (f: TextField): Placement => textPlacements[f] ?? FIELD_DEFAULTS[f];

  const patchField = (f: TextField, patch: Partial<Placement>) =>
    setTextPlacements((p) => ({ ...p, [f]: { ...(p[f] ?? FIELD_DEFAULTS[f]), ...patch } }));

  /* ── save ─────────────────────────────────────────────────────────────── */

  const handleSave = async () => {
    if (!name.trim() || !backgroundImageUrl) {
      toast.error('Please provide a name and upload a background image');
      return;
    }
    setSaving(true);
    try {
      // EXACT reference payload — see the contract note at the top of this file.
      const payload = {
        name,
        backgroundImageUrl,
        logoImageUrl,
        signatureImageUrl,
        designation,
        signatoryName,
        textPlacements,
        logoPlacement,
        signaturePlacement,
        selectedTenants,
      };

      if (certificateId) {
        await api.put(`/certificates/${certificateId}`, payload);
      } else {
        await api.post('/certificates', payload);
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      }

      if (isTenantAdmin) {
        toast.success(
          approvalEnabled
            ? certificateId
              ? 'Template updated and resubmitted for Super Admin approval. It will become active once approved.'
              : 'Template submitted for Super Admin approval. It will become active once approved.'
            : certificateId
              ? 'Template updated successfully!'
              : 'Template created and activated successfully!',
        );
      } else {
        toast.success(certificateId ? 'Template updated successfully!' : 'Template created successfully!');
      }

      onSuccess?.();
      onClose?.();
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      toast.error(msg || 'Failed to save certificate template');
    } finally {
      setSaving(false);
    }
  };

  /* ── canvas overlays ──────────────────────────────────────────────────── */

  const renderChip = (field: TextField, label: string) => {
    const p = placementOf(field);
    return (
      <div
        key={field}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(field);
        }}
        className="absolute cursor-move select-none"
        style={{
          left: `${p.x}%`,
          top: `${p.y}%`,
          transform: 'translate(-50%, -50%)',
          fontSize: `${p.fontSize}px`,
          color: p.color,
          fontWeight: field === 'userName' ? 'bold' : 'normal',
          zIndex: 40,
        }}
      >
        <span className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white/90 px-2 py-1">
          <Move className="h-3 w-3 text-slate-400" />
          {label}
        </span>
      </div>
    );
  };

  const renderPreviewText = (field: TextField, value: string, weight: number, italic = false) => {
    const p = placementOf(field);
    return (
      <div
        key={field}
        className="pointer-events-none absolute select-none whitespace-nowrap"
        style={{
          left: `${p.x}%`,
          top: `${p.y}%`,
          transform: 'translate(-50%, -50%)',
          fontSize: `${p.fontSize}px`,
          color: p.color,
          fontWeight: weight,
          fontStyle: italic ? 'italic' : 'normal',
          fontFamily: field === 'userName' ? "'Playfair Display', Georgia, serif" : undefined,
        }}
      >
        {value}
      </div>
    );
  };

  const visibleSteps = STEPS.filter((s) => !(s.id === 'assign' && isTenantAdmin));
  const stepIndex = visibleSteps.findIndex((s) => s.id === activeStep);

  /* ── render ───────────────────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <div className="flex h-20 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3 shadow-lg shadow-indigo-500/20">
            <Award className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Certificate Studio</h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Editing • {name || 'Untitled Template'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPreviewMode((v) => !v)}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition ${
              previewMode
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {previewMode ? <Type className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewMode ? 'Design Mode' : 'Preview Mode'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !backgroundImageUrl}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Template
          </button>

          <button
            type="button"
            onClick={() => onClose?.()}
            disabled={saving}
            className="rounded-xl p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="flex w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="m-6 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const hidden = s.id === 'assign' && isTenantAdmin;
              if (hidden) return <div key={s.id} />;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveStep(s.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg py-3 transition ${
                    activeStep === s.id ? 'bg-white shadow-sm' : 'hover:bg-white/60'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${activeStep === s.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest ${
                      activeStep === s.id ? 'text-indigo-600' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* Step 1 — identity */}
            {activeStep === 'identity' && (
              <div className="space-y-5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  Template Identity
                </h2>
                {[
                  { label: 'Template Title *', ph: 'Master Certification 2024', v: name, set: setName },
                  { label: 'Signatory Full Name', ph: 'Dr. Sarah Jenkins', v: signatoryName, set: setSignatoryName },
                  { label: 'Official Designation', ph: 'Chief Learning Officer', v: designation, set: setDesignation },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {f.label}
                    </label>
                    <input
                      value={f.v}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.ph}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 font-bold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Step 2 — assets */}
            {activeStep === 'assets' && (
              <div className="space-y-5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  Asset Management
                </h2>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Background Canvas *
                  </label>
                  <button
                    type="button"
                    onClick={() => bgInputRef.current?.click()}
                    className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-[1.5rem] border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-indigo-400"
                  >
                    {backgroundPreview ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={backgroundPreview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
                        <span className="relative rounded-lg bg-white/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-900 backdrop-blur-[2px]">
                          Swap Template
                        </span>
                      </>
                    ) : uploading === 'background' ? (
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                    ) : (
                      <span className="flex flex-col items-center gap-2 text-slate-400">
                        <Upload className="h-6 w-6" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Upload Base Canvas</span>
                      </span>
                    )}
                  </button>
                  <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(f, 'background', setBackgroundImageUrl, setBackgroundPreview);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      key: 'logo' as const,
                      label: 'Corp Logo',
                      prev: logoPreview,
                      ref: logoInputRef,
                      setUrl: setLogoImageUrl,
                      setPrev: setLogoPreview,
                      hover: 'hover:bg-indigo-50',
                      remove: 'Remove Logo',
                    },
                    {
                      key: 'signature' as const,
                      label: 'Signature',
                      prev: signaturePreview,
                      ref: sigInputRef,
                      setUrl: setSignatureImageUrl,
                      setPrev: setSignaturePreview,
                      hover: 'hover:bg-emerald-50',
                      remove: 'Remove Sign',
                    },
                  ].map((a) => (
                    <div key={a.key}>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {a.label}
                      </label>
                      <button
                        type="button"
                        onClick={() => a.ref.current?.click()}
                        className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-[1.25rem] border-2 border-dashed border-slate-300 bg-slate-50 transition ${a.hover}`}
                      >
                        {a.prev ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.prev} alt="" className="h-full w-full object-contain p-2" />
                        ) : uploading === a.key ? (
                          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                        ) : (
                          <Plus className="h-5 w-5 text-slate-400" />
                        )}
                      </button>
                      {a.prev && (
                        <button
                          type="button"
                          onClick={() => {
                            a.setUrl(null);
                            a.setPrev(null);
                          }}
                          className="mt-1.5 w-full text-[9px] font-black uppercase tracking-widest text-slate-400 transition hover:text-red-500"
                        >
                          {a.remove}
                        </button>
                      )}
                      <input
                        ref={a.ref}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload(f, a.key, a.setUrl, a.setPrev);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — layout */}
            {activeStep === 'canvas' && (
              <div className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  Visual Geometry
                </h2>
                <p className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
                  Adjust coordinate planes and scale factors. You can also directly drag elements on the canvas to
                  the right.
                </p>

                {([
                  { f: 'userName' as TextField, title: 'User Variable' },
                  { f: 'courseName' as TextField, title: 'Course Variable' },
                  { f: 'date' as TextField, title: 'Date Timestamp' },
                ]).map((c) => {
                  const p = placementOf(c.f);
                  return (
                    <div key={c.f} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-700">
                        {c.title}
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Scale (px)
                          </label>
                          <input
                            type="number"
                            value={p.fontSize}
                            onChange={(e) => patchField(c.f, { fontSize: Number(e.target.value) || 0 })}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Chroma
                          </label>
                          <input
                            type="color"
                            value={p.color}
                            onChange={(e) => patchField(c.f, { color: e.target.value })}
                            className="h-[38px] w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-1"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {signatureImageUrl && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                    <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                      Signature Vector
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Width (px)
                        </label>
                        <input
                          type="number"
                          value={signaturePlacement.width}
                          onChange={(e) =>
                            setSignaturePlacement((p) => ({ ...p, width: Number(e.target.value) || 0 }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Height (px)
                        </label>
                        <input
                          type="number"
                          value={signaturePlacement.height}
                          onChange={(e) =>
                            setSignaturePlacement((p) => ({ ...p, height: Number(e.target.value) || 0 }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4 — tenants */}
            {activeStep === 'assign' && !isTenantAdmin && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    Node Distribution
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedTenants((s) => (s.length === tenants.length ? [] : tenants.map((t) => t._id)))
                    }
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600"
                  >
                    {selectedTenants.length === tenants.length && tenants.length > 0 ? 'Purge all' : 'Global select'}
                  </button>
                </div>

                <div className="space-y-2">
                  {tenants.map((t) => {
                    const on = selectedTenants.includes(t._id);
                    return (
                      <button
                        key={t._id}
                        type="button"
                        onClick={() =>
                          setSelectedTenants((s) => (on ? s.filter((x) => x !== t._id) : [...s, t._id]))
                        }
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                          on
                            ? 'border-indigo-200 bg-indigo-50 shadow-md shadow-indigo-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className="rounded-xl bg-slate-100 p-2">
                          <Building2 className="h-4 w-4 text-slate-500" />
                        </span>
                        <span className="flex-1 text-sm font-bold">{t.orgName}</span>
                        {on && <Check className="h-4 w-4 text-indigo-600" />}
                      </button>
                    );
                  })}
                  {tenants.length === 0 && (
                    <p className="py-8 text-center text-xs font-bold text-slate-400">No tenants available</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="flex gap-3 border-t border-slate-200 p-6">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setActiveStep(visibleSteps[stepIndex - 1].id)}
                className="flex-1 rounded-2xl bg-slate-100 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200"
              >
                Previous
              </button>
            )}
            {stepIndex < visibleSteps.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveStep(visibleSteps[stepIndex + 1].id)}
                className="flex-1 rounded-2xl bg-indigo-600 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-indigo-700"
              >
                Continue
              </button>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="relative flex-1 overflow-auto bg-slate-100 p-12">
          <div className="pointer-events-none absolute left-16 top-16 z-10 flex gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Variable Node
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Static Signature
            </span>
          </div>

          <div className="mx-auto max-w-[1000px]">
            <div
              ref={canvasRef}
              onMouseMove={(e) => dragging && handleDrag(e, dragging)}
              onMouseUp={() => setDragging(null)}
              onMouseLeave={() => setDragging(null)}
              className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_50px_100px_-20px_rgba(0,0,0,0.1)] ring-1 ring-slate-100"
              // A4 landscape — matches the renderer's jsPDF page exactly.
              style={{ aspectRatio: '11.69 / 8.27', width: '100%' }}
            >
              {backgroundPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={backgroundPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-10 py-8 text-slate-300">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Awaiting Template Asset</span>
                  </div>
                </div>
              )}

              {/* Logo */}
              {logoImageUrl && (
                <div
                  onMouseDown={(e) => {
                    if (previewMode) return;
                    e.preventDefault();
                    setDragging('logo');
                  }}
                  className={`absolute ${previewMode ? '' : 'cursor-move rounded-lg bg-white/50 p-1 ring-2 ring-indigo-500/50 backdrop-blur-sm'}`}
                  style={{
                    left: `${logoPlacement.x}%`,
                    top: `${logoPlacement.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 50,
                  }}
                >
                  {!previewMode && (
                    <span className="absolute -top-5 left-0 rounded bg-indigo-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                      Logo Axis
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview ?? logoImageUrl}
                    alt=""
                    style={{
                      width: `${logoPlacement.width}px`,
                      height: `${logoPlacement.height}px`,
                      objectFit: 'contain',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              )}

              {/* Signature */}
              {signatureImageUrl && (
                <div
                  onMouseDown={(e) => {
                    if (previewMode) return;
                    e.preventDefault();
                    setDragging('signature');
                  }}
                  className={`absolute ${previewMode ? '' : 'cursor-move rounded-lg bg-white/50 p-1 ring-2 ring-emerald-500/50 backdrop-blur-sm'}`}
                  style={{
                    left: `${signaturePlacement.x}%`,
                    top: `${signaturePlacement.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 50,
                  }}
                >
                  {!previewMode && (
                    <span className="absolute -top-5 left-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                      Signature Axis
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signaturePreview ?? signatureImageUrl}
                    alt=""
                    style={{
                      width: `${signaturePlacement.width}px`,
                      height: `${signaturePlacement.height}px`,
                      objectFit: 'contain',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              )}

              {/* Text elements */}
              {previewMode ? (
                <>
                  {renderPreviewText('userName', 'Alexander Pierce', 800)}
                  {renderPreviewText('courseName', 'Advanced Full-Stack Engineering 2024', 600)}
                  {renderPreviewText('date', 'October 24th, 2024', 500)}
                  {signatoryName && renderPreviewText('signatoryName', signatoryName, 700)}
                  {designation && renderPreviewText('designation', designation, 600, true)}
                </>
              ) : (
                <>
                  {renderChip('userName', '{learner_name}')}
                  {renderChip('courseName', '{course_title}')}
                  {renderChip('date', '{completion_date}')}
                  {signatoryName && renderChip('signatoryName', signatoryName)}
                  {designation && renderChip('designation', designation)}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
