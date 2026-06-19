export type NodeKind =
  | "trigger_lead_created"
  | "trigger_lead_updated"
  | "create_task"
  | "wait"
  | "if_else"
  | "distribute_lead"
  | "notify_user"
  | "send_email";

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** For if_else nodes: "true" or "false" */
  branch?: "true" | "false";
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
