import { createAttachmentRouteHandlers } from "@/lib/api/entity-attachments";

const { GET, POST } = createAttachmentRouteHandlers("account");

export { GET, POST };
