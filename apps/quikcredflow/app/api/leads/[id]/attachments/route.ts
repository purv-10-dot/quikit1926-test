import { createAttachmentRouteHandlers } from "@/lib/api/entity-attachments";

const { GET, POST } = createAttachmentRouteHandlers("lead");

export { GET, POST };
