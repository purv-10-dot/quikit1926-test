'use client';
import { Card, CardContent } from '@/components/ui';
import { BookOpen } from 'lucide-react';

interface MasterCourseStudioProps {
  courseId?: string;
  onSave?: (data: unknown) => void;
  onClose?: () => void;
  onSuccess?: () => void;
  mode?: 'create' | 'edit';
  isTenantAdmin?: boolean;
  approvalEnabled?: boolean;
  [key: string]: unknown;
}

export function MasterCourseStudio(props: MasterCourseStudioProps) {
  void props;
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <BookOpen className="size-12 text-fg-muted mb-4" />
        <h3 className="font-display text-lg font-semibold text-fg mb-2">Course Studio</h3>
        <p className="text-sm text-fg-muted">Full course builder coming soon.</p>
      </CardContent>
    </Card>
  );
}

export default MasterCourseStudio;
