'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Calendar, CheckCircle, Clock, Users, Edit3, X, Plus, AlertTriangle } from 'lucide-react';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

interface AvailSlot { dayOfWeek: number; startTime: string; endTime: string; }
interface AssignedSlot { dayOfWeek: number; startTime: string; endTime: string; batchName: string; }
interface FreeWindow { dayOfWeek: number; startTime: string; endTime: string; }

interface TeacherAvailability {
  teacher: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    classesCompleted?: number;
    classesMissed?: number;
    classesCancelled?: number;
    punctualityScore?: number;
  };
  totalBaseSlots: number;
  totalAssignedSlots: number;
  totalFreeWindows: number;
  totalBaseMinutes: number;
  totalAssignedMinutes: number;
  totalFreeMinutes: number;
  utilization: number;
  availabilityConfigured: boolean;
  availableSlots?: AvailSlot[];
  assignedSlots?: AssignedSlot[];
  freeWindows?: FreeWindow[];
}

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

export default function TeacherAvailabilityPage() {
  const { branding } = useBranding();
  const primaryColor = branding.primaryColor;
  const secondaryColor = branding.secondaryColor;

  const [data, setData] = useState<TeacherAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit availability modal state
  const [editTeacher, setEditTeacher] = useState<TeacherAvailability | null>(null);
  const [editSlots, setEditSlots] = useState<AvailSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => { fetchAvailability(); }, []);

  const fetchAvailability = async () => {
    try {
      const res = await api.get<any>('/teacher-availability/all');
      setData(res.data || []);
    } catch (err: any) {
      console.error('Failed to fetch availability:', err);
      toast.error('Failed to fetch availability');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (t: TeacherAvailability, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTeacher(t);
    setEditSlots(
      t.availableSlots?.length
        ? t.availableSlots.map(s => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime }))
        : [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
    );
    setEditError(null);
  };

  const handleSaveAvailability = async () => {
    if (!editTeacher) return;
    setSaving(true);
    setEditError(null);
    try {
      await api.put<any>(`/teacher-availability/${editTeacher.teacher._id}`, { slots: editSlots });
      setEditTeacher(null);
      toast.success('Availability saved successfully');
      fetchAvailability();
    } catch (err: any) {
      const msg = err?.message;
      setEditError(Array.isArray(msg) ? msg.join('\n') : msg || 'Failed to save availability');
      toast.error('Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const configuredTeachers = data.filter(t => t.availabilityConfigured);
  const totalBaseMin = data.reduce((s, t) => s + (t.totalBaseMinutes || 0), 0);
  const totalAssignedMin = data.reduce((s, t) => s + (t.totalAssignedMinutes || 0), 0);
  const totalFreeMin = data.reduce((s, t) => s + (t.totalFreeMinutes || 0), 0);
  const avgUtilization = configuredTeachers.length > 0
    ? Math.round(configuredTeachers.reduce((s, t) => s + t.utilization, 0) / configuredTeachers.length)
    : 0;

  const getUtilColor = (u: number) =>
    u >= 80 ? 'text-red-600' : u >= 50 ? 'text-amber-600' : 'text-green-600';
  const getUtilBg = (u: number) =>
    u >= 80 ? 'bg-red-500' : u >= 50 ? 'bg-amber-500' : 'bg-green-500';
  const getPunctualityColor = (s: number | undefined) => {
    if (s == null) return 'text-gray-500';
    return s >= 80 ? 'text-green-600' : s >= 50 ? 'text-amber-600' : 'text-red-600';
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster />
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
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
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Teacher Availability</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">View slot allocation and availability across teachers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="p-4 bg-cyan-50 rounded-xl">
          <p className="text-sm text-cyan-600">Total Teachers</p>
          <p className="text-2xl font-bold text-cyan-800">{data.length}</p>
          {data.length > configuredTeachers.length && (
            <p className="text-xs text-amber-600 mt-1">{data.length - configuredTeachers.length} not configured</p>
          )}
        </div>
        <div className="p-4 bg-blue-50 rounded-xl">
          <p className="text-sm text-blue-600">Total Base Hours</p>
          <p className="text-2xl font-bold text-blue-800">{formatMinutes(totalBaseMin)}</p>
        </div>
        <div className="p-4 bg-purple-50 rounded-xl">
          <p className="text-sm text-purple-600">Assigned Time</p>
          <p className="text-2xl font-bold text-purple-800">{formatMinutes(totalAssignedMin)}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-xl">
          <p className="text-sm text-green-600">Free Time</p>
          <p className="text-2xl font-bold text-green-800">{formatMinutes(totalFreeMin)}</p>
        </div>
        <div className="p-4 bg-amber-50 rounded-xl">
          <p className="text-sm text-amber-600">Avg Utilization</p>
          <p className="text-2xl font-bold text-amber-800">
            {configuredTeachers.length > 0 ? `${avgUtilization}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Teachers */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No teachers found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(t => (
            <div key={t.teacher._id} className="bg-white border rounded-xl overflow-hidden">
              <div
                className="p-4 flex items-center justify-between flex-wrap gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === t.teacher._id ? null : t.teacher._id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center text-cyan-700 font-bold">
                    {t.teacher.firstName?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{t.teacher.firstName} {t.teacher.lastName}</p>
                    <p className="text-xs text-gray-400">{t.teacher.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {t.availabilityConfigured ? (
                    <>
                      <div className="hidden sm:flex items-center gap-5">
                        <div className="text-center">
                          <p className="text-xs text-gray-400">Assigned</p>
                          <p className="font-bold text-gray-700">{formatMinutes(t.totalAssignedMinutes)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400">Free</p>
                          <p className="font-bold text-green-600">{formatMinutes(t.totalFreeMinutes)}</p>
                        </div>
                        <div className="w-20">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold ${getUtilColor(t.utilization)}`}>{t.utilization}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full">
                            <div className={`h-2 rounded-full ${getUtilBg(t.utilization)}`} style={{ width: `${Math.min(t.utilization, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => openEditModal(t, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Availability
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => openEditModal(t, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Availability Not Configured
                    </button>
                  )}
                </div>
              </div>

              {expandedId === t.teacher._id && (
                <div className="border-t px-4 py-3 bg-gray-50">
                  {/* Class Statistics */}
                  <div className="mb-4 pb-4 border-b">
                    <h4 className="font-medium text-sm mb-3 flex items-center gap-1 text-gray-700">
                      <CheckCircle className="w-3 h-3" /> Class Statistics
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600">Classes Completed</p>
                        <p className="font-bold text-green-800">{t.teacher.classesCompleted ?? '—'}</p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600">Classes Missed</p>
                        <p className="font-bold text-red-800">{t.teacher.classesMissed ?? '—'}</p>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-lg">
                        <p className="text-xs text-amber-600">Classes Cancelled</p>
                        <p className="font-bold text-amber-800">{t.teacher.classesCancelled ?? '—'}</p>
                      </div>
                      <div className="p-3 bg-cyan-50 rounded-lg">
                        <p className="text-xs text-cyan-600">Punctuality Score</p>
                        <p className={`font-bold ${getPunctualityColor(t.teacher.punctualityScore)}`}>
                          {t.teacher.punctualityScore != null ? `${t.teacher.punctualityScore}%` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {!t.availabilityConfigured ? (
                    <div className="text-center py-6">
                      <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                      <p className="text-gray-600 font-medium">No availability configured</p>
                      <p className="text-sm text-gray-400 mb-3">Set availability to enable batch assignment and scheduling.</p>
                      <button
                        onClick={(e) => openEditModal(t, e)}
                        className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium"
                      >
                        Configure Availability
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Base Availability */}
                      <div className="mb-4 pb-4 border-b">
                        <h4 className="font-medium text-sm mb-2 flex items-center gap-1 text-blue-700">
                          <Calendar className="w-3 h-3" /> Base Availability (Declared)
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {(t.availableSlots || []).map((s, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs">
                              <span className="font-semibold">{DAY_NAMES_SHORT[s.dayOfWeek]}</span>
                              {s.startTime} - {s.endTime}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {/* Assigned Slots */}
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-1 text-purple-700">
                            <Clock className="w-3 h-3" /> Assigned Slots ({t.totalAssignedSlots})
                          </h4>
                          {(t.assignedSlots || []).length === 0 ? (
                            <p className="text-sm text-gray-400">No assigned slots</p>
                          ) : (
                            <div className="space-y-1">
                              {(t.assignedSlots || []).map((s, i) => (
                                <div key={i} className="text-sm flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                    {DAY_NAMES_SHORT[s.dayOfWeek]}
                                  </span>
                                  <span className="text-gray-600">{s.startTime} - {s.endTime}</span>
                                  <span className="text-gray-400 text-xs">({s.batchName})</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Computed Free Windows */}
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-1 text-green-700">
                            <Calendar className="w-3 h-3" /> Remaining Free Time ({t.totalFreeWindows} window{t.totalFreeWindows !== 1 ? 's' : ''})
                          </h4>
                          {(t.freeWindows || []).length === 0 ? (
                            <p className="text-sm text-gray-400">Fully booked — no free time remaining</p>
                          ) : (
                            <div className="space-y-1">
                              {(t.freeWindows || []).map((s, i) => (
                                <div key={i} className="text-sm flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                    {DAY_NAMES_SHORT[s.dayOfWeek]}
                                  </span>
                                  <span className="text-gray-600">{s.startTime} - {s.endTime}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Availability Modal */}
      {editTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {editTeacher.availabilityConfigured ? 'Edit Availability' : 'Configure Availability'}
                  </h2>
                  <p className="text-amber-100 text-sm mt-0.5">
                    {editTeacher.teacher.firstName} {editTeacher.teacher.lastName}
                  </p>
                </div>
                <button onClick={() => setEditTeacher(null)} className="text-white/80 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Define the weekly time windows when this teacher is available. Batch schedules must fit within these windows and cannot overlap with each other.
              </p>

              {editSlots.map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={slot.dayOfWeek}
                    onChange={(e) => {
                      const updated = [...editSlots];
                      updated[idx] = { ...updated[idx], dayOfWeek: Number(e.target.value) };
                      setEditSlots(updated);
                    }}
                    className="px-2 py-2 border border-gray-200 rounded-lg bg-white text-sm min-w-[100px]"
                  >
                    {DAY_NAMES_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => {
                      const updated = [...editSlots];
                      updated[idx] = { ...updated[idx], startTime: e.target.value };
                      setEditSlots(updated);
                    }}
                    className="px-2 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => {
                      const updated = [...editSlots];
                      updated[idx] = { ...updated[idx], endTime: e.target.value };
                      setEditSlots(updated);
                    }}
                    className="px-2 py-2 border border-gray-200 rounded-lg bg-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setEditSlots(editSlots.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setEditSlots([...editSlots, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }])}
                className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-800 font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Slot
              </button>

              {editTeacher.totalAssignedSlots > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-sm text-blue-800">
                    This teacher has {editTeacher.totalAssignedSlots} active batch assignment(s). Ensure new availability still covers assigned slots.
                  </p>
                </div>
              )}

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-800 text-sm whitespace-pre-line">{editError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTeacher(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAvailability}
                  disabled={saving || editSlots.length === 0}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium"
                >
                  {saving ? 'Saving...' : 'Save Availability'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
