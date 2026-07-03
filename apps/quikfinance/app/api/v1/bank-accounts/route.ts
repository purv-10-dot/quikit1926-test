import { createCrudHandlers } from "@/lib/api/crud";
import { bankAccountRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(bankAccountRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
