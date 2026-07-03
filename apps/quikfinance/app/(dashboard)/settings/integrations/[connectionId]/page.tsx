import { ConnectionWorkspace } from "@/components/integrations/ConnectionWorkspace";

export default function ConnectionPage({ params }: { params: { connectionId: string } }) {
  return <ConnectionWorkspace connectionId={params.connectionId} />;
}
