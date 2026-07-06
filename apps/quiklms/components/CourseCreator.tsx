'use client';
import { Card, CardContent } from '@/components/ui';
import { BookOpen } from 'lucide-react';

interface Props {
  [key: string]: unknown;
}

export function CourseCreator(props: Props) {
  void props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="size-12 text-fg-muted mb-4" />
          <h3 className="font-display text-lg font-semibold text-fg mb-2">Course Creator</h3>
          <p className="text-sm text-fg-muted">Course Creator coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
export default CourseCreator;
