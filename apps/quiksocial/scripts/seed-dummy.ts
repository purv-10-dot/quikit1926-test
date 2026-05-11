/**
 * QuikSocial — dummy demo data seeder.
 *
 * Creates a self-contained "Demo QuikSocial" org with users, brands,
 * products, services, campaigns, posts and asset library entries.
 *
 * Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/seed-dummy.ts
 *   (from apps/quiksocial)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ORG_SLUG = "demo-quiksocial";
const APP_SLUG = "quiksocial";
const PASSWORD = "Quikit2026";

const USERS = [
  { email: "qsoc.admin@quikit-demo.local", firstName: "Nina", lastName: "Verma", role: "admin" },
  { email: "qsoc.creator@quikit-demo.local", firstName: "Kabir", lastName: "Shah", role: "manager" },
  { email: "qsoc.editor@quikit-demo.local", firstName: "Amelia", lastName: "Cole", role: "employee" },
  { email: "qsoc.designer@quikit-demo.local", firstName: "Rohan", lastName: "Iyer", role: "employee" },
  { email: "qsoc.scheduler@quikit-demo.local", firstName: "Priya", lastName: "Nair", role: "employee" },
];

const BRANDS = [
  {
    name: "Acme Coffee Co.",
    industry: "Food & Beverage",
    websiteUrl: "https://example.com/acme-coffee",
    about: "Specialty single-origin coffee roasters since 2015.",
    tagline: "Roasted with intention.",
    brandVoice: "Warm, casual, knowledgeable.",
    country: "IN",
    primaryColors: ["#6f4e37", "#c69c6d"],
    accentColor: "#a0522d",
    brandTone: ["friendly", "expert"],
    brandValues: ["quality", "sustainability"],
    keywords: ["coffee", "roasted", "single-origin"],
    hashtags: ["#acmecoffee", "#roasted", "#cafelife"],
    isDefault: true,
  },
  {
    name: "PixelForge Studios",
    industry: "SaaS / Design",
    websiteUrl: "https://example.com/pixelforge",
    about: "Design ops platform for high-output product teams.",
    tagline: "Ship beautiful work, faster.",
    brandVoice: "Crisp, confident, modern.",
    country: "IN",
    primaryColors: ["#0f172a", "#6366f1"],
    accentColor: "#22d3ee",
    brandTone: ["confident", "modern"],
    brandValues: ["craft", "speed"],
    keywords: ["design", "saas", "productivity"],
    hashtags: ["#pixelforge", "#designops", "#productdesign"],
    isDefault: false,
  },
];

const PRODUCT_TEMPLATES: Array<{ name: string; description: string; price: string; currency: string; sku: string; category: string }> = [
  { name: "Single-Origin Ethiopia 250g", description: "Bright, fruity light roast.", price: "650", currency: "INR", sku: "SO-ET-250", category: "Coffee" },
  { name: "Cold Brew Concentrate 1L", description: "Smooth, low-acidity concentrate.", price: "550", currency: "INR", sku: "CB-CON-1L", category: "Coffee" },
  { name: "Ceramic Pour-over Dripper", description: "Hand-thrown V60-style dripper.", price: "1200", currency: "INR", sku: "EQ-DR-V60", category: "Equipment" },
];

const SERVICE_TEMPLATES: Array<{ name: string; description: string; pricing: string; currency: string; duration: string; category: string }> = [
  { name: "Design System Audit", description: "Two-week audit of your design system.", pricing: "75000", currency: "INR", duration: "2 weeks", category: "Consulting" },
  { name: "Quarterly Design Sprint", description: "Embedded design sprint with your team.", pricing: "150000", currency: "INR", duration: "1 quarter", category: "Engagement" },
];

const ASSET_TEMPLATES = [
  { name: "Hero banner — coffee shop", type: "image", url: "https://placehold.co/1200x630.png", category: "banner" },
  { name: "Founder portrait", type: "image", url: "https://placehold.co/600x600.png", category: "team" },
  { name: "Product flat lay", type: "image", url: "https://placehold.co/1080x1080.png", category: "product" },
  { name: "Brand intro video", type: "video", url: "https://example.com/intro.mp4", category: "brand" },
];

const PLATFORMS = ["instagram", "facebook", "linkedin", "twitter"];

const POST_BODIES = [
  "Fresh roast just dropped 🔥 stop by today and taste the difference.",
  "Behind the scenes: our cupping room before sunrise.",
  "What sets a great pour-over apart? Patience and a good kettle.",
  "Save the date — our annual brew school opens registrations.",
  "Coffee tip of the week: store beans in an airtight, opaque jar.",
  "We just shipped a new feature — a redesigned design tokens panel.",
  "Customer story: how PixelForge cut design review time by 60%.",
  "Hiring: we're looking for a senior brand designer (remote OK).",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function wipe(orgId: string, userIds: string[]) {
  console.log("🧨 Wiping existing demo data…");
  await db.$transaction([
    db.post.deleteMany({ where: { orgId } }),
    db.campaign.deleteMany({ where: { orgId } }),
    db.assetLibrary.deleteMany({ where: { orgId } }),
    db.product.deleteMany({ where: { orgId } }),
    db.service.deleteMany({ where: { orgId } }),
    db.socialAccount.deleteMany({ where: { orgId } }),
    db.userPreference.deleteMany({ where: { orgId } }),
    db.brandMembership.deleteMany({ where: { orgId } }),
    db.brandInviteAssignment.deleteMany({ where: { orgId } }),
    db.brandInvite.deleteMany({ where: { orgId } }),
    db.brand.deleteMany({ where: { orgId } }),
    db.userAppAccess.deleteMany({ where: { orgId } }),
    db.orgMember.deleteMany({ where: { orgId } }),
  ]);
  await db.user.deleteMany({
    where: { id: { in: userIds }, memberships: { none: {} } },
  });
}

async function ensureOrg() {
  return db.org.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      name: "Demo QuikSocial",
      slug: ORG_SLUG,
      description: "Auto-seeded demo org for QuikSocial",
      plan: "growth",
      brandColor: "#6366f1",
    },
  });
}

async function ensureUsers(orgId: string, appId: string) {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { firstName: u.firstName, lastName: u.lastName, password: hashed },
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        password: hashed,
        emailVerified: new Date(),
      },
    });
    ids[u.email] = user.id;
  }
  for (const u of USERS) {
    await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: ids[u.email]! } },
      update: { role: u.role, status: "active" },
      create: { orgId, userId: ids[u.email]!, role: u.role, status: "active", acceptedAt: new Date() },
    });
    await db.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId: ids[u.email]!, orgId, appId } },
      update: { role: u.role === "admin" ? "admin" : "member" },
      create: { userId: ids[u.email]!, orgId, appId, role: u.role === "admin" ? "admin" : "member" },
    });
  }
  return ids;
}

async function seedBrand(orgId: string, b: typeof BRANDS[number], userIds: Record<string, string>) {
  const adminId = userIds[USERS[0]!.email]!;
  const brand = await db.brand.create({
    data: {
      orgId,
      name: b.name,
      industry: b.industry,
      websiteUrl: b.websiteUrl,
      about: b.about,
      tagline: b.tagline,
      brandVoice: b.brandVoice,
      country: b.country,
      isDefault: b.isDefault,
      primaryColors: b.primaryColors,
      accentColor: b.accentColor,
      brandTone: b.brandTone,
      brandValues: b.brandValues,
      keywords: b.keywords,
      hashtags: b.hashtags,
      createdBy: adminId,
    },
  });

  // Memberships — give all users access
  for (const u of USERS) {
    await db.brandMembership.create({
      data: {
        orgId,
        brandId: brand.id,
        userId: userIds[u.email]!,
        email: u.email,
        role: u.role === "admin" ? "owner" : u.role === "manager" ? "editor" : "member",
        invitedBy: adminId,
      },
    });
  }

  // Products (only for first brand — coffee)
  const products: { id: string }[] = [];
  if (b.isDefault) {
    for (const p of PRODUCT_TEMPLATES) {
      const row = await db.product.create({
        data: {
          orgId,
          brandId: brand.id,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          sku: p.sku,
          category: p.category,
          isActive: true,
          createdBy: adminId,
        },
      });
      products.push({ id: row.id });
    }
  } else {
    for (const s of SERVICE_TEMPLATES) {
      await db.service.create({
        data: {
          orgId,
          brandId: brand.id,
          name: s.name,
          description: s.description,
          pricing: s.pricing,
          currency: s.currency,
          duration: s.duration,
          category: s.category,
          isActive: true,
          createdBy: adminId,
        },
      });
    }
  }

  // Assets
  for (const a of ASSET_TEMPLATES) {
    await db.assetLibrary.create({
      data: {
        orgId,
        brandId: brand.id,
        name: a.name,
        type: a.type,
        url: a.url,
        category: a.category,
        isActive: true,
        createdBy: adminId,
      },
    });
  }

  // Campaign + posts
  const startDate = new Date();
  const endDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const campaign = await db.campaign.create({
    data: {
      orgId,
      brandId: brand.id,
      name: `${b.name} — Spring 2026`,
      describeConcept: `Seasonal campaign highlighting ${b.name}.`,
      objective: "awareness",
      status: "active",
      startDate,
      endDate,
      frequency: "weekly",
      weeklyDay: 3,
      postTime: "09:00",
      timezone: "Asia/Kolkata",
      totalPosts: 8,
      generatedPosts: 5,
      includeLogo: true,
      brandColorPrimary: b.primaryColors[0],
      brandColorAccent: b.accentColor,
      createdBy: userIds[USERS[1]!.email],
    },
  });

  // Posts (10 per brand, mixed statuses)
  for (let i = 0; i < 10; i++) {
    const platform = rand(PLATFORMS);
    const status = rand(["draft", "scheduled", "published", "approved", "rejected"]);
    const scheduledFor = status === "scheduled" || status === "approved"
      ? new Date(Date.now() + randInt(1, 14) * 24 * 3600 * 1000)
      : null;
    const publishedAt = status === "published"
      ? new Date(Date.now() - randInt(1, 30) * 24 * 3600 * 1000)
      : null;
    await db.post.create({
      data: {
        orgId,
        brandId: brand.id,
        campaignId: campaign.id,
        title: `Post ${i + 1} — ${b.name}`,
        content: rand(POST_BODIES),
        platform,
        status,
        scheduledFor,
        publishedAt,
        isAiGenerated: Math.random() > 0.5,
        likes: status === "published" ? randInt(5, 250) : 0,
        comments: status === "published" ? randInt(0, 30) : 0,
        shares: status === "published" ? randInt(0, 50) : 0,
        createdBy: userIds[USERS[1]!.email],
      },
    });
  }

  return brand.id;
}

async function main() {
  console.log("🌱 Seeding QuikSocial demo data…\n");
  const app = await db.app.findUnique({ where: { slug: APP_SLUG } });
  if (!app) throw new Error(`App slug "${APP_SLUG}" not found — seed apps first`);

  const org = await ensureOrg();
  const known: string[] = [];
  for (const u of USERS) {
    const e = await db.user.findUnique({ where: { email: u.email }, select: { id: true } });
    if (e) known.push(e.id);
  }
  await wipe(org.id, known);

  const userIds = await ensureUsers(org.id, app.id);
  console.log(`✅ Org: ${org.name} (${org.id})`);
  console.log(`✅ Users: ${USERS.length}`);

  for (const b of BRANDS) {
    const id = await seedBrand(org.id, b, userIds);
    console.log(`✅ Brand: ${b.name} (${id})`);
  }

  // Set first user's active brand
  const firstBrand = await db.brand.findFirst({ where: { orgId: org.id, isDefault: true } });
  if (firstBrand) {
    for (const u of USERS) {
      await db.userPreference.create({
        data: {
          orgId: org.id,
          userId: userIds[u.email]!,
          activeBrandId: firstBrand.id,
        },
      });
    }
  }

  console.log(`\n🎉 Done. ${BRANDS.length} brands, 20 posts. Login with:`);
  for (const u of USERS) console.log(`   ${u.email}  /  ${PASSWORD}    (${u.role})`);
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
