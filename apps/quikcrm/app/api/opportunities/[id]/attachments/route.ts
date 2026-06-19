import { createAttachmentRouteHandlers } from "@/lib/api/entity-attachments";

const { GET, POST } = createAttachmentRouteHandlers("opportunity");

export { GET, POST };
