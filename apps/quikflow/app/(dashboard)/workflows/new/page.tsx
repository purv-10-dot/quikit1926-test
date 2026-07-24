"use client";

import { WorkflowBuilder } from "@/components/builder/workflow-builder";

/** Create a new workflow. All builder logic lives in the shared component. */
export default function NewWorkflowPage() {
  return <WorkflowBuilder mode="create" />;
}
