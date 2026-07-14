import { withOrgAuth } from "@/lib/auth-shims";
import { selectIceMode } from "@/lib/server/calling/ice-provider";
import { StubIceConfigProvider } from "@/lib/server/calling/ice-provider.stub";
import { RealIceConfigProvider } from "@/lib/server/calling/ice-provider.real";

export const GET = withOrgAuth(async () => {
  const { mode } = selectIceMode();
  const provider = mode === "real" ? new RealIceConfigProvider() : new StubIceConfigProvider();
  const config = await provider.getIceConfig();
  return Response.json(config);
});
