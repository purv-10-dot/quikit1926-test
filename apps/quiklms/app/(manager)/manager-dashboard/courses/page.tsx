'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Clock, CheckCircle, AlertCircle, Play, RefreshCw, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import ReadMoreText from '@/components/ReadMoreText';

interface ManagerCourse {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  completionPercentage: number;
  status: string;
  startedAt?: string;
  dueDate?: string;
  isMandatory: boolean;
}

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    Completed:     { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Completed' },
    'In Progress': { bg: 'bg-blue-50 border-blue-200',   text: 'text-blue-700',  label: 'In Progress' },
    'Not Started': { bg: 'bg-gray-50 border-gray-200',   text: 'text-gray-600',  label: 'Not Started' },
  };
  const c = config[status] || config['Not Started'];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
};

const MyCoursesPage = () => {
  const router = useRouter();
  const [courses, setCourses] = useState<ManagerCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    setError(null);
    try {
      const [assignmentsRes, progressRes] = await Promise.allSettled([
        api.get<any>('/course-assignments/my-assignments'),
        api.get<any>('/progress/my'),
      ]);

      const assignments =
        assignmentsRes.status === 'fulfilled'
          ? ((assignmentsRes.value as any).data?.data || (assignmentsRes.value as any).data || [])
          : [];
      const progressRecords =
        progressRes.status === 'fulfilled'
          ? ((progressRes.value as any).data?.data || (progressRes.value as any).data || [])
          : [];

      const progressMap = new Map<string, any>();
      progressRecords.forEach((p: any) => {
        const courseKey = p.courseId?._id?.toString() || p.courseId?.toString() || '';
        if (courseKey) progressMap.set(courseKey, p);
      });

      const merged: ManagerCourse[] = assignments.map((assignment: any) => {
        const course = assignment.courseId || {};
        const courseId = course._id?.toString() || assignment.courseId?.toString() || '';
        const progress = progressMap.get(courseId);

        const completionPercentage = progress?.completionPercentage ?? 0;
        let status = 'Not Started';
        if (completionPercentage >= 100) status = 'Completed';
        else if (completionPercentage > 0 || progress?.status === 'IN_PROGRESS') status = 'In Progress';

        return {
          courseId,
          courseTitle: course.title || 'Untitled Course',
          courseDescription: course.description || '',
          completionPercentage,
          status,
          startedAt: progress?.startedAt,
          dueDate: assignment.dueDate,
          isMandatory: assignment.isMandatory || false,
        };
      });

      setCourses(merged);
    } catch (err: any) {
      console.error('Failed to load courses:', err);
      setError(err?.message || 'Failed to load courses. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-4 bg-gray-100 rounded w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
          <p className="text-gray-500 mt-1">Your assigned learning courses</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Something went wrong</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => { setLoading(true); loadCourses(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Courses</h1>
          <p className="text-gray-500 mt-1">Your assigned learning courses</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadCourses(); }}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Courses Assigned</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            You don't have any courses assigned yet. Your Tenant Admin can assign courses to you.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {courses.map((course) => (
            <div
              key={course.courseId}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900 truncate" title={course.courseTitle}>
                      {course.courseTitle}
                    </h3>
                    {course.isMandatory && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <ReadMoreText text={course.courseDescription} maxLines={2} className="text-sm text-gray-600 mb-3" />
                </div>
                {course.status === 'Completed' ? (
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 ml-2" />
                ) : course.status === 'In Progress' ? (
                  <Clock className="w-6 h-6 text-blue-600 flex-shrink-0 ml-2" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-gray-400 flex-shrink-0 ml-2" />
                )}
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Progress</span>
                  <span className="text-sm font-semibold text-gray-900">{course.completionPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      course.completionPercentage >= 100
                        ? 'bg-green-500'
                        : course.completionPercentage >= 50
                        ? 'bg-blue-500'
                        : course.completionPercentage > 0
                        ? 'bg-yellow-500'
                        : 'bg-gray-300'
                    }`}
                    style={{ width: `${Math.min(course.completionPercentage, 100)}%` }}
                  />
                </div>
              </div>

              {/* Status and due date */}
              <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                <StatusBadge status={course.status} />
                {course.dueDate && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Due Date</p>
                    <p
                      className={`font-medium ${
                        new Date(course.dueDate) < new Date() && course.completionPercentage < 100
                          ? 'text-red-600'
                          : 'text-gray-700'
                      }`}
                    >
                      {new Date(course.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Action button */}
              <button
                onClick={() => router.push(`/learner/course/${course.courseId}`)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                <Play className="w-4 h-4" />
                {course.status === 'Not Started'
                  ? 'Start Course'
                  : course.status === 'Completed'
                  ? 'Review Course'
                  : 'Continue Learning'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyCoursesPage;
