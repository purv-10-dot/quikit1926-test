import { createCrudHandlers } from "@/lib/api/crud";
import { timeEntryRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(timeEntryRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
