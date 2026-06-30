import { createCrudItemHandlers } from "@/lib/api/crud";
import { timeEntryRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudItemHandlers(timeEntryRouteConfig);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
