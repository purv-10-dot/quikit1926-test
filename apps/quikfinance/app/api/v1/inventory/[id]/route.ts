import { createCrudItemHandlers } from "@/lib/api/crud";
import { inventoryRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudItemHandlers(inventoryRouteConfig);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
