'use client';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const CoursePlayer = dynamic(() => import('@/components/players/CoursePlayer'), { ssr: false });

export default function CourseLegacyPage() {
  const { courseId } = useParams<{ courseId: string }>();
  return <CoursePlayer courseId={courseId} mode="legacy" />;
}
