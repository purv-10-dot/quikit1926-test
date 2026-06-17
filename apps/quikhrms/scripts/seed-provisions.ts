import { PrismaClient } from "@quikit/database";
import "dotenv/config";

const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";
const ADMIN = "user_dev_001";

interface Seed {
  name: string;
  category: "ITAccount" | "Hardware" | "Access" | "Compliance" | "Facility" | "ProvOther";
  description: string;
  isDefault: boolean;
  ownerAssigneeRole?: "HRRole" | "ReportingManagerRole" | "ITRole" | "FinanceRole" | "AdminRole";
}

const DEFAULTS: Seed[] = [
  // IT Accounts
  { name: "Work Email Account", category: "ITAccount", description: "Primary corporate email on company domain", isDefault: true, ownerAssigneeRole: "ITRole" },
  { name: "Slack Workspace Access", category: "ITAccount", description: "Invite to company Slack + default channels", isDefault: true, ownerAssigneeRole: "ITRole" },
  { name: "SSO / Google Workspace", category: "ITAccount", description: "Single sign-on identity provisioning", isDefault: true, ownerAssigneeRole: "ITRole" },
  { name: "GitHub Organization Access", category: "ITAccount", description: "Add to company GitHub org (engineering only)", isDefault: false, ownerAssigneeRole: "ITRole" },
  { name: "Jira / Linear Access", category: "ITAccount", description: "Project tracker seat", isDefault: false, ownerAssigneeRole: "ITRole" },
  { name: "Figma Seat", category: "ITAccount", description: "Design tool access (designers)", isDefault: false, ownerAssigneeRole: "ITRole" },
  { name: "Notion / Confluence Access", category: "ITAccount", description: "Knowledge base workspace", isDefault: true, ownerAssigneeRole: "ITRole" },

  // Hardware
  { name: "Laptop (MacBook / Dell)", category: "Hardware", description: "Primary work machine per role spec", isDefault: true, ownerAssigneeRole: "ITRole" },
  { name: "External Monitor", category: "Hardware", description: "27\" 4K display (office/hybrid)", isDefault: false, ownerAssigneeRole: "ITRole" },
  { name: "Headset", category: "Hardware", description: "Noise-cancelling headset for calls", isDefault: false, ownerAssigneeRole: "ITRole" },
  { name: "Corporate SIM / Mobile", category: "Hardware", description: "Work phone + SIM (sales / leadership)", isDefault: false, ownerAssigneeRole: "ITRole" },
  { name: "Keyboard + Mouse", category: "Hardware", description: "Peripheral set", isDefault: false, ownerAssigneeRole: "ITRole" },

  // Access
  { name: "VPN Access", category: "Access", description: "Corporate VPN credentials", isDefault: true, ownerAssigneeRole: "ITRole" },
  { name: "Office Access Card / Building", category: "Access", description: "Physical badge for office entry", isDefault: true, ownerAssigneeRole: "HRRole" },
  { name: "Parking Pass", category: "Access", description: "Assigned parking (optional)", isDefault: false, ownerAssigneeRole: "HRRole" },
  { name: "AWS / Cloud Console", category: "Access", description: "IAM user + MFA (engineering)", isDefault: false, ownerAssigneeRole: "ITRole" },

  // Compliance
  { name: "NDA Signed", category: "Compliance", description: "Non-disclosure agreement signed & filed", isDefault: true, ownerAssigneeRole: "HRRole" },
  { name: "Code of Conduct Acknowledgement", category: "Compliance", description: "Company policy acceptance", isDefault: true, ownerAssigneeRole: "HRRole" },
  { name: "POSH Training Completed", category: "Compliance", description: "Prevention of sexual harassment training", isDefault: true, ownerAssigneeRole: "HRRole" },
  { name: "Data Protection Training", category: "Compliance", description: "GDPR / DPDP awareness", isDefault: true, ownerAssigneeRole: "HRRole" },
  { name: "Background Verification", category: "Compliance", description: "External BGV report received & cleared", isDefault: true, ownerAssigneeRole: "HRRole" },

  // Facility
  { name: "Desk Assignment", category: "Facility", description: "Seat allocation in workspace", isDefault: false, ownerAssigneeRole: "HRRole" },
  { name: "Welcome Kit", category: "Facility", description: "T-shirt, notebook, stickers", isDefault: true, ownerAssigneeRole: "HRRole" },
  { name: "ID Card / Lanyard", category: "Facility", description: "Employee photo ID", isDefault: true, ownerAssigneeRole: "HRRole" },
];

(async () => {
  console.log("🌱 Seeding provision catalogue...");
  let created = 0; let updated = 0;
  for (const p of DEFAULTS) {
    const existing = await prisma.provisionItem.findFirst({
      where: { orgId: TENANT, name: p.name, deletedAt: null },
    });
    if (existing) {
      await prisma.provisionItem.update({
        where: { id: existing.id },
        data: {
          category: p.category, description: p.description,
          isDefault: p.isDefault, ownerAssigneeRole: p.ownerAssigneeRole ?? null,
          updatedBy: ADMIN,
        },
      });
      updated++;
    } else {
      await prisma.provisionItem.create({
        data: {
          orgId: TENANT,
          name: p.name,
          category: p.category,
          description: p.description,
          isDefault: p.isDefault,
          isActive: true,
          ownerAssigneeRole: p.ownerAssigneeRole ?? null,
          createdBy: ADMIN, updatedBy: ADMIN,
        },
      });
      created++;
    }
  }
  console.log(`✅ Catalogue: ${created} created, ${updated} updated (${DEFAULTS.length} total)`);
  await prisma.$disconnect();
})();
