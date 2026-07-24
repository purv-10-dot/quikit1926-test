'use client';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// Browser-only player — never SSR'd.
const CoursePlayer = dynamic(() => import('@/components/players/CoursePlayer'), { ssr: false });

export default function CoursePlayerPage() {
  const { courseId } = useParams<{ courseId: string }>();
  return <CoursePlayer courseId={courseId} mode="standard" />;
}
