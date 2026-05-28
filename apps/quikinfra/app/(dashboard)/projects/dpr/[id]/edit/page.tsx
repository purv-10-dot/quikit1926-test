"use client";

/**
 * Edit DPR — loads the record by id and feeds it to the shared
 * DPRForm component. All pre-fill logic lives inside DPRForm's
 * `editData` prop initializers.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/PageShell";
import { ShimmerBlock } from "@/components/Shimmer";
import { DPRForm } from "../../new/DPRForm";

async function fetchDPR(id: string) {
  const res = await fetch(`/api/projects/dpr/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function EditDPRPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dpr", id],
    queryFn: () => fetchDPR(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="space-y-2">
            <ShimmerBlock className="h-3 w-48" />
            <ShimmerBlock className="h-7 w-72" />
            <ShimmerBlock className="h-4 w-56" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <ShimmerBlock className="h-3 w-24" />
                  <ShimmerBlock className="h-9 w-full" />
                </div>
              ))}
            </div>
            <ShimmerBlock className="h-px w-full" />
            <ShimmerBlock className="h-5 w-40" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map((r) => (
                <ShimmerBlock key={r} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">Failed to load DPR</div>
            <div className="text-xs mt-1 opacity-80">
              {(error as Error)?.message ?? "The DPR may have been deleted."}
            </div>
            <Link
              href="/projects/dpr"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <ArrowLeft className="w-3 h-3" /> Back to DPRs
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  return <DPRForm editData={data} />;
}
