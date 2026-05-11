/**
 * QuikConstruction — dummy demo data seeder.
 *
 * Seeds masters + a sample project against the QuikConstruction-only Prisma
 * client (.prisma-qc/client) and its standalone schema (separate from the
 * shared @quikit/database schema). All records are tenantId/orgId="default"
 * to match the rest of this app's data model.
 *
 * Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/seed-dummy.ts
 *   (from apps/quikconstruction)
 */

import { PrismaClient } from "../node_modules/.prisma-qc/client";
import { Prisma } from "../node_modules/.prisma-qc/client";
import { scryptSync, randomBytes } from "node:crypto";

const db = new PrismaClient();

const T = "default";
const O = "default";
const PASSWORD = "Quikit2026";

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const USERS = [
  { id: "qc-demo-admin", email: "qc.admin@quikit-demo.local", username: "qc.admin", fullName: "Anjali Reddy", department: "Engineering", userType: "ADMIN", roleKey: "tenant_admin" },
  { id: "qc-demo-pm", email: "qc.pm@quikit-demo.local", username: "qc.pm", fullName: "Suresh Rao", department: "Engineering", userType: "HO_USER", roleKey: "project_manager" },
  { id: "qc-demo-site", email: "qc.site@quikit-demo.local", username: "qc.site", fullName: "Vikram Patil", department: "Site Operations", userType: "SITE_ADMIN", roleKey: "site_admin" },
  { id: "qc-demo-acct", email: "qc.accountant@quikit-demo.local", username: "qc.acct", fullName: "Neha Joshi", department: "Accounts", userType: "USER", roleKey: "accountant" },
  { id: "qc-demo-store", email: "qc.store@quikit-demo.local", username: "qc.store", fullName: "Arjun Yadav", department: "Procurement", userType: "USER", roleKey: "user" },
];

const COMPANY = {
  name: "Demo Builders Pvt Ltd",
  legalName: "Demo Builders Private Limited",
  shortName: "DemoBuilders",
  gstin: "27AAAAA0000A1Z5",
  pan: "AAAAA0000A",
  cin: "U45200MH2020PTC123456",
  address: "Plot 12, Construction Lane",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
  phone: "+91-9000000000",
  email: "info@demo-builders.local",
};

const UOMS = [
  { code: "NOS", name: "Numbers", type: "count", precision: 0, isBase: true },
  { code: "KG", name: "Kilogram", type: "weight", precision: 3, isBase: true },
  { code: "MTR", name: "Metre", type: "length", precision: 2, isBase: true },
  { code: "SQM", name: "Square Metre", type: "area", precision: 2, isBase: true },
  { code: "CUM", name: "Cubic Metre", type: "volume", precision: 3, isBase: true },
  { code: "HRS", name: "Hours", type: "time", precision: 2, isBase: true },
  { code: "BAG", name: "Bag", type: "count", precision: 0, isBase: false },
];

const GST_CODES = [
  { code: "GST0", description: "Exempt", rate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 },
  { code: "GST5", description: "5% GST", rate: 5, cgstRate: 2.5, sgstRate: 2.5, igstRate: 5 },
  { code: "GST12", description: "12% GST", rate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12 },
  { code: "GST18", description: "18% GST", rate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18 },
  { code: "GST28", description: "28% GST", rate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28 },
];

const TDS_CODES = [
  { section: "194C", description: "Contractors / sub-contractors", rate: 1, thresholdAmount: 30000 },
  { section: "194J", description: "Professional fees", rate: 10, thresholdAmount: 30000 },
  { section: "194I", description: "Rent on plant & machinery", rate: 2, thresholdAmount: 240000 },
];

const DEPARTMENTS = [
  { code: "ENG", name: "Engineering" },
  { code: "PROC", name: "Procurement" },
  { code: "ACCT", name: "Accounts" },
  { code: "SITE", name: "Site Operations" },
];

const WORK_CATEGORIES = [
  { name: "Civil Works", description: "Concrete, masonry, finishing", sacCode: "9954" },
  { name: "Electrical", description: "Wiring, lighting, fittings", sacCode: "9954" },
  { name: "Plumbing", description: "Sanitary, drainage, fittings", sacCode: "9954" },
];

const COST_CENTERS = [
  { code: "HO", name: "Head Office" },
  { code: "P01", name: "Project Site 01" },
];

const VENDORS = [
  { code: "V001", name: "Pune Steel Traders", legalName: "Pune Steel Traders Pvt Ltd", gstin: "27BBBBB0000A1Z5", pan: "BBBBB0000A", contactPerson: "Rajesh Kulkarni", phone: "+91-9111111111", email: "sales@punesteel.local", city: "Pune", state: "Maharashtra", paymentTerms: "Net 30", paymentTermsDays: 30, rating: 4 },
  { code: "V002", name: "Suraj Cement Co.", legalName: "Suraj Cement Co.", gstin: "27CCCCC0000A1Z5", pan: "CCCCC0000A", contactPerson: "Suraj Modi", phone: "+91-9222222222", email: "orders@surajcement.local", city: "Mumbai", state: "Maharashtra", paymentTerms: "Net 45", paymentTermsDays: 45, rating: 5 },
  { code: "V003", name: "Bharat Electricals", legalName: "Bharat Electricals", gstin: "27DDDDD0000A1Z5", pan: "DDDDD0000A", contactPerson: "Anita Sharma", phone: "+91-9333333333", email: "info@bharatelec.local", city: "Pune", state: "Maharashtra", paymentTerms: "Net 30", paymentTermsDays: 30, rating: 4 },
];

const CUSTOMERS = [
  { code: "C001", name: "Lotus Realty Group", contactPerson: "Mehul Shah", phone: "+91-9444444444", email: "projects@lotusrealty.local", city: "Mumbai", state: "Maharashtra", gstin: "27EEEEE0000A1Z5" },
  { code: "C002", name: "Greenfield Developers", contactPerson: "Pooja Singh", phone: "+91-9555555555", email: "ops@greenfield.local", city: "Pune", state: "Maharashtra", gstin: "27FFFFF0000A1Z5" },
];

const CONTRACTORS = [
  { code: "CON01", name: "Shivaji Builders", contactPerson: "Shivaji Pawar", phone: "+91-9666666666", city: "Pune", state: "Maharashtra", licenseNo: "PWD/CL/2021/123", specialization: "Civil" },
  { code: "CON02", name: "Bharat Plumbing Works", contactPerson: "Ramesh Nair", phone: "+91-9777777777", city: "Pune", state: "Maharashtra", licenseNo: "PWD/PL/2022/456", specialization: "Plumbing" },
];

const ITEM_GROUPS = [
  { name: "Cement" },
  { name: "Steel" },
  { name: "Electrical" },
  { name: "Plumbing" },
];

const ITEMS = [
  { code: "ITM001", name: "OPC 53 Grade Cement Bag (50kg)", group: "Cement", uom: "BAG", hsnCode: "2523", gstRate: 28, standardRate: 380 },
  { code: "ITM002", name: "TMT Steel Bar 12mm (1m)", group: "Steel", uom: "MTR", hsnCode: "7214", gstRate: 18, standardRate: 65 },
  { code: "ITM003", name: "TMT Steel Bar 16mm (1m)", group: "Steel", uom: "MTR", hsnCode: "7214", gstRate: 18, standardRate: 95 },
  { code: "ITM004", name: "PVC Conduit Pipe 25mm", group: "Electrical", uom: "MTR", hsnCode: "3917", gstRate: 18, standardRate: 35 },
  { code: "ITM005", name: "Copper Wire 2.5mm", group: "Electrical", uom: "MTR", hsnCode: "8544", gstRate: 18, standardRate: 18 },
  { code: "ITM006", name: "GI Pipe 1 inch", group: "Plumbing", uom: "MTR", hsnCode: "7306", gstRate: 18, standardRate: 220 },
];

const TERMS = [
  { title: "Standard PO terms", body: "Payment within 30 days. Goods delivered to site as per delivery schedule. Inspection at delivery.", applicableTo: "po", isDefault: true },
  { title: "Standard WO terms", body: "Work to commence within 7 days of issue. Quality as per IS standards.", applicableTo: "wo", isDefault: true },
  { title: "RFQ terms", body: "Submit quotation within 7 days. Validity 30 days.", applicableTo: "rfq", isDefault: true },
];

async function wipeDemo() {
  console.log("🧨 Wiping prior dummy demo data (codes prefixed DEMO_*)…");
  const adminId = USERS[0]!.id;
  const userIds = USERS.map((u) => u.id);
  await db.$transaction([
    db.cnAsset.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnMachinery.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnLocation.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnCostCenter.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnWorkCategory.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnDepartment.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnTermsCondition.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnTDSCode.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnGSTCode.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnContractor.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnCustomer.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnVendor.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnItem.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnItemGroup.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnUOM.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnProject.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnFinancialYear.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnBank.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnCompany.deleteMany({ where: { tenantId: T, orgId: O, createdBy: { in: userIds } } }),
    db.cnUser.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}

async function seedUsers() {
  const passwordHash = hashPassword(PASSWORD);
  for (const u of USERS) {
    await db.cnUser.upsert({
      where: { id: u.id },
      update: { passwordHash, fullName: u.fullName, department: u.department, userType: u.userType, roleKey: u.roleKey, status: "active" },
      create: {
        id: u.id,
        tenantId: T,
        orgId: O,
        email: u.email,
        username: u.username,
        fullName: u.fullName,
        department: u.department,
        passwordHash,
        userType: u.userType,
        roleKey: u.roleKey,
        status: "active",
        mustChangePassword: false,
        invitedBy: USERS[0]!.id,
        invitedByName: USERS[0]!.fullName,
        acceptedAt: new Date(),
      },
    });
  }
}

async function main() {
  console.log("🌱 Seeding QuikConstruction demo data…\n");
  await wipeDemo();

  await seedUsers();
  console.log(`✅ Users: ${USERS.length}`);

  const adminId = USERS[0]!.id;
  const pmId = USERS[1]!.id;

  const company = await db.cnCompany.create({
    data: { tenantId: T, orgId: O, ...COMPANY, createdBy: adminId, updatedBy: adminId },
  });
  console.log(`✅ Company: ${company.name}`);

  await db.cnBank.create({
    data: {
      tenantId: T, orgId: O,
      companyId: company.id,
      bankName: "ICICI Bank",
      branchName: "Pune Camp",
      accountNo: "012345678901",
      ifscCode: "ICIC0000001",
      accountType: "current",
      createdBy: adminId, updatedBy: adminId,
    },
  });
  console.log("✅ Bank: 1");

  await db.cnFinancialYear.create({
    data: {
      tenantId: T, orgId: O,
      companyId: company.id,
      label: "FY 2026-27",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2027-03-31"),
      isCurrent: true,
      createdBy: adminId, updatedBy: adminId,
    },
  });
  console.log("✅ Financial year: FY 2026-27");

  for (const u of UOMS) {
    await db.cnUOM.create({ data: { tenantId: T, orgId: O, ...u, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ UOMs: ${UOMS.length}`);

  for (const g of GST_CODES) {
    await db.cnGSTCode.create({
      data: {
        tenantId: T, orgId: O,
        code: g.code, description: g.description,
        rate: new Prisma.Decimal(g.rate),
        cgstRate: new Prisma.Decimal(g.cgstRate),
        sgstRate: new Prisma.Decimal(g.sgstRate),
        igstRate: new Prisma.Decimal(g.igstRate),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  console.log(`✅ GST codes: ${GST_CODES.length}`);

  for (const t of TDS_CODES) {
    await db.cnTDSCode.create({
      data: {
        tenantId: T, orgId: O,
        section: t.section, description: t.description,
        rate: new Prisma.Decimal(t.rate),
        thresholdAmount: new Prisma.Decimal(t.thresholdAmount),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  console.log(`✅ TDS codes: ${TDS_CODES.length}`);

  for (const d of DEPARTMENTS) {
    await db.cnDepartment.create({ data: { tenantId: T, orgId: O, ...d, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ Departments: ${DEPARTMENTS.length}`);

  for (const w of WORK_CATEGORIES) {
    await db.cnWorkCategory.create({ data: { tenantId: T, orgId: O, ...w, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ Work categories: ${WORK_CATEGORIES.length}`);

  for (const c of COST_CENTERS) {
    await db.cnCostCenter.create({ data: { tenantId: T, orgId: O, ...c, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ Cost centers: ${COST_CENTERS.length}`);

  for (const v of VENDORS) {
    await db.cnVendor.create({ data: { tenantId: T, orgId: O, ...v, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ Vendors: ${VENDORS.length}`);

  const customerIds: Record<string, string> = {};
  for (const c of CUSTOMERS) {
    const row = await db.cnCustomer.create({ data: { tenantId: T, orgId: O, ...c, createdBy: adminId, updatedBy: adminId } });
    customerIds[c.code] = row.id;
  }
  console.log(`✅ Customers: ${CUSTOMERS.length}`);

  for (const c of CONTRACTORS) {
    await db.cnContractor.create({ data: { tenantId: T, orgId: O, ...c, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ Contractors: ${CONTRACTORS.length}`);

  const groupIds: Record<string, string> = {};
  for (const g of ITEM_GROUPS) {
    const row = await db.cnItemGroup.create({ data: { tenantId: T, orgId: O, name: g.name, createdBy: adminId, updatedBy: adminId } });
    groupIds[g.name] = row.id;
  }
  console.log(`✅ Item groups: ${ITEM_GROUPS.length}`);

  const uomRows = await db.cnUOM.findMany({ where: { tenantId: T, orgId: O } });
  const uomByCode: Record<string, string> = Object.fromEntries(uomRows.map((u) => [u.code, u.id]));

  for (const it of ITEMS) {
    await db.cnItem.create({
      data: {
        tenantId: T, orgId: O,
        code: it.code, name: it.name,
        groupId: groupIds[it.group]!,
        uomId: uomByCode[it.uom]!,
        hsnCode: it.hsnCode,
        gstRate: new Prisma.Decimal(it.gstRate),
        standardRate: new Prisma.Decimal(it.standardRate),
        createdBy: adminId, updatedBy: adminId,
      },
    });
  }
  console.log(`✅ Items: ${ITEMS.length}`);

  for (const t of TERMS) {
    await db.cnTermsCondition.create({ data: { tenantId: T, orgId: O, ...t, createdBy: adminId, updatedBy: adminId } });
  }
  console.log(`✅ Terms templates: ${TERMS.length}`);

  const project = await db.cnProject.create({
    data: {
      tenantId: T, orgId: O,
      code: "PRJ001",
      name: "Lotus Heights — Tower A",
      description: "10-storey residential tower, Pune",
      projectType: "Residential",
      companyId: company.id,
      clientId: customerIds["C001"],
      address: "Survey 145/2, Hinjewadi Phase 2",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411057",
      startDate: new Date(),
      expectedEndDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      projectValue: new Prisma.Decimal(75000000),
      budget: new Prisma.Decimal(72000000),
      projectManagerId: pmId,
      createdBy: adminId, updatedBy: adminId,
    },
  });
  console.log(`✅ Project: ${project.name}`);

  await db.cnLocation.createMany({
    data: [
      { tenantId: T, orgId: O, code: "HO-PUNE", name: "Head Office Pune", type: "head_office", city: "Pune", state: "Maharashtra", createdBy: adminId, updatedBy: adminId },
      { tenantId: T, orgId: O, code: "SITE-PRJ001", name: "Lotus Heights Site", type: "site", projectId: project.id, address: "Survey 145/2, Hinjewadi Phase 2", city: "Pune", state: "Maharashtra", createdBy: adminId, updatedBy: adminId },
      { tenantId: T, orgId: O, code: "WH-PUNE", name: "Pune Central Warehouse", type: "warehouse", city: "Pune", state: "Maharashtra", createdBy: adminId, updatedBy: adminId },
    ],
  });
  console.log("✅ Locations: 3");

  await db.cnMachinery.create({
    data: { tenantId: T, orgId: O, code: "MAC001", name: "Tata Hitachi EX 200", type: "Excavator", make: "Tata Hitachi", model: "EX 200", registrationNo: "MH12-AB-1234", projectId: project.id, fuelType: "Diesel", capacity: "20T", createdBy: adminId, updatedBy: adminId },
  });
  await db.cnAsset.create({
    data: { tenantId: T, orgId: O, assetCode: "AST001", name: "Site Office Container", category: "Infrastructure", purchaseDate: new Date("2025-01-15"), purchaseValue: new Prisma.Decimal(150000), createdBy: adminId, updatedBy: adminId },
  });
  console.log("✅ Machinery: 1, Asset: 1");

  console.log(`\n🎉 Done. Login with:`);
  for (const u of USERS) console.log(`   ${u.email}  /  ${PASSWORD}    (${u.userType})`);
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
