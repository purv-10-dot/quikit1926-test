'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Award, BookOpen, Users, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Clock,
} from 'lucide-react';
import { useBranding } from '@/app/providers';

interface LevelHistory {
  month: number;
  year: number;
  level: string;
  score: number;
  calculatedAt?: string;
}

interface LevelData {
  _id: string;
  currentLevel: string;
  totalClassesTaught: number;
  attendanceScore: number;
  homeworkCompletionRate: number;
  classesMissed: number;
  overallScore: number;
  lastCalculatedAt?: string;
  levelHistory: LevelHistory[];
}

// Hardcoded defaults (matching backend defaults); backend may override via tenant config
const THRESHOLDS = {
  beginner: { min: 0, max: 79, nextAt: 80 },
  intermediate: { min: 80, max: 199, nextAt: 200 },
  lead: { min: 200, max: Infinity, nextAt: null },
};

const LEVEL_META: Record<string, { label: string; icon: string; color: string; bg: string; ring: string; barColor: string }> = {
  beginner: {
    label: 'Beginner',
    icon: '🌱',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    ring: 'ring-blue-300',
    barColor: 'bg-blue-500',
  },
  intermediate: {
    label: 'Intermediate',
    icon: '⭐',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    ring: 'ring-amber-300',
    barColor: 'bg-amber-500',
  },
  lead: {
    label: 'Lead Teacher',
    icon: '👑',
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    ring: 'ring-purple-300',
    barColor: 'bg-purple-500',
  },
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ProgressBar = ({ value, max, colorClass }: { value: number; max: number; colorClass: string }) => (
  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
    <div
      className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
      style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }}
    />
  </div>
);

export default function TeacherLevelPage() {
  const { branding } = useBranding();
  const [data, setData] = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formulaOpen, setFormulaOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<any>('/teacher-levels/me');
        setData(res.data || null);
      } catch (err: unknown) {
        console.error('Failed to fetch level:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-500">
        Level data is not available yet. Complete some classes to get started.
      </div>
    );
  }

  const levelKey = data.currentLevel?.toLowerCase() || 'beginner';
  const meta = LEVEL_META[levelKey] || LEVEL_META.beginner;
  const threshold = THRESHOLDS[levelKey as keyof typeof THRESHOLDS] || THRESHOLDS.beginner;

  const nextLevelKey = levelKey === 'beginner' ? 'intermediate' : levelKey === 'intermediate' ? 'lead' : null;
  const nextMeta = nextLevelKey ? LEVEL_META[nextLevelKey] : null;
  const progressPct = threshold.nextAt
    ? Math.min(100, Math.round(((data.overallScore - threshold.min) / (threshold.nextAt - threshold.min)) * 100))
    : 100;
  const pointsToNext = threshold.nextAt ? Math.max(0, threshold.nextAt - data.overallScore) : 0;

  const missedPenalty = (data.classesMissed || 0) * 5;
  const attendancePts = +(data.attendanceScore * 0.3).toFixed(1);
  const homeworkPts = +(data.homeworkCompletionRate * 0.2).toFixed(1);
  const classPts = data.totalClassesTaught * 2;

  const lastCalcStr = data.lastCalculatedAt
    ? new Date(data.lastCalculatedAt).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">

      {/* Hero Level Banner */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-6 sm:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl sm:text-3xl lg:text-4xl">
              {meta.icon}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Teacher Level</h1>
              <p className="text-indigo-100 text-sm sm:text-base lg:text-lg font-light mt-1">Track your performance and progress</p>
            </div>
          </div>
          {lastCalcStr && (
            <p className="flex items-center gap-1.5 text-sm text-indigo-100 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md border border-white/10">
              <Clock className="w-4 h-4" />
              Last updated: {lastCalcStr}
            </p>
          )}
        </div>
      </div>

      {/* Level Progress Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl ${meta.bg} flex items-center justify-center text-4xl`}>
              {meta.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Your Current Level</p>
              <h2 className="text-2xl font-bold text-gray-900">{meta.label} <span className="text-base font-medium text-gray-500 ml-2">({data.overallScore} pts)</span></h2>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-2.5">
            <span className="font-medium">
              {threshold.nextAt
                ? `Progress to ${nextMeta?.label ?? 'next level'}`
                : 'Maximum level reached'}
            </span>
            <span className="font-bold text-gray-900">
              {threshold.nextAt
                ? `${data.overallScore} / ${threshold.nextAt} pts`
                : `${data.overallScore} pts`}
            </span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
            <div
              className={`h-full rounded-full transition-all duration-700 ${meta.barColor || 'bg-indigo-500'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {threshold.nextAt && pointsToNext > 0 && (
            <p className="mt-3 text-sm text-gray-500 font-medium">
              Earn <span className="text-gray-900 font-bold">{pointsToNext} more point{pointsToNext !== 1 ? 's' : ''}</span> to reach {nextMeta?.label ?? 'next level'} {nextMeta?.icon}
            </p>
          )}
          {!threshold.nextAt && (
            <p className="mt-3 text-sm text-gray-500 font-medium">You have reached the highest level!</p>
          )}
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Classes Taught */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg"><BookOpen className="w-4 h-4 text-blue-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Classes Taught</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.totalClassesTaught}</p>
          <p className="text-xs text-blue-600 mt-1">+{classPts} pts (x2)</p>
        </div>

        {/* Attendance Score */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-green-100 rounded-lg"><Users className="w-4 h-4 text-green-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Attendance</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.attendanceScore}%</p>
          <p className="text-xs text-green-600 mt-1">+{attendancePts} pts (x0.3)</p>
          <div className="mt-2">
            <ProgressBar value={data.attendanceScore} max={100} colorClass="bg-green-500" />
          </div>
        </div>

        {/* Homework Rate */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-purple-100 rounded-lg"><TrendingUp className="w-4 h-4 text-purple-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Homework</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{data.homeworkCompletionRate}%</p>
          <p className="text-xs text-purple-600 mt-1">+{homeworkPts} pts (x0.2)</p>
          <div className="mt-2">
            <ProgressBar value={data.homeworkCompletionRate} max={100} colorClass="bg-purple-500" />
          </div>
        </div>

        {/* Classes Missed (penalty) */}
        <div className={`border rounded-xl shadow-sm p-5 ${(data.classesMissed || 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-2 rounded-lg ${(data.classesMissed || 0) > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
              <AlertTriangle className={`w-4 h-4 ${(data.classesMissed || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Missed</span>
          </div>
          <p className={`text-3xl font-bold ${(data.classesMissed || 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {data.classesMissed || 0}
          </p>
          <p className={`text-xs mt-1 ${(data.classesMissed || 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            {missedPenalty > 0 ? `-${missedPenalty} pts (x5)` : 'No penalty'}
          </p>
        </div>
      </div>

      {/* Score Formula Breakdown (Collapsible) */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setFormulaOpen(prev => !prev)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-gray-800">Score Breakdown</span>
          </div>
          {formulaOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {formulaOpen && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm font-mono text-indigo-800 leading-relaxed">
              ({data.totalClassesTaught} x 2) + ({data.attendanceScore} x 0.3) + ({data.homeworkCompletionRate} x 0.2)
              {missedPenalty > 0 ? ` - (${data.classesMissed} x 5)` : ''}
              {' '}= <span className="font-bold text-lg">{data.overallScore}</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Classes Taught ({data.totalClassesTaught} x 2 pts)</span>
                <span className="font-semibold text-blue-700">+{classPts}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Attendance Rate ({data.attendanceScore}% x 0.3)</span>
                <span className="font-semibold text-green-700">+{attendancePts}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Homework Grading ({data.homeworkCompletionRate}% x 0.2)</span>
                <span className="font-semibold text-purple-700">+{homeworkPts}</span>
              </div>
              {missedPenalty > 0 && (
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Missed Classes Penalty ({data.classesMissed} x 5 pts)</span>
                  <span className="font-semibold text-red-600">-{missedPenalty}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 font-bold">
                <span className="text-gray-800">Total Score</span>
                <span className="text-indigo-700 text-base">{data.overallScore} pts</span>
              </div>
            </div>

            <div className="mt-2 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Level Thresholds</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(THRESHOLDS).map(([key, t]) => {
                  const m = LEVEL_META[key];
                  const isActive = key === levelKey;
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                        isActive ? `${m.bg} ${m.color} border-current ring-2 ${m.ring}` : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      {m.icon} {m.label}
                      <span className="opacity-70">
                        {t.nextAt ? ` (${t.min}-${t.nextAt - 1})` : ` (${t.min}+)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Level History */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-amber-500" />
          Level History
        </h2>

        {data.levelHistory.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">No history available yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Level</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.levelHistory.slice().reverse().map((h, i) => {
                  const hMeta = LEVEL_META[h.level?.toLowerCase()] || LEVEL_META.beginner;
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-600">
                        {MONTH_NAMES[(h.month - 1) % 12]} {h.year}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${hMeta.bg} ${hMeta.color}`}>
                          {hMeta.icon} {hMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{h.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
