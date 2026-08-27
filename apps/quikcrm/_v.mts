import { getRepBreakdown } from "./lib/services/sales-cost/sales-cost-service";
import { parsePeriod } from "./lib/services/sales-cost/period";
const ORG="cmpgz253x00019660d7d4qkzq", USER="cmsok98c5001nw61cn6hzg9en";
for (const key of ["2026-08","2026-09"]) {
  const b = await getRepBreakdown(ORG, USER, parsePeriod(key)!);
  console.log(`\n=== ${key} ===`);
  console.log("salary:", b.salary, "| toolsCost:", b.toolsCost, "| otherCost:", b.otherCost);
  console.log("TOTAL MONTHLY COST:", b.totalMonthlyCost);
  console.log("tools:", b.tools.map(t=>`${t.toolName}[${t.billingFrequency}] cost=${t.toolCost} monthly=${t.toolMonthlyCost} share=${t.percentage}% alloc=${t.allocatedMonthlyCost}`));
  console.log("counts:", b.counts);
  console.log("efficiency:", b.efficiency);
}
