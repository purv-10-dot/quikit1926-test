import { createCrudHandlers } from "@/lib/api/crud";
import { taxRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(taxRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
