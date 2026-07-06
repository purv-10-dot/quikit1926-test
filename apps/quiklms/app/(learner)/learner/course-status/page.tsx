'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBranding } from '@/app/providers';
import {
  BookOpen,
  Search,
  Play,
  ChevronRight,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';

interface CourseAssignment {
  _id: string;
  courseId: {
    _id: string;
    title: string;
    description?: string;
  };
  dueDate?: string;
  isMandatory: boolean;
  assignedAt: string;
}

interface Progress {
  courseId: string;
  completionPercentage: number;
  status: string;
  isPassed: boolean;
}

const normalizeStatus = (raw: string | undefined): string => {
  const s = (raw || '').toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'completed') return 'Completed';
  if (s === 'in progress') return 'In Progress';
  if (s === 'overdue') return 'Overdue';
  return 'Not Started';
};

type TrackFilter = 'missed' | 'running' | 'not-started';

function classifyAssignment(
  a: CourseAssignment,
  progressMap: Record<string, Progress>,
  now: Date
): TrackFilter | 'completed' {
  const p = progressMap[a.courseId._id];
  const pct = p?.completionPercentage ?? 0;
  const status = p?.status || 'Not Started';
  const completed = pct >= 100 || status === 'Completed';
  if (completed) return 'completed';

  const missed = !!(a.dueDate && new Date(a.dueDate) < now && !completed);
  if (missed) return 'missed';
  if (pct > 0 || status === 'In Progress' || status === 'Overdue') return 'running';
  return 'not-started';
}

const CourseStatusTrackingPage = () => {
  const router = useRouter();
  const { branding } = useBranding();
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrackFilter>('missed');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<any>('/course-assignments/my-assignments');
        let data = res.data?.data || res.data || [];
        if (!Array.isArray(data)) data = [];
        const valid = data.filter((x: CourseAssignment) => x.courseId && x.courseId._id);
        if (!mounted) return;
        setAssignments(valid);

        const progressResults = await Promise.all(
          valid.map(async (assignment: CourseAssignment) => {
            try {
              const pr = await api.get<any>(`/progress/${assignment.courseId._id}`);
              return { courseId: assignment.courseId._id, progress: pr.data };
            } catch {
              return { courseId: assignment.courseId._id, progress: null };
            }
          })
        );

        const map: Record<string, Progress> = {};
        progressResults.forEach(({ courseId, progress }) => {
          if (progress) {
            map[courseId] = {
              courseId: progress.courseId,
              completionPercentage: progress.completionPercentage || 0,
              status: normalizeStatus(progress.status),
              isPassed: progress.isPassed || false,
            };
          } else {
            map[courseId] = {
              courseId,
              completionPercentage: 0,
              status: 'Not Started',
              isPassed: false,
            };
          }
        });
        if (!mounted) return;
        setProgressMap(map);
      } catch (err: any) {
        if (!mounted) return;
        if (err?.statusCode === 401) {
          setError('Your session has expired. Please login again.');
        } else {
          setError('Error');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const now = new Date();

  const rows = assignments
    .filter((a) => a?.courseId?._id)
    .map((a) => ({
      assignment: a,
      bucket: classifyAssignment(a, progressMap, now),
      progress: progressMap[a.courseId._id] || {
        courseId: a.courseId._id,
        completionPercentage: 0,
        status: 'Not Started',
        isPassed: false,
      },
    }))
    .filter(({ bucket }) => bucket !== 'completed')
    .filter(({ bucket }) => bucket === filter)
    .filter(({ assignment }) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        assignment.courseId?.title?.toLowerCase().includes(q) ||
        (assignment.courseId?.description || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const da = a.assignment.dueDate ? new Date(a.assignment.dueDate).getTime() : Infinity;
      const db = b.assignment.dueDate ? new Date(b.assignment.dueDate).getTime() : Infinity;
      return da - db;
    });

  const isMissedRow = (a: CourseAssignment, progress: Progress) => {
    const completed = progress.completionPercentage >= 100 || progress.status === 'Completed';
    return !!(a.dueDate && new Date(a.dueDate) < now && !completed);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: branding.primaryColor }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-12 p-6 bg-white border border-red-200 rounded-xl text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <p className="text-gray-800 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => router.push('/role-select')}
          className="text-indigo-600 font-medium hover:underline"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 sm:space-y-10 lg:space-y-12 pb-20">
      {/* Premium Branded Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500"
        style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Course status
            </h1>
            <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light max-w-2xl">
              Assigned courses by status. Overdue incomplete courses are highlighted in red.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-6 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-4 focus:ring-opacity-20 transition-all bg-gray-50/50 dark:bg-gray-700/50"
            style={{ '--tw-ring-color': branding.primaryColor } as any}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['missed', 'Missed', 'bg-red-600 border-red-600 text-white'],
              ['running', 'Running', 'text-white'],
              [
                'not-started',
                'Not Started',
                'bg-gray-700 border-gray-700 text-white',
              ],
            ] as const
          ).map(([key, label, activeClasses]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${filter === key
                  ? `${activeClasses} shadow-lg`
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              style={filter === key && key === 'running' ? { backgroundColor: branding.primaryColor, borderColor: branding.primaryColor } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">

        {rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <BookOpen className="w-14 h-14 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              {searchQuery
                ? 'No courses found'
                : 'No courses in this category.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_120px_100px_140px_140px] gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Course</span>
              <span>Due date</span>
              <span>Progress</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {rows.map(({ assignment: a, progress: p }) => {
                const missed = isMissedRow(a, p);
                const rowClass = missed
                  ? 'bg-red-100 border-2 border-red-500 shadow-[inset_4px_0_0_0_#dc2626] hover:bg-red-100/95'
                  : 'bg-white hover:bg-gray-50/80 border border-transparent';

                return (
                  <li key={a._id}>
                    <div
                      className={`md:grid md:grid-cols-[minmax(0,1fr)_120px_100px_140px_140px] md:gap-3 md:items-center px-4 py-4 transition-colors rounded-none ${rowClass}`}
                    >
                      <div className="mb-3 md:mb-0">
                        <p
                          className={`font-semibold text-base ${missed ? 'text-red-900' : 'text-gray-900'}`}
                        >
                          {a.courseId?.title || 'Course'}
                        </p>
                        {a.isMandatory && (
                          <span className="inline-block mt-1 text-xs font-medium text-red-800 bg-red-200/80 px-2 py-0.5 rounded">
                            Mandatory
                          </span>
                        )}
                      </div>
                      <div className="flex md:block items-center gap-2 mb-2 md:mb-0">
                        <span className="md:hidden text-xs text-gray-500 w-24 shrink-0">
                          Due date
                        </span>
                        {a.dueDate ? (
                          <span
                            className={`text-sm font-medium ${missed ? 'text-red-800' : 'text-gray-700'}`}
                          >
                            {new Date(a.dueDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>
                      <div className="flex md:block items-center gap-2 mb-2 md:mb-0">
                        <span className="md:hidden text-xs text-gray-500 w-24 shrink-0">
                          Progress
                        </span>
                        <div className="flex-1 md:flex-none">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-[64px]">
                              <div
                                className={`h-full rounded-full ${missed ? 'bg-red-500' : ''}`}
                                style={{
                                  width: `${Math.min(100, p.completionPercentage)}%`,
                                  backgroundColor: missed ? undefined : branding.primaryColor
                                }}
                              />
                            </div>
                            <span className={`text-sm tabular-nums ${missed ? 'text-red-900 font-semibold' : 'text-gray-700'}`}>
                              {p.completionPercentage.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex md:block items-center gap-2 mb-3 md:mb-0">
                        <span className="md:hidden text-xs text-gray-500 w-24 shrink-0">
                          Status
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${missed
                              ? 'bg-red-200 text-red-900 border-red-400'
                              : filter === 'running'
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}
                        >
                          {missed ? (
                            <>
                              <AlertCircle className="w-3.5 h-3.5" />
                              Missed / overdue
                            </>
                          ) : filter === 'running' ? (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              In Progress
                            </>
                          ) : (
                            'Not Started'
                          )}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => router.push(`/course-player/${a.courseId._id}`)}
                          className={`w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${missed
                              ? 'bg-red-700 hover:bg-red-800 text-white shadow-sm'
                              : 'text-white'
                            }`}
                          style={!missed ? { backgroundColor: branding.primaryColor } : {}}
                        >
                          <Play className="w-4 h-4" />
                          Continue
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseStatusTrackingPage;
