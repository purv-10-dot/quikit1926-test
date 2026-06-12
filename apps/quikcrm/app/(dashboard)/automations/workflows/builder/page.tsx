import { WorkflowBuilder } from "@/components/automations/workflow-builder";
import { PageHeader } from "@/components/shared/page-header";

export default function WorkflowBuilderPage() {
  return (
    <div>
      <PageHeader
        title="Workflow Builder"
        subtitle="Drag nodes onto the canvas and connect them. Save to persist."
      />
      <WorkflowBuilder />
      <p className="mt-3 text-xs text-crm-muted">
        {/* TODO(post-mvp): wire onSave to POST/PATCH /api/automations/workflows with the graph payload. */}
      </p>
    </div>
  );
}
