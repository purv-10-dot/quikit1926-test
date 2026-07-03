import { createCrudHandlers } from "@/lib/api/crud";
import { fixedAssetRouteConfig } from "@/lib/api/module-routes";

export const dynamic = "force-dynamic";
const handlers = createCrudHandlers(fixedAssetRouteConfig);
export const GET = handlers.GET;
export const POST = handlers.POST;
