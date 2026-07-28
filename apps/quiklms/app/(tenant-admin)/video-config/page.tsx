'use client';

import { useState, useEffect } from 'react';
import { Video, Settings, Shield, Save, Check, Loader2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';

// ── Types ──────────────────────────────────────────────────────────────────────

type VideoProvider = 'zoom' | 'google_meet' | 'jitsi' | 'manual' | 'none';

interface VideoConfig {
  provider?: VideoProvider;
  zoom?: {
    accountId?: string;
    clientId?: string;
    clientSecret?: string;
  };
  googleMeet?: {
    serviceAccountEmail?: string;
    privateKey?: string;
  };
  jitsi?: {
    serverUrl?: string;
  };
  meetingSettings?: {
    autoRecord?: boolean;
    waitingRoom?: boolean;
    defaultDurationMinutes?: number;
    participantVideoOn?: boolean;
    participantAudioOn?: boolean;
    recordingRetentionDays?: number;
  };
}

const PROVIDERS: { value: VideoProvider; label: string }[] = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'jitsi', label: 'Jitsi' },
  { value: 'manual', label: 'Manual' },
  { value: 'none', label: 'None' },
];

const DEFAULT_CONFIG: VideoConfig = {
  provider: 'none',
  zoom: { accountId: '', clientId: '', clientSecret: '' },
  googleMeet: { serviceAccountEmail: '', privateKey: '' },
  jitsi: { serverUrl: '' },
  meetingSettings: {
    autoRecord: false,
    waitingRoom: false,
    defaultDurationMinutes: 60,
    participantVideoOn: true,
    participantAudioOn: true,
    recordingRetentionDays: 30,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

const VideoConfigPage = () => {
  const { branding } = useBranding();
  const [orgId, setTenantId] = useState<string | null>(null);
  const [config, setConfig] = useState<VideoConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    const userStr = sessionStorage.getItem('user') || '{}';
    const user = JSON.parse(userStr) as { orgId?: string };
    const id = user.orgId || null;
    setTenantId(id);
  }, []);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const res = await api.get<any>(`/tenants/${orgId}/video-config`);
        const data = (res.data as { data?: VideoConfig } & VideoConfig)?.data || res.data;
        setConfig({
          provider: (data as VideoConfig).provider || 'none',
          zoom: {
            accountId: (data as VideoConfig).zoom?.accountId ?? '',
            clientId: (data as VideoConfig).zoom?.clientId ?? '',
            clientSecret: (data as VideoConfig).zoom?.clientSecret ?? '',
          },
          googleMeet: {
            serviceAccountEmail: (data as VideoConfig).googleMeet?.serviceAccountEmail ?? '',
            privateKey: (data as VideoConfig).googleMeet?.privateKey ?? '',
          },
          jitsi: {
            serverUrl: (data as VideoConfig).jitsi?.serverUrl ?? '',
          },
          meetingSettings: {
            autoRecord: (data as VideoConfig).meetingSettings?.autoRecord ?? false,
            waitingRoom: (data as VideoConfig).meetingSettings?.waitingRoom ?? false,
            defaultDurationMinutes: (data as VideoConfig).meetingSettings?.defaultDurationMinutes ?? 60,
            participantVideoOn: (data as VideoConfig).meetingSettings?.participantVideoOn ?? true,
            participantAudioOn: (data as VideoConfig).meetingSettings?.participantAudioOn ?? true,
            recordingRetentionDays: (data as VideoConfig).meetingSettings?.recordingRetentionDays ?? 30,
          },
        });
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message;
        toast.error(msg || 'Failed to load video config');
        setConfig(DEFAULT_CONFIG);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [orgId]);

  const handleTestConnection = () => {
    setTestSuccess(null);

    // Validate that the required credential fields for the selected provider are
    // present before reporting success. (No live provider ping is performed.)
    const missing: string[] = [];
    if (config.provider === 'zoom') {
      if (!config.zoom?.accountId?.trim()) missing.push('Account ID');
      if (!config.zoom?.clientId?.trim()) missing.push('Client ID');
      if (!config.zoom?.clientSecret?.trim()) missing.push('Client Secret');
    } else if (config.provider === 'google_meet') {
      if (!config.googleMeet?.serviceAccountEmail?.trim()) missing.push('Service Account Email');
      if (!config.googleMeet?.privateKey?.trim()) missing.push('Private Key');
    } else if (config.provider === 'jitsi') {
      // Jitsi can use the public server when no URL is provided — nothing required.
    }

    if (missing.length > 0) {
      setTestSuccess(false);
      toast.error(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
      return;
    }

    setTestSuccess(true);
    toast.success('Configuration looks valid. Save to apply.');
  };

  const handleSave = async () => {
    if (!orgId) {
      toast.error('Tenant ID not found. Please log in again.');
      return;
    }
    try {
      setSaving(true);
      await api.patch<any>(`/tenants/${orgId}/video-config`, config);
      toast.success('Video configuration saved successfully.');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      toast.error(msg || 'Failed to save video config');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (updates: Partial<VideoConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const updateMeetingSettings = (updates: Partial<VideoConfig['meetingSettings']>) => {
    setConfig((prev) => ({
      ...prev,
      meetingSettings: { ...prev.meetingSettings, ...updates },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <span className="ml-3 text-gray-500 dark:text-gray-400">Loading video configuration...</span>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 p-8 text-center">
        <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-600 dark:text-red-400 font-medium">Tenant ID not found. Please log in again.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-10 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Video className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Video Conferencing</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Configure your video provider and meeting settings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-500" />
          Provider
        </h2>
        <div className="flex flex-wrap gap-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => updateConfig({ provider: p.value })}
              className={`px-4 py-2.5 rounded-xl font-medium transition ${
                config.provider === p.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Credentials (based on provider) */}
      {(config.provider === 'zoom' || config.provider === 'google_meet' || config.provider === 'jitsi') && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            Credentials
          </h2>

          {config.provider === 'zoom' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Account ID</label>
                <input
                  type="text"
                  value={config.zoom?.accountId ?? ''}
                  onChange={(e) => updateConfig({ zoom: { ...config.zoom, accountId: e.target.value } })}
                  placeholder="Zoom Account ID"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Client ID</label>
                <input
                  type="text"
                  value={config.zoom?.clientId ?? ''}
                  onChange={(e) => updateConfig({ zoom: { ...config.zoom, clientId: e.target.value } })}
                  placeholder="Zoom Client ID"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Client Secret</label>
                <input
                  type="password"
                  value={config.zoom?.clientSecret ?? ''}
                  onChange={(e) => updateConfig({ zoom: { ...config.zoom, clientSecret: e.target.value } })}
                  placeholder="Zoom Client Secret"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}

          {config.provider === 'google_meet' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Service Account Email</label>
                <input
                  type="email"
                  value={config.googleMeet?.serviceAccountEmail ?? ''}
                  onChange={(e) => updateConfig({ googleMeet: { ...config.googleMeet, serviceAccountEmail: e.target.value } })}
                  placeholder="service-account@project.iam.gserviceaccount.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Private Key</label>
                <textarea
                  value={config.googleMeet?.privateKey ?? ''}
                  onChange={(e) => updateConfig({ googleMeet: { ...config.googleMeet, privateKey: e.target.value } })}
                  placeholder="Paste your service account private key (PEM format)"
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                />
              </div>
            </div>
          )}

          {config.provider === 'jitsi' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Server URL (optional)</label>
              <input
                type="url"
                value={config.jitsi?.serverUrl ?? ''}
                onChange={(e) => updateConfig({ jitsi: { ...config.jitsi, serverUrl: e.target.value } })}
                placeholder="https://meet.jit.si"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Meeting Settings */}
      {config.provider !== 'none' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-500" />
            Meeting Settings
          </h2>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-record meetings</label>
              <button
                type="button"
                onClick={() => updateMeetingSettings({ autoRecord: !config.meetingSettings?.autoRecord })}
                className={`relative w-12 h-6 rounded-full transition ${config.meetingSettings?.autoRecord ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition left-1 ${config.meetingSettings?.autoRecord ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Waiting room</label>
              <button
                type="button"
                onClick={() => updateMeetingSettings({ waitingRoom: !config.meetingSettings?.waitingRoom })}
                className={`relative w-12 h-6 rounded-full transition ${config.meetingSettings?.waitingRoom ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition left-1 ${config.meetingSettings?.waitingRoom ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default duration: {config.meetingSettings?.defaultDurationMinutes ?? 60} minutes
              </label>
              <input
                type="range"
                min={15}
                max={240}
                step={15}
                value={config.meetingSettings?.defaultDurationMinutes ?? 60}
                onChange={(e) => updateMeetingSettings({ defaultDurationMinutes: parseInt(e.target.value, 10) })}
                className="w-full h-2 rounded-full appearance-none bg-gray-200 dark:bg-gray-600 accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>15 min</span>
                <span>240 min</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Participant video on by default</label>
              <button
                type="button"
                onClick={() => updateMeetingSettings({ participantVideoOn: !config.meetingSettings?.participantVideoOn })}
                className={`relative w-12 h-6 rounded-full transition ${config.meetingSettings?.participantVideoOn ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition left-1 ${config.meetingSettings?.participantVideoOn ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Participant audio on by default</label>
              <button
                type="button"
                onClick={() => updateMeetingSettings({ participantAudioOn: !config.meetingSettings?.participantAudioOn })}
                className={`relative w-12 h-6 rounded-full transition ${config.meetingSettings?.participantAudioOn ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition left-1 ${config.meetingSettings?.participantAudioOn ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Recording retention (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={config.meetingSettings?.recordingRetentionDays ?? 30}
                onChange={(e) => updateMeetingSettings({ recordingRetentionDays: parseInt(e.target.value, 10) || 30 })}
                className="w-full max-w-[140px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-4">
        {(config.provider === 'zoom' || config.provider === 'google_meet' || config.provider === 'jitsi') && (
          <button
            onClick={handleTestConnection}
            className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition"
          >
            {testSuccess === true ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                Configuration valid
              </>
            ) : testSuccess === false ? (
              <>
                <Shield className="w-4 h-4 text-red-500" />
                Missing fields
              </>
            ) : (
              <>Test Connection</>
            )}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default VideoConfigPage;
