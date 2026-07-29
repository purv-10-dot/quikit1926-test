'use client';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// Exam taking surface (timer via /exams socket, proctoring hooks) — browser-only.
const ExamRunner = dynamic(() => import('@/components/players/ExamRunner'), { ssr: false });

export default function ExamTakePage() {
  const { examId } = useParams<{ examId: string }>();
  return <ExamRunner examId={examId} />;
}
