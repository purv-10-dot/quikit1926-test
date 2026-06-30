import { createCrudHandlers } from "@/lib/api/crud";
import { projectRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(projectRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
