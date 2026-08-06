'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Calendar, Plus, Trash2, Save } from 'lucide-react';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

interface Slot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface AvailabilityData {
  maxSlotsPerWeek: number;
  totalAvailable: number;
  totalAssigned: number;
  totalFree: number;
  utilization: number;
  availableSlots: Slot[];
  assignedSlots: (Slot & { batchName: string })[];
  freeSlots: Slot[];
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TeacherAvailabilityPage() {
  const { branding } = useBranding();
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [maxSlots, setMaxSlots] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAvailability();
  }, []);

  const fetchAvailability = async () => {
    try {
      const res = await api.get<any>('/teacher-availability/me');
      const d = res.data;
      setData(d);
      setSlots(d?.availableSlots || []);
      setMaxSlots(d?.maxSlotsPerWeek || 20);
    } catch (err: unknown) {
      console.error('Failed to fetch availability:', err);
    } finally {
      setLoading(false);
    }
  };

  const addSlot = () => {
    setSlots([...slots, { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }]);
  };

  const removeSlot = (idx: number) => {
    setSlots(slots.filter((_, i) => i !== idx));
  };

  const updateSlot = (idx: number, field: string, value: any) => {
    const updated = [...slots];
    (updated[idx] as any)[field] = field === 'dayOfWeek' ? Number(value) : value;
    setSlots(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put<any>('/teacher-availability/me', { slots, maxSlotsPerWeek: maxSlots });
      await fetchAvailability();
      setEditing(false);
    } catch (err: unknown) {
      const error = err as any;
      toast.error('Error: ' + (error?.message || 'Something went wrong'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      <Toaster />
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">My Availability</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Set your weekly available time slots</p>
            </div>
          </div>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="px-4 py-2 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 backdrop-blur-md font-semibold transition-all">
              Edit Availability
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setSlots(data?.availableSlots || []); }} className="px-4 py-2 border border-white/40 rounded-lg text-sm bg-black/20 hover:bg-black/40 text-white transition-all font-semibold">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 font-bold transition-all shadow-lg">
                <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-cyan-50 rounded-xl">
            <p className="text-sm text-cyan-600">Available</p>
            <p className="text-2xl font-bold text-cyan-800">{data.totalAvailable}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-600">Assigned</p>
            <p className="text-2xl font-bold text-blue-800">{data.totalAssigned}</p>
          </div>
          <div className="p-4 bg-green-50 rounded-xl">
            <p className="text-sm text-green-600">Free</p>
            <p className="text-2xl font-bold text-green-800">{data.totalFree}</p>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl">
            <p className="text-sm text-amber-600">Utilization</p>
            <p className="text-2xl font-bold text-amber-800">{data.utilization}%</p>
          </div>
        </div>
      )}

      {/* Editing View */}
      {editing ? (
        <div className="bg-white border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Edit Available Slots</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Max Slots/Week:</label>
              <input type="number" value={maxSlots} onChange={e => setMaxSlots(Number(e.target.value))} className="w-16 border rounded px-2 py-1 text-sm" min={1} />
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {slots.map((slot, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg flex-wrap">
                <select value={slot.dayOfWeek} onChange={e => updateSlot(idx, 'dayOfWeek', e.target.value)} className="border rounded px-2 py-1 text-sm">
                  {dayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <input type="time" value={slot.startTime} onChange={e => updateSlot(idx, 'startTime', e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <span className="text-gray-400">to</span>
                <input type="time" value={slot.endTime} onChange={e => updateSlot(idx, 'endTime', e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <button onClick={() => removeSlot(idx)} className="p-1 text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addSlot} className="flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700">
            <Plus className="w-4 h-4" /> Add Slot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Assigned Slots */}
          <div className="bg-white border rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4">Assigned Slots</h2>
            {(data?.assignedSlots || []).length === 0 ? (
              <p className="text-gray-400 text-sm">No assigned slots</p>
            ) : (
              <div className="space-y-2">
                {(data?.assignedSlots || []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-sm">
                    <span className="px-2 py-0.5 bg-blue-200 text-blue-800 rounded font-medium text-xs">{dayNamesShort[s.dayOfWeek]}</span>
                    <span>{s.startTime} - {s.endTime}</span>
                    <span className="text-gray-400 ml-auto">{s.batchName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Free Slots */}
          <div className="bg-white border rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4 text-green-700">Free Slots</h2>
            {(data?.freeSlots || []).length === 0 ? (
              <p className="text-gray-400 text-sm">No free slots</p>
            ) : (
              <div className="space-y-2">
                {(data?.freeSlots || []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm">
                    <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded font-medium text-xs">{dayNamesShort[s.dayOfWeek]}</span>
                    <span>{s.startTime} - {s.endTime}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
