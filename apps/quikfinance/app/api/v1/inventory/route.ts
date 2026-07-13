import { createCrudHandlers } from "@/lib/api/crud";
import { inventoryRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(inventoryRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
