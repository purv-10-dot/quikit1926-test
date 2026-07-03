import { createCrudHandlers } from "@/lib/api/crud";
import { paymentRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(paymentRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
