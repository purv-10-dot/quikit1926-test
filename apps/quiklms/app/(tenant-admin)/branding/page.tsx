'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Palette, Upload, Image as ImageIcon, Save, Sparkles,
  Check, RefreshCw, Trash2, Eye,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

interface Theme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  description: string;
  category: 'vibrant' | 'solid' | 'pastel';
}

const themes: Theme[] = [
  // ── Vibrant Gradients ──────────────────────────────
  { id: 'modern',       name: 'Modern',        primary: '#6366f1', secondary: '#8b5cf6', description: 'Indigo & Purple',    category: 'vibrant' },
  { id: 'professional', name: 'Professional',  primary: '#059669', secondary: '#0284c7', description: 'Green & Blue',       category: 'vibrant' },
  { id: 'ocean',        name: 'Ocean',         primary: '#0ea5e9', secondary: '#06b6d4', description: 'Sky & Cyan',         category: 'vibrant' },
  { id: 'sunset',       name: 'Sunset',        primary: '#f97316', secondary: '#ec4899', description: 'Orange & Pink',      category: 'vibrant' },

  // ── Solid Gems (Plain Colors) ──────────────────────
  { id: 'royal',       name: 'Royal Blue',   primary: '#2563eb', secondary: '#2563eb', description: 'Solid Professional', category: 'solid' },
  { id: 'emerald',     name: 'Emerald',      primary: '#10b981', secondary: '#10b981', description: 'Crisp Green',        category: 'solid' },
  { id: 'deep-indigo', name: 'Deep Indigo',  primary: '#4f46e5', secondary: '#4f46e5', description: 'Classic Indigo',     category: 'solid' },
  { id: 'slate',       name: 'Steady Slate', primary: '#475569', secondary: '#475569', description: 'Neutral Grey',       category: 'solid' },
  { id: 'crimson',     name: 'Crimson',      primary: '#dc2626', secondary: '#dc2626', description: 'Bold Red',           category: 'solid' },

  // ── Soft Pastels (Light Colors) ─────────────────────
  { id: 'arctic',      name: 'Arctic',        primary: '#f0f9ff', secondary: '#f0f9ff', description: 'Light Arctic Blue', category: 'pastel' },
  { id: 'sage',        name: 'Soft Sage',     primary: '#f0fdf4', secondary: '#f0fdf4', description: 'Serene Mint',       category: 'pastel' },
  { id: 'lavender',    name: 'Lavender',      primary: '#f5f3ff', secondary: '#f5f3ff', description: 'Cushy Purple',      category: 'pastel' },
  { id: 'peach',       name: 'Peach Whisper', primary: '#fff7ed', secondary: '#fff7ed', description: 'Warm Glow',         category: 'pastel' },
  { id: 'mint-sorbet', name: 'Mint Sorbet',   primary: '#f0fdfa', secondary: '#f0fdfa', description: 'Fresh & Light',     category: 'pastel' },
  { id: 'sky-mirror',  name: 'Sky Mirror',    primary: '#e0f2fe', secondary: '#e0f2fe', description: 'Clear Horizon',     category: 'pastel' },
];

// Helper to determine text contrast
const getContrastColor = (hex: string) => {
  if (!hex) return 'text-white';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? 'text-gray-900' : 'text-white';
};

const BrandingPage = () => {
  const { branding, refresh } = useBranding();

  const [selectedTheme, setSelectedTheme]     = useState<string>('');
  const [localPrimary, setLocalPrimary]       = useState(branding.primaryColor);
  const [localSecondary, setLocalSecondary]   = useState(branding.secondaryColor);
  const [localLogo, setLocalLogo]             = useState<string | null>(branding.logo);
  const [solidMode, setSolidMode]             = useState(branding.primaryColor === branding.secondaryColor);

  const [saving, setSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState(false);
  const [loadingBranding, setLoadingBranding] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load latest branding from API on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/tenants/current/features');
        const b = (res as any)?.data?.branding;
        if (b) {
          const p = b.primaryColor || branding.primaryColor;
          const s = b.secondaryColor || branding.secondaryColor;
          const l = b.logo || null;
          setLocalPrimary(p);
          setLocalSecondary(s);
          setLocalLogo(l);
          setSolidMode(p === s);
          const match = themes.find(t => t.primary === p && t.secondary === s);
          if (match) setSelectedTheme(match.id);
        }
      } catch {
        const match = themes.find(t => t.primary === branding.primaryColor && t.secondary === branding.secondaryColor);
        if (match) setSelectedTheme(match.id);
      } finally {
        setLoadingBranding(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync context → local when context changes externally
  useEffect(() => {
    setLocalPrimary(branding.primaryColor);
    setLocalSecondary(branding.secondaryColor);
    setLocalLogo(branding.logo);
    setSolidMode(branding.primaryColor === branding.secondaryColor);
  }, [branding.primaryColor, branding.secondaryColor, branding.logo]);

  const handleThemeSelect = (theme: Theme) => {
    setSelectedTheme(theme.id);
    setLocalPrimary(theme.primary);
    setLocalSecondary(theme.secondary);
    setSolidMode(theme.primary === theme.secondary);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (PNG, JPG, SVG, GIF).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be smaller than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const data = reader.result as string;
      setLocalLogo(data);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLocalLogo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    const toastId = toast.loading('Saving branding…');
    try {
      const userStr = sessionStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const tenantId = user?.tenantId;
      if (!tenantId) {
        toast.error('Tenant context not found. Please log out and log in again.', { id: toastId });
        setSaving(false);
        return;
      }
      await api.patch(`/tenants/${tenantId}/branding`, {
        logoUrl: localLogo,
        primaryColor: localPrimary,
        secondaryColor: localSecondary,
      });
      await refresh();
      setSaveSuccess(true);
      toast.success('Branding saved successfully! Changes are now visible to all users.', { id: toastId });
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save branding. Please try again.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const toggleSolidMode = () => {
    const nextSolid = !solidMode;
    setSolidMode(nextSolid);
    if (nextSolid) {
      setLocalSecondary(localPrimary);
    }
  };

  if (loadingBranding) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const renderThemeGroup = (title: string, category: 'vibrant' | 'solid' | 'pastel') => (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] px-1">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {themes.filter(theme => theme.category === category).map((theme) => {
          const active = selectedTheme === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => handleThemeSelect(theme)}
              className={`relative group p-4 rounded-2xl border-2 transition-all duration-300 text-left ${
                active
                  ? 'border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-100/50 scale-[1.02]'
                  : 'border-gray-100 bg-gray-50/50 hover:border-indigo-200 hover:bg-white hover:shadow-md'
              }`}
            >
              {active && (
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                  <Check className="w-4 h-4" />
                </span>
              )}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl shadow-inner border-2 border-white" style={{ backgroundColor: theme.primary }} />
                {theme.category === 'vibrant' && (
                  <div className="w-10 h-10 rounded-xl shadow-inner border-2 border-white" style={{ backgroundColor: theme.secondary }} />
                )}
              </div>
              <p className={`text-[13px] font-bold tracking-tight ${active ? 'text-indigo-900' : 'text-gray-900'}`}>{theme.name}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mt-1">{theme.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <Toaster position="top-right" />
      <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
        {/* Hero Header */}
        <div
          className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColor || '#4f46e5'}, ${branding.secondaryColor || '#ec4899'})` }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}
          />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Palette className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight flex items-center gap-3">
                  Local Branding
                  <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-white text-[10px] sm:text-xs font-black uppercase tracking-widest border border-white/20">
                    Portal Settings
                  </span>
                </h1>
                <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">
                  Customize your organisation's visual identity. Changes are global.
                </p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-60 font-bold px-6 py-2.5 sm:py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-95"
            >
              {saving ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> <span className="hidden sm:inline">Saving…</span></>
              ) : saveSuccess ? (
                <><Check className="w-5 h-5 text-green-600" /> <span className="hidden sm:inline">All Saved!</span></>
              ) : (
                <><Save className="w-5 h-5 relative -top-px" /> <span className="hidden sm:inline">Save Branding</span></>
              )}
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl px-5 py-4 text-sm font-bold shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4" />
            </div>
            Branding saved successfully! Changes are now visible to all users.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Configuration */}
          <div className="lg:col-span-8 space-y-6">
            {/* Logo Section */}
            <section className="bg-white border border-gray-100 rounded-[2rem] shadow-sm p-8 transition-all hover:shadow-md">
              <h2 className="text-base font-black text-gray-900 flex items-center gap-3 mb-8">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Sparkles className="w-5 h-5" />
                </div>
                Organisation Logo
              </h2>

              <div className="flex flex-col sm:flex-row items-center gap-8">
                <div className="relative group flex-shrink-0">
                  <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-2xl ring-1 ring-gray-100 flex items-center justify-center bg-gray-50 transition-transform group-hover:scale-105 duration-500">
                    {localLogo ? (
                      <img src={localLogo} alt="Logo" className="w-full h-full object-contain p-4" />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-gray-200" />
                    )}
                  </div>
                  {localLogo && (
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute -top-2 -right-2 w-8 h-8 bg-white text-red-500 rounded-full flex items-center justify-center shadow-xl border border-gray-100 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-4 text-center sm:text-left">
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">
                    Upload a high-resolution logo. We recommend SVG or Transparent PNG for the best experience across all themes.
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                    <label className="flex items-center gap-2 cursor-pointer bg-gray-900 hover:bg-black text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 text-sm">
                      <Upload className="w-4 h-4" />
                      {localLogo ? 'Replace Identity' : 'Upload Logo'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    {localLogo && (
                      <button
                        onClick={handleRemoveLogo}
                        className="flex items-center gap-2 text-gray-500 hover:text-red-600 font-bold px-6 py-3 rounded-xl border border-gray-100 hover:border-red-100 transition-all text-sm"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Theme Groups */}
            <section className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm p-8 space-y-10">
              <h2 className="text-base font-black text-gray-900 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
                  <Palette className="w-5 h-5" />
                </div>
                Theme Presets
              </h2>

              {renderThemeGroup('Vibrant Gradients', 'vibrant')}
              {renderThemeGroup('Solid Gems (Plain Colors)', 'solid')}
              {renderThemeGroup('Soft Pastels (Light Plain)', 'pastel')}
            </section>

            {/* Custom Controls */}
            <section className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-base font-black text-gray-900 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-pink-50 text-pink-600">
                    <Palette className="w-5 h-5" />
                  </div>
                  Custom Colors
                </h2>
                {/* Solid Mode Toggle */}
                <button
                  onClick={toggleSolidMode}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all font-bold text-xs uppercase tracking-widest ${
                    solidMode
                      ? 'bg-gray-900 border-gray-900 text-white shadow-lg'
                      : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-100 hover:text-indigo-500'
                  }`}
                >
                  {solidMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  Solid Mode
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Primary */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Primary Base</label>
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-tighter">Main Brand</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={localPrimary}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLocalPrimary(val);
                        if (solidMode) setLocalSecondary(val);
                        setSelectedTheme('');
                      }}
                      className="w-16 h-16 rounded-2xl border-4 border-white shadow-xl cursor-pointer p-1"
                    />
                    <input
                      type="text"
                      value={localPrimary}
                      onChange={(e) => setLocalPrimary(e.target.value)}
                      className="flex-1 px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 transition-all uppercase"
                    />
                  </div>
                </div>

                {/* Secondary */}
                <div className={`space-y-4 transition-all duration-300 ${solidMode ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Secondary Accent</label>
                    <span className="text-[10px] font-bold text-violet-500 bg-violet-50 px-2 py-0.5 rounded uppercase tracking-tighter">Gradients</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={localSecondary}
                      onChange={(e) => {
                        setLocalSecondary(e.target.value);
                        setSelectedTheme('');
                      }}
                      className="w-16 h-16 rounded-2xl border-4 border-white shadow-xl cursor-pointer p-1"
                    />
                    <input
                      type="text"
                      value={localSecondary}
                      onChange={(e) => setLocalSecondary(e.target.value)}
                      className="flex-1 px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 transition-all uppercase"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Live Preview Sidebar */}
          <div className="lg:col-span-4 sticky top-6 space-y-6">
            <section className="bg-white border border-gray-100 rounded-[2.5rem] shadow-xl p-8 overflow-hidden">
              <h2 className="text-base font-black text-gray-900 flex items-center gap-3 mb-8">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600">
                  <Eye className="w-5 h-5" />
                </div>
                Live Preview
              </h2>

              <div className="rounded-3xl overflow-hidden border border-gray-100 shadow-2xl relative">
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-6 py-4"
                  style={{
                    background: solidMode
                      ? localPrimary
                      : `linear-gradient(to right, ${localPrimary}, ${localSecondary})`,
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center p-1 shadow-inner">
                    {localLogo ? (
                      <img src={localLogo} className="w-full h-full object-contain" alt="Logo preview" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-gray-200" />
                    )}
                  </div>
                  <span className={`text-xs font-black tracking-tight ${getContrastColor(localPrimary)}`}>
                    Organisation
                  </span>
                </div>

                {/* Body */}
                <div className="bg-gray-50 p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2].map(i => (
                      <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center">
                        <p className="text-xl font-black" style={{ color: i === 1 ? localPrimary : localSecondary }}>
                          {i === 1 ? '85%' : '12k'}
                        </p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                          {i === 1 ? 'Score' : 'Visits'}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <button
                      className={`w-full py-3.5 rounded-2xl text-xs font-black shadow-lg shadow-black/5 transition-transform active:scale-95 ${getContrastColor(localPrimary)}`}
                      style={{
                        background: solidMode
                          ? localPrimary
                          : `linear-gradient(to right, ${localPrimary}, ${localSecondary})`,
                      }}
                    >
                      Primary Action
                    </button>
                    <p
                      className="text-center text-[11px] font-bold underline transition-colors cursor-pointer"
                      style={{ color: localPrimary }}
                    >
                      System Logs
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 border-dashed text-center">
                <p className="text-sm font-bold text-indigo-900">Responsive Ready</p>
                <p className="text-[11px] font-medium text-indigo-500 mt-1 leading-relaxed">
                  Preview how your branding appears on mobile and desktop portals.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default BrandingPage;
