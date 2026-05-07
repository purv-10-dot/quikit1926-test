"use client";

/**
 * Edit DPR — loads the record by id and feeds it to the shared
 * DPRForm component. All pre-fill logic lives inside DPRForm's
 * `editData` prop initializers.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/PageShell";
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
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading DPR…
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
