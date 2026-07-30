'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Award, RefreshCw, Star } from 'lucide-react';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

interface TeacherLevel {
  _id: string;
  teacherId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    classesCompleted?: number;
    classesMissed?: number;
    punctualityScore?: number;
  } | null;
  currentLevel: string;
  totalClassesTaught: number;
  attendanceScore: number;
  homeworkCompletionRate: number;
  overallScore: number;
  classesCompleted?: number;
  classesMissed?: number;
  punctualityScore?: number;
  lastCalculatedAt?: string;
  levelHistory: { month: number; year: number; level: string; score: number }[];
}

const levelConfig: Record<string, { color: string; bgColor: string; icon: string }> = {
  beginner: { color: 'text-blue-700', bgColor: 'bg-blue-100', icon: '🌱' },
  intermediate: { color: 'text-amber-700', bgColor: 'bg-amber-100', icon: '⭐' },
  lead: { color: 'text-purple-700', bgColor: 'bg-purple-100', icon: '👑' },
};

export default function TeacherLevelsPage() {
  const { branding } = useBranding();
  const [levels, setLevels] = useState<TeacherLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    fetchLevels();
  }, []);

  const fetchLevels = async () => {
    try {
      const res = await api.get<any>('/teacher-levels/all');
      setLevels(res.data || []);
    } catch (err: any) {
      console.error('Failed to fetch teacher levels:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api.post<any>('/teacher-levels/recalculate');
      await fetchLevels();
      toast.success('Levels recalculated successfully');
    } catch (err: any) {
      toast.error('Error: ' + (err?.message || 'Failed'));
    } finally {
      setRecalculating(false);
    }
  };

  const stats = {
    beginner: levels.filter(l => l.currentLevel === 'beginner').length,
    intermediate: levels.filter(l => l.currentLevel === 'intermediate').length,
    lead: levels.filter(l => l.currentLevel === 'lead').length,
    avgScore: levels.length > 0 ? Math.round(levels.reduce((s, l) => s + l.overallScore, 0) / levels.length) : 0,
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 lg:space-y-8 pb-12 px-4 sm:px-6 lg:px-8">
      <Toaster />
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
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
              <Award className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Teacher Levels</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Auto-calculated teacher performance levels</p>
            </div>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all duration-200 border border-white/30 text-sm sm:text-base disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating...' : 'Recalculate All'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-xl">
          <p className="text-sm text-blue-600">Beginner</p>
          <p className="text-2xl font-bold text-blue-800">{stats.beginner}</p>
        </div>
        <div className="p-4 bg-amber-50 rounded-xl">
          <p className="text-sm text-amber-600">Intermediate</p>
          <p className="text-2xl font-bold text-amber-800">{stats.intermediate}</p>
        </div>
        <div className="p-4 bg-purple-50 rounded-xl">
          <p className="text-sm text-purple-600">Lead</p>
          <p className="text-2xl font-bold text-purple-800">{stats.lead}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-xl">
          <p className="text-sm text-green-600">Avg Score</p>
          <p className="text-2xl font-bold text-green-800">{stats.avgScore}</p>
        </div>
      </div>

      {/* Teacher List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : levels.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No teacher levels calculated yet</p>
          <p className="text-sm text-gray-400">Click &quot;Recalculate All&quot; to generate levels</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Teacher</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Level</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Score</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Classes</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Classes Completed</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Classes Missed</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Punctuality Score</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Attendance %</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Homework %</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Last Calculated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {levels.map(l => {
                  const cfg = levelConfig[l.currentLevel] || levelConfig.beginner;
                  return (
                    <tr key={l._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {l.teacherId ? `${l.teacherId.firstName} ${l.teacherId.lastName}` : 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-400">{l.teacherId?.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.color}`}>
                          {cfg.icon} {l.currentLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-gray-900">{l.overallScore}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{l.totalClassesTaught}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{l.teacherId?.classesCompleted ?? l.classesCompleted ?? '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{l.teacherId?.classesMissed ?? l.classesMissed ?? '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {(l.teacherId?.punctualityScore ?? l.punctualityScore) != null
                          ? `${l.teacherId?.punctualityScore ?? l.punctualityScore}%`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-16 h-2 bg-gray-200 rounded-full">
                            <div className="h-2 bg-green-500 rounded-full" style={{ width: `${Math.min(l.attendanceScore, 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{l.attendanceScore}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-16 h-2 bg-gray-200 rounded-full">
                            <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${Math.min(l.homeworkCompletionRate, 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{l.homeworkCompletionRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-400">
                        {l.lastCalculatedAt ? new Date(l.lastCalculatedAt).toLocaleDateString() : 'Never'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
