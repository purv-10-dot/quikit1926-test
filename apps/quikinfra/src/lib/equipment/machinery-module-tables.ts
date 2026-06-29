/**
 * Machinery & Equipment — one primary table per sidebar item (6 total).
 * Master data (`Machinery`, `Assets`) is shared across modules.
 */

export const MACHINERY_MODULE_TABLES = [
  {
    menuKey: "equip.log_book",
    label: "Equipment Log Book",
    table: "Equipment_logs",
    prismaModel: "CnEquipmentLog",
  },
  {
    menuKey: "equip.maintenance",
    label: "Maintenance",
    table: "Maintenance_job_cards",
    prismaModel: "CnMaintenanceJobCard",
  },
  {
    menuKey: "equip.deployment",
    label: "Deployment & Compliance",
    table: "Equipment_deployment",
    prismaModel: "CnEquipmentDeployment",
  },
  {
    menuKey: "equip.fleet",
    label: "Fleet Dashboard",
    table: "Fleet_dashboard",
    prismaModel: "CnFleetDashboard",
  },
  {
    menuKey: "equip.hire_rent",
    label: "Hire & Rent",
    table: "Hire_rent_records",
    prismaModel: "CnHireRentRecord",
  },
  {
    menuKey: "equip.fixed_assets",
    label: "Fixed Asset / Tools",
    table: "Fixed_asset_transactions",
    prismaModel: "CnFixedAssetTransaction",
  },
] as const;
