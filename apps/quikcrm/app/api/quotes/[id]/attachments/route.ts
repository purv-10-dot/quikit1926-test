import { createAttachmentRouteHandlers } from "@/lib/api/entity-attachments";

const { GET, POST } = createAttachmentRouteHandlers("quote");

export { GET, POST };
