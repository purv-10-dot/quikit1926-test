import { createCrudHandlers } from "@/lib/api/crud";
import { accountRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(accountRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
