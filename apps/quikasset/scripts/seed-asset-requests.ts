/**
 * Seed sample Asset Requests (+ the categories and in-stock assets needed to
 * exercise fulfilment) so we can verify the Pending Approvals queue and the
 * Approve / Reject / fulfil flow before the employee-facing New Request form exists.
 *
 * The `AstAssetRequest` model is applied and the Prisma client generated, so this
 * runs. Idempotent: categories/assets are upserted, and the seeded requests are
 * replaced on each run. Temporary — delete once the employee New Request form can
 * create real requests through the API.
 *
 * Run, from apps/quikasset:
 *   npx tsx scripts/seed-asset-requests.ts --org=<orgId> [--requester=<userId>]
 *   npx tsx scripts/seed-asset-requests.ts --org=<orgId> --reset
 */
import { PrismaClient } from "@prisma/client";
import type {
  AstAssetRequestKind,
  AstAssetRequestType,
  AstAssetRequestPriority,
  AstAssetRequestStatus,
} from "@prisma/client";

const db = new PrismaClient();

/** Marker embedded in justification so --reset only removes rows we created. */
const SEED_TAG = "[seed:asset-request]";
/** itemCode prefix for the demo in-stock assets this script creates. */
const SEED_ASSET_PREFIX = "SEED-AR-";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

/** Target org — REQUIRED. The script never guesses; pass --org=<orgId> explicitly. */
function requireOrgId(): string {
  const fromArg = arg("org");
  if (!fromArg) {
    throw new Error(
      "--org=<orgId> is required — this script does not guess an org.\n" +
        "  e.g. npx tsx scripts/seed-asset-requests.ts --org=cmpgz253x00019660d7d4qkzq",
    );
  }
  return fromArg;
}

/**
 * Requester: explicit --requester, else an active member who is bridge-linked to
 * an AstEmployee (so the queue resolves a real name), else any active member.
 */
async function resolveRequesterUserId(orgId: string): Promise<string> {
  const fromArg = arg("requester");
  if (fromArg) return fromArg;

  const activeMembers = await db.orgMember.findMany({
    where: { orgId, status: "active" },
    select: { userId: true },
  });
  if (activeMembers.length === 0) {
    throw new Error(`No active member in org ${orgId} — pass --requester=<userId>.`);
  }
  // Prefer a member linked to an employee record (identity bridge) so the queue
  // shows a real name rather than a bare user id.
  const linked = await db.astEmployee.findFirst({
    where: { orgId, userId: { in: activeMembers.map((m) => m.userId) } },
    select: { userId: true },
  });
  return linked?.userId ?? activeMembers[0].userId;
}

/** Create the base category (+ one sub-category) if missing; return both ids. */
async function ensureCategory(orgId: string, name: string, subName: string) {
  const base = await db.astBaseCategory.upsert({
    where: { orgId_name: { orgId, name } },
    update: {},
    create: { orgId, name },
    select: { id: true },
  });
  const category = await db.astCategory.upsert({
    where: { orgId_name_baseCategoryId: { orgId, name: subName, baseCategoryId: base.id } },
    update: {},
    create: { orgId, name: subName, baseCategoryId: base.id },
    select: { id: true },
  });
  return { baseId: base.id, categoryId: category.id };
}

/** Create an Available demo asset if missing (keyed on itemCode). */
async function ensureAsset(
  orgId: string,
  baseCategoryId: string,
  categoryId: string,
  suffix: string,
  itemName: string,
) {
  await db.astAsset.upsert({
    where: { orgId_itemCode: { orgId, itemCode: `${SEED_ASSET_PREFIX}${suffix}` } },
    update: {},
    create: {
      orgId,
      assetType: "Fixed",
      baseCategoryId,
      categoryId,
      itemName,
      itemCode: `${SEED_ASSET_PREFIX}${suffix}`,
      serialNumber: `${SEED_ASSET_PREFIX}SN-${suffix}`,
      invoiceNumber: `${SEED_ASSET_PREFIX}INV-${suffix}`,
      purchaseDate: "2026-01-01",
      location: "HQ",
      condition: "Good",
      description: "Seed demo asset for Asset Request fulfilment testing",
      // assetStatus omitted → defaults to Available
    },
  });
}

async function main() {
  const orgId = requireOrgId();

  if (hasFlag("reset")) {
    const req = await db.astAssetRequest.deleteMany({
      where: { orgId, justification: { startsWith: SEED_TAG } },
    });
    const demo = await db.astAsset.findMany({
      where: { orgId, itemCode: { startsWith: SEED_ASSET_PREFIX } },
      select: { id: true },
    });
    if (demo.length) {
      await db.astAssignment.deleteMany({ where: { orgId, assetId: { in: demo.map((d) => d.id) } } });
    }
    const assets = await db.astAsset.deleteMany({
      where: { orgId, itemCode: { startsWith: SEED_ASSET_PREFIX } },
    });
    console.log(`Removed ${req.count} seeded request(s) and ${assets.count} demo asset(s) for org ${orgId}.`);
    return;
  }

  const requesterUserId = await resolveRequesterUserId(orgId);

  // Ensure the three catalog categories exist.
  const electronics = await ensureCategory(orgId, "Electronics", "Laptop");
  const furniture = await ensureCategory(orgId, "Furniture", "Chair");
  const subscriptions = await ensureCategory(orgId, "Subscriptions", "SaaS");

  // Ensure a little in-stock inventory so physical fulfil can be tested.
  await ensureAsset(orgId, electronics.baseId, electronics.categoryId, "EL-1", "Demo Laptop A");
  await ensureAsset(orgId, electronics.baseId, electronics.categoryId, "EL-2", "Demo Laptop B");
  await ensureAsset(orgId, furniture.baseId, furniture.categoryId, "FR-1", "Demo Chair A");
  await ensureAsset(orgId, furniture.baseId, furniture.categoryId, "FR-2", "Demo Chair B");

  type SeedRow = {
    itemKind: AstAssetRequestKind;
    itemType: string;
    requestType: AstAssetRequestType;
    quantity: number;
    priority: AstAssetRequestPriority;
    requiredBy: string | null;
    status: AstAssetRequestStatus;
    cat: { baseId: string; categoryId: string };
    note: string;
  };
  const rows: SeedRow[] = [
    {
      itemKind: "Physical", itemType: "Laptop", requestType: "New", quantity: 2, priority: "High",
      requiredBy: "2026-07-22", status: "PendingApproval", cat: electronics,
      note: "Two new hires joining the frontend team next week.",
    },
    {
      itemKind: "Physical", itemType: "Office Chair", requestType: "Replacement", quantity: 5, priority: "Medium",
      requiredBy: null, status: "Submitted", cat: furniture,
      note: "Existing chairs in the ops bay are broken.",
    },
    {
      itemKind: "Subscription", itemType: "Claude Pro seat", requestType: "Additional", quantity: 1, priority: "Urgent",
      requiredBy: "2026-07-18", status: "PendingApproval", cat: subscriptions,
      note: "Claude access for the support automation pilot.",
    },
  ];

  // Replace any prior seeded requests so a re-run yields a clean, current set.
  await db.astAssetRequest.deleteMany({ where: { orgId, justification: { startsWith: SEED_TAG } } });

  for (const r of rows) {
    await db.astAssetRequest.create({
      data: {
        orgId,
        requesterUserId,
        itemKind: r.itemKind,
        itemType: r.itemType,
        baseCategoryId: r.cat.baseId,
        categoryId: r.cat.categoryId,
        requestType: r.requestType,
        quantity: r.quantity,
        quantityFulfilled: 0,
        justification: `${SEED_TAG} ${r.note}`,
        priority: r.priority,
        requiredBy: r.requiredBy,
        status: r.status,
      },
    });
  }

  console.log(`Seeded ${rows.length} asset request(s) + demo stock for org ${orgId} (requester ${requesterUserId}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
