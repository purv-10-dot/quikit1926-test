import { createCrudHandlers } from "@/lib/api/crud";
import { currencyRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(currencyRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
