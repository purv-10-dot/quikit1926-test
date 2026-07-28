'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Plus, Layers, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { Card, CardContent } from '@/components/ui';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';
import MasterCourseStudio from '@/components/MasterCourseStudio';
import CourseCreator from '@/components/CourseCreator';

const MasterLibraryBuilderPageInner = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const mode = searchParams.get('mode'); // 'studio' for new 3-tier, 'legacy' for old
  const [showStudio, setShowStudio] = useState(true);
  const [showLegacyCreator, setShowLegacyCreator] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Push an existing master course to every active tenant (shared-content).
  async function handlePushToAll() {
    if (!courseId) return;
    if (!window.confirm('This will share this course with all active tenants. Continue?')) return;
    setPushing(true);
    try {
      const res = await api.post<{ data?: { sharedCount?: number }; message?: string }>(
        `/shared-content/push-to-all/${courseId}`,
      );
      toast.success(res?.message || `Course shared with ${res?.data?.sharedCount ?? 0} tenants!`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to push course to tenants');
    } finally {
      setPushing(false);
    }
  }

  // Determine which creator to show based on mode
  useEffect(() => {
    if (mode === 'legacy') {
      setShowLegacyCreator(true);
      setShowStudio(false);
    } else {
      setShowStudio(true);
      setShowLegacyCreator(false);
    }
  }, [mode]);

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" />

      {/* Push-to-all-tenants toolbar (only meaningful when editing an existing course) */}
      {courseId && (showStudio || showLegacyCreator) && (
        <div className="flex justify-end px-4 pt-4 sm:px-6 lg:px-8">
          <Button
            variant="primary"
            onClick={handlePushToAll}
            disabled={pushing}
            className="inline-flex items-center gap-2"
          >
            {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            {pushing ? 'Pushing to All Tenants…' : 'Push to All Tenants'}
          </Button>
        </div>
      )}

      {/* Master Course Studio (New 3-Tier Hierarchy) */}
      {showStudio && (
        <MasterCourseStudio
          courseId={courseId || undefined}
          onClose={() => {
            setShowStudio(false);
            router.push('/master-courses');
          }}
          onSuccess={() => {
            setShowStudio(false);
            router.push('/master-courses');
          }}
        />
      )}

      {/* Legacy Course Creator (Fallback) */}
      {showLegacyCreator && (
        <CourseCreator
          courseId={courseId || undefined}
          onClose={() => {
            setShowLegacyCreator(false);
            router.push('/master-courses');
          }}
          onSuccess={() => {
            setShowLegacyCreator(false);
            router.push('/master-courses');
          }}
        />
      )}

      {/* Empty state when no creator is open */}
      {!showStudio && !showLegacyCreator && (
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-fg">
                Master Course Studio
              </h1>
              <p className="text-fg-muted mt-1">
                Build comprehensive courses with 3-tier hierarchy
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={() => setShowStudio(true)}
                className="inline-flex items-center gap-2"
              >
                <Layers className="w-5 h-5" />
                Open Studio
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowLegacyCreator(true)}
                className="inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Legacy Creator
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-12">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold text-fg mb-2">
                  Master Course Studio
                </h3>
                <p className="text-fg-muted max-w-md mx-auto mb-6">
                  Create courses with a 3-tier hierarchy: Course &rarr; Module &rarr; Sub-Module.
                  Add multiple resources, quizzes with question banking, and assignments.
                </p>
                <div className="flex flex-wrap justify-center gap-3 text-sm">
                  <Badge tone="info">Drag &amp; Drop Reordering</Badge>
                  <Badge tone="success">Multi-Resource Engine</Badge>
                  <Badge tone="brand">Advanced Quiz Builder</Badge>
                  <Badge tone="warning">Auto-Save Draft</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default function MasterLibraryBuilderPage() {
  return <Suspense><MasterLibraryBuilderPageInner /></Suspense>;
}
