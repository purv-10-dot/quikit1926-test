"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useRouter } from "next/navigation";
import { Briefcase } from "lucide-react";
import { RequisitionWizard, toReqPayload, emptyReqForm } from "../_components/requisition-wizard";
import type { ReqFormShape, DeptOption, PipelineOption, EmpOption } from "../_components/requisition-wizard";

// People → "Raise Requisition" now uses the SAME 5-step wizard as
// Recruit → New Requisition (shared component). On submit it posts the full
// requisition payload to /raise, which creates a PendingApproval requisition
// and routes it through Department Head → HR approvals.
export default function RaiseRequisitionPage() {
  const api = useApiClient();
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<ReqFormShape>(emptyReqForm);

  const { data: deptsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
  });
  const { data: pipelinesData } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<PipelineOption[]>("/api/v1/hrms/recruit/pipelines"),
  });
  const { data: empData } = useQuery({
    queryKey: ["employees-picker"],
    queryFn: () => api.get<EmpOption[]>("/api/v1/hrms/employees?limit=500&status=Active"),
  });

  const raiseMut = useMutation({
    mutationFn: (body: ReqFormShape) =>
      api.post<{ requisition: { id: string; requisitionNumber: string }; approvers: { deptHead: { name: string }; hr: { name: string } } }>(
        "/api/v1/hrms/recruit/requisitions/raise",
        toReqPayload(body),
      ),
    onSuccess: (res) => {
      const d = res.data;
      toast.success("Requisition raised", d ? `Sent to ${d.approvers.deptHead.name} for first approval` : undefined);
      setTimeout(() => router.push("/recruit/requisitions"), 800);
    },
  });

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-start gap-3 mb-5">
        <Briefcase size={24} className="text-green-600 mt-1" />
        <div>
          <h1 className="text-page-title text-gray-900 leading-tight">Raise a requisition</h1>
          <p className="text-xs text-gray-500 mt-1">Submit a hiring request. Flow: Department Head &rarr; HR &rarr; Open.</p>
        </div>
      </div>

      <div className="surface-card p-4 w-full">
        <RequisitionWizard
          form={form}
          setForm={setForm}
          isEdit={false}
          departments={deptsData?.data ?? []}
          pipelines={pipelinesData?.data ?? []}
          employees={empData?.data ?? []}
          submitting={raiseMut.isPending}
          showJustification
          submitLabel="Submit for Approval"
          onCancel={() => router.back()}
          onSubmit={() => raiseMut.mutate(form)}
        />
      </div>
    </div>
  );
}
