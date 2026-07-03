import { createCrudItemHandlers } from "@/lib/api/crud";
import { bankAccountRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudItemHandlers(bankAccountRouteConfig);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
