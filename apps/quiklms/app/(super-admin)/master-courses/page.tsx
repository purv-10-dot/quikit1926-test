'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Plus, Trash2, Calendar, X, AlertCircle, CheckCircle,
  Layers, Copy, Search, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import CoursePreviewModal from '@/components/CoursePreviewModal';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import toast, { Toaster } from 'react-hot-toast';

interface MasterCourse {
  _id: string;
  title: string;
  category: string;
  level?: string;
  thumbnailUrl?: string;
  thumbnailUrlPresigned?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  selectedTenants?: string[];
  modules?: any[];
  estimatedDuration?: number;
}

export default function MasterLibraryPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<MasterCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewCourse, setPreviewCourse] = useState<MasterCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<MasterCourse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Client-side filtering: matches title, category, or level
  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courses;
    const words = q.split(/\s+/).filter(Boolean);
    return courses.filter((course) => {
      const haystack = [
        course.title,
        course.category,
        course.level,
        course.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [courses, searchQuery]);

  useEffect(() => {
    loadMasterCourses();
  }, []);

  const loadMasterCourses = async () => {
    try {
      setLoading(true);
      try {
        const response = await api.get<{ data: MasterCourse[] }>('/master-courses');
        setCourses(response.data || []);
      } catch {
        const response = await api.get<{ data: MasterCourse[] }>('/courses/master/all');
        setCourses(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load master courses:', error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMasterCourse = () => {
    router.push('/master-courses/builder');
  };

  const handleViewCourse = async (courseId: string) => {
    try {
      setError(null);
      try {
        const response = await api.get<{ data: MasterCourse }>(`/master-courses/${courseId}`);
        setPreviewCourse(response.data);
      } catch {
        const response = await api.get<{ data: MasterCourse }>(`/courses/master/${courseId}`);
        setPreviewCourse(response.data);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to load course details';
      setError(msg);
      toast.error(msg);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleEditCourse = (courseId: string) => {
    router.push(`/master-courses/builder?courseId=${courseId}`);
  };

  const handleDuplicateCourse = async (courseId: string) => {
    try {
      setDuplicating(courseId);
      setError(null);
      const response = await api.post<{ success: boolean }>(`/master-courses/${courseId}/duplicate`);
      if (response.success) {
        setSuccess('Course duplicated successfully');
        toast.success('Course duplicated successfully');
        loadMasterCourses();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to duplicate course';
      setError(msg);
      toast.error(msg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setDuplicating(null);
    }
  };

  const handleDeleteClick = (course: MasterCourse) => {
    setCourseToDelete(course);
  };

  const handleDeleteConfirm = async () => {
    if (!courseToDelete) return;

    try {
      setDeleting(courseToDelete._id);
      setError(null);
      try {
        await api.delete(`/master-courses/${courseToDelete._id}`);
      } catch {
        await api.delete(`/courses/master/${courseToDelete._id}`);
      }
      setSuccess('Course deleted successfully');
      toast.success('Course deleted successfully');
      setCourseToDelete(null);
      loadMasterCourses();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to delete course. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteCancel = () => {
    setCourseToDelete(null);
  };

  return (
    <DashboardScaffold title="Master Library" subtitle="Architect complex learning journeys with 3-tier hierarchies and multi-tenant accessibility">
      <Toaster position="top-right" />

      <div className="space-y-6 sm:space-y-8 pb-12">
        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <p className="text-red-800 dark:text-red-300 text-sm font-bold">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 dark:text-red-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-emerald-800 dark:text-emerald-300 text-sm font-bold">{success}</p>
            </div>
            <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Premium Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-[2rem] shadow-2xl p-6 sm:p-10 lg:p-12 text-white">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='%23ffffff' fill-opacity='1'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 text-center lg:text-left">
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                Master <span className="text-indigo-200">Library</span>
              </h1>
              <p className="text-indigo-100/80 text-base sm:text-lg font-medium max-w-2xl">
                Architect complex learning journeys with 3-tier hierarchies and multi-tenant accessibility.
              </p>
            </div>
            <button
              onClick={handleCreateMasterCourse}
              className="group bg-white text-indigo-600 hover:bg-indigo-50 px-10 py-5 rounded-2xl font-black inline-flex items-center gap-3 transition-all duration-300 shadow-xl active:scale-95 whitespace-nowrap"
            >
              <Layers className="w-6 h-6 transition-transform group-hover:scale-110" />
              Launch Course Studio
            </button>
          </div>
        </div>

        {/* Search & Stats Bar */}
        {!loading && courses.length > 0 && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
            <div className="relative flex-1 max-w-xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Query library by title, category, or status..."
                className="w-full pl-12 pr-12 py-4 bg-white dark:bg-gray-800 border-2 border-[#f2f2f7] dark:border-gray-700 rounded-2xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="px-6 py-4 bg-white dark:bg-gray-800 rounded-2xl border border-[#f2f2f7] dark:border-gray-700 shadow-sm flex items-center gap-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Total Artifacts</span>
                <span className="text-xl font-black text-indigo-600">{courses.length}</span>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Synchronizing Library...</p>
            </div>
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border-2 border-dashed border-[#f2f2f7] dark:border-gray-700 p-20">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center mb-8 mx-auto">
                <Layers className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-4">
                Your Library is Empty
              </h3>
              <p className="text-gray-400 font-bold mb-10 leading-relaxed">
                Start by building comprehensive master courses. These serve as blueprints that can be deployed across multiple tenants and students.
              </p>
              <button
                onClick={handleCreateMasterCourse}
                className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black inline-flex items-center gap-3 transition-all transform hover:scale-105 shadow-xl shadow-indigo-100"
              >
                <Plus className="w-6 h-6" />
                Create First Course
              </button>
            </div>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
            <div className="text-center">
              <Search className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                No courses match &ldquo;{searchQuery}&rdquo;
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Try a different search term or clear the filter.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-semibold transition-all"
              >
                <X className="w-4 h-4" />
                Clear search
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCourses.map((course) => (
              <div
                key={course._id}
                className="group bg-white dark:bg-gray-800 rounded-[2rem] border border-[#f2f2f7] dark:border-gray-700 overflow-hidden hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
              >
                <div className="relative h-56 overflow-hidden">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrlPresigned || course.thumbnailUrl}
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center relative">
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                      <BookOpen className="w-16 h-16 text-white/40" />
                    </div>
                  )}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full backdrop-blur-md border ${
                      course.status === 'Published'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                    }`}>
                      {course.status}
                    </span>
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-gray-50 text-gray-400 rounded-lg border border-gray-100">
                      {course.category || 'Core'}
                    </span>
                    {course.level && (
                      <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-500 rounded-lg border border-indigo-100">
                        {course.level}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-4 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
                    {course.title}
                  </h3>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Modules</span>
                        <span className="text-sm font-bold text-gray-700">{course.modules?.length || 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Last Sync</span>
                        <span className="text-sm font-bold text-gray-700">
                          {new Date(course.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewCourse(course._id)}
                      className="flex-1 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleEditCourse(course._id)}
                      className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 active:scale-95"
                    >
                      Blueprint
                    </button>
                    <button
                      onClick={() => handleDuplicateCourse(course._id)}
                      disabled={duplicating === course._id}
                      className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-xl transition-all border border-gray-100"
                    >
                      {duplicating === course._id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteClick(course)}
                      disabled={deleting === course._id}
                      className="p-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-100"
                    >
                      {deleting === course._id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Course Preview Modal */}
        {previewCourse && (
          <CoursePreviewModal
            course={previewCourse}
            onClose={() => setPreviewCourse(null)}
          />
        )}

        {/* Delete Confirmation Modal */}
        {courseToDelete && (
          <DeleteConfirmationModal
            isOpen={!!courseToDelete}
            onClose={handleDeleteCancel}
            onConfirm={handleDeleteConfirm}
            title="Delete Master Course"
            message="Are you sure you want to delete this master course?"
            itemName={courseToDelete.title}
            isLoading={deleting === courseToDelete._id}
          />
        )}
      </div>
    </DashboardScaffold>
  );
}
