"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ScorecardEditor, type ScorecardDraft } from "../_editor";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

interface ScorecardDetail {
  id: string;
  name: string;
  description: string | null;
  designationId: string | null;
  departmentId: string | null;
  tags: string[] | null;
  effectiveFrom: string;
  isActive: boolean;
  kras: {
    id: string;
    title: string;
    description: string | null;
    weight: string | number;
    kpis: {
      id: string;
      title: string;
      description: string | null;
      measurementMethod: string | null;
      target: string | null;
      unit: string | null;
      weight: string | number;
    }[];
  }[];
}

export default function EditKraTemplatePage() {
  const params = useParams();
  const id = params.id as string;
  const api = useApiClient();

  const { data, isLoading } = useQuery({
    queryKey: ["performance", "kra-templates", id],
    queryFn: () => api.get<ScorecardDetail>(`/api/v1/hrms/performance/kra-templates/${id}`),
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-5xl mx-auto space-y-3">
        <SkeletonLine w="30%" h={20} />
        <SkeletonLine w="60%" h={14} />
        <SkeletonLine w="90%" h={140} />
      </div>
    );
  }

  const sc = data.data;
  const initialDraft: ScorecardDraft = {
    name: sc.name,
    description: sc.description ?? "",
    designationId: sc.designationId ?? "",
    departmentId: sc.departmentId ?? "",
    tags: sc.tags ?? [],
    effectiveFrom: sc.effectiveFrom.slice(0, 10),
    isActive: sc.isActive,
    kras: sc.kras.map((k) => ({
      id: k.id,
      title: k.title,
      description: k.description ?? "",
      weight: Number(k.weight),
      kpis: k.kpis.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? "",
        measurementMethod: p.measurementMethod ?? "",
        target: p.target ?? "",
        unit: p.unit ?? "",
        weight: Number(p.weight),
      })),
    })),
  };

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <ScorecardEditor scorecardId={id} initialDraft={initialDraft} />
    </>
  );
}
