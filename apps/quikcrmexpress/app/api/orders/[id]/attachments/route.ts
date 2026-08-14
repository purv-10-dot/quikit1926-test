import { createAttachmentRouteHandlers } from "@/lib/api/entity-attachments";

const { GET, POST } = createAttachmentRouteHandlers("order");

export { GET, POST };
