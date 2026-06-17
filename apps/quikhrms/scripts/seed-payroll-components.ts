import { prisma } from "../lib/prisma";

const TENANT = "tenant_dev_001";
const USER = "user_dev_001";

interface ComponentSeed {
  name: string;
  code: string;
  category:
    | "Basic"
    | "HRA"
    | "DA"
    | "ConveyanceAllowance"
    | "MedicalAllowance"
    | "SpecialAllowance"
    | "LeaveTravelAllowance"
    | "FixedAllowance"
    | "EPFEmployee"
    | "ProfessionalTax"
    | "IncomeTax";
  type: "Earning" | "Deduction" | "StatutoryContribution";
  amountType: "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross";
  amountValue: number | null;
  nameInPayslip: string;
  taxable: boolean;
  includeInCTC: boolean;
  includeInGross: boolean;
  considerForEPF: boolean;
  considerForESI: boolean;
  considerForPT: boolean;
  considerForLWF: boolean;
  proRateOnLOP: boolean;
  partOfSalaryStructure: boolean;
  isSystem: boolean;
}

const COMPONENTS: ComponentSeed[] = [
  {
    name: "Basic", code: "BASIC", category: "Basic", type: "Earning",
    amountType: "PercentOfCTC", amountValue: 40, nameInPayslip: "Basic",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: true, considerForESI: true, considerForPT: true, considerForLWF: true,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "House Rent Allowance", code: "HRA", category: "HRA", type: "Earning",
    amountType: "PercentOfBasic", amountValue: 50, nameInPayslip: "HRA",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: false, considerForESI: true, considerForPT: true, considerForLWF: true,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "Conveyance Allowance", code: "CONVEYANCE", category: "ConveyanceAllowance", type: "Earning",
    amountType: "Fixed", amountValue: 1600, nameInPayslip: "Conveyance",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: false, considerForESI: true, considerForPT: true, considerForLWF: true,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "Medical Allowance", code: "MEDICAL", category: "MedicalAllowance", type: "Earning",
    amountType: "Fixed", amountValue: 1250, nameInPayslip: "Medical",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: false, considerForESI: true, considerForPT: true, considerForLWF: true,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "Leave Travel Allowance", code: "LTA", category: "LeaveTravelAllowance", type: "Earning",
    amountType: "PercentOfBasic", amountValue: 8.33, nameInPayslip: "LTA",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: false, considerForESI: false, considerForPT: true, considerForLWF: false,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "Special Allowance", code: "SPECIAL", category: "SpecialAllowance", type: "Earning",
    amountType: "PercentOfBasic", amountValue: 20, nameInPayslip: "Special Allowance",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: false, considerForESI: true, considerForPT: true, considerForLWF: true,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "Fixed Allowance", code: "FIXED_ALLOWANCE", category: "FixedAllowance", type: "Earning",
    amountType: "Fixed", amountValue: 0, nameInPayslip: "Fixed Allowance",
    taxable: true, includeInCTC: true, includeInGross: true,
    considerForEPF: false, considerForESI: true, considerForPT: true, considerForLWF: true,
    proRateOnLOP: true, partOfSalaryStructure: true, isSystem: true,
  },
  {
    name: "Provident Fund (Employee)", code: "EPF_EMP", category: "EPFEmployee", type: "Deduction",
    amountType: "PercentOfBasic", amountValue: 12, nameInPayslip: "Provident Fund",
    taxable: false, includeInCTC: false, includeInGross: false,
    considerForEPF: false, considerForESI: false, considerForPT: false, considerForLWF: false,
    proRateOnLOP: true, partOfSalaryStructure: false, isSystem: true,
  },
  {
    name: "Professional Tax", code: "PT", category: "ProfessionalTax", type: "Deduction",
    amountType: "Fixed", amountValue: 0, nameInPayslip: "Professional Tax",
    taxable: false, includeInCTC: false, includeInGross: false,
    considerForEPF: false, considerForESI: false, considerForPT: false, considerForLWF: false,
    proRateOnLOP: false, partOfSalaryStructure: false, isSystem: true,
  },
  {
    name: "Income Tax (TDS)", code: "TDS", category: "IncomeTax", type: "Deduction",
    amountType: "Fixed", amountValue: 0, nameInPayslip: "Income Tax",
    taxable: false, includeInCTC: false, includeInGross: false,
    considerForEPF: false, considerForESI: false, considerForPT: false, considerForLWF: false,
    proRateOnLOP: false, partOfSalaryStructure: false, isSystem: true,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const c of COMPONENTS) {
    const existing = await prisma.salaryComponent.findFirst({
      where: { orgId: TENANT, code: c.code, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.salaryComponent.create({
      data: {
        orgId: TENANT,
        name: c.name,
        code: c.code,
        type: c.type,
        category: c.category,
        amountType: c.amountType,
        amountValue: c.amountValue,
        frequency: "Monthly",
        taxable: c.taxable,
        includeInCTC: c.includeInCTC,
        includeInGross: c.includeInGross,
        considerForEPF: c.considerForEPF,
        considerForESI: c.considerForESI,
        considerForPT: c.considerForPT,
        considerForLWF: c.considerForLWF,
        considerEPFIfPFWageLT15k: false,
        proRateOnLOP: c.proRateOnLOP,
        nameInPayslip: c.nameInPayslip,
        partOfSalaryStructure: c.partOfSalaryStructure,
        isSystem: c.isSystem,
        isActive: true,
        createdBy: USER,
        updatedBy: USER,
      },
    });
    created++;
  }

  await prisma.payrollSettings.upsert({
    where: { orgId: TENANT },
    update: { salaryComponentsCompleted: true, updatedBy: USER },
    create: { orgId: TENANT, salaryComponentsCompleted: true, createdBy: USER, updatedBy: USER },
  });

  console.log(`Salary components: created=${created}, skipped=${skipped}, total=${COMPONENTS.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
