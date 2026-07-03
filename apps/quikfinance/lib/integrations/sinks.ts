import type { PrismaClient } from "@prisma/client";
import type { EntityType } from "./types";

/**
 * Entity Sinks — where normalized external records are written INTO QuikFinance.
 * The Sync/Migration engines call sinks through this interface, so adding domain
 * write support for a new entity is isolated here (open/closed). The default
 * sink records the cross-reference only (safe, non-destructive) which makes
 * dry-runs and counters work without domain writes; reference sinks for
 * customers and products perform real upserts and serve as templates.
 */

export type SinkContext = { prisma: PrismaClient; orgId: string };

export type SinkInput = {
  externalId: string;
  internalId?: string | null;
  data: Record<string, unknown>;
};

export type SinkResult = { internalId: string | null; wrote: boolean };

export interface EntitySink {
  /** Returns the internal id (existing or new). dryRun must NOT write domain rows. */
  write(ctx: SinkContext, input: SinkInput, dryRun: boolean): Promise<SinkResult>;
}

const str = (v: unknown) => (v == null ? null : String(v));

/** Default: no domain write — engine still records the entity mapping. */
const defaultSink: EntitySink = {
  async write(_ctx, input) {
    return { internalId: input.internalId ?? null, wrote: false };
  }
};

/** Reference sink: customers/vendors → contacts. */
function contactSink(type: "customer" | "vendor"): EntitySink {
  return {
    async write(ctx, input, dryRun) {
      const d = input.data;
      const displayName = str(d.display_name ?? d.contact_name ?? d.Name ?? d.name ?? d.company_name) ?? "Unnamed";
      const email = str(d.email ?? d.Email);
      const phone = str(d.phone ?? d.mobile ?? d.LedgerPhone);
      const taxId = str(d.gst_no ?? d.gstin ?? d.PartyGSTIN ?? d.tax_id);
      const pan = str(d.pan ?? d.IncomeTaxNumber);
      if (dryRun) return { internalId: input.internalId ?? null, wrote: false };

      if (input.internalId) {
        await ctx.prisma.$executeRaw`
          UPDATE contacts SET display_name = ${displayName}, email = ${email}, phone = ${phone},
            tax_id = COALESCE(${taxId}, tax_id), pan = COALESCE(${pan}, pan), updated_at = now()
          WHERE id = ${input.internalId}::uuid AND org_id = ${ctx.orgId}::uuid`;
        return { internalId: input.internalId, wrote: true };
      }
      const rows = (await ctx.prisma.$queryRaw`
        INSERT INTO contacts (org_id, type, display_name, email, phone, tax_id, pan)
        VALUES (${ctx.orgId}::uuid, ${type}, ${displayName}, ${email}, ${phone}, ${taxId}, ${pan})
        RETURNING id`) as Array<{ id: string }>;
      return { internalId: rows[0]?.id ?? null, wrote: true };
    }
  };
}

/** Reference sink: products/services/inventory → items. */
const itemSink: EntitySink = {
  async write(ctx, input, dryRun) {
    const d = input.data;
    const name = str(d.name ?? d.item_name ?? d.Name) ?? "Unnamed item";
    const sku = str(d.sku ?? d.item_code) ?? `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 20)}`;
    const salesPrice = Number(d.rate ?? d.sales_price ?? d.OpeningRate ?? 0) || 0;
    const purchasePrice = Number(d.purchase_rate ?? d.purchase_price ?? 0) || 0;
    if (dryRun) return { internalId: input.internalId ?? null, wrote: false };

    if (input.internalId) {
      await ctx.prisma.$executeRaw`
        UPDATE items SET name = ${name}, sales_price = ${salesPrice}, purchase_price = ${purchasePrice}, updated_at = now()
        WHERE id = ${input.internalId}::uuid AND org_id = ${ctx.orgId}::uuid`;
      return { internalId: input.internalId, wrote: true };
    }
    const rows = (await ctx.prisma.$queryRaw`
      INSERT INTO items (org_id, sku, name, item_type, sales_price, purchase_price)
      VALUES (${ctx.orgId}::uuid, ${sku}, ${name}, 'inventory', ${salesPrice}, ${purchasePrice})
      ON CONFLICT DO NOTHING RETURNING id`) as Array<{ id: string }>;
    return { internalId: rows[0]?.id ?? null, wrote: Boolean(rows[0]) };
  }
};

/** Reference sink: chart_of_accounts / bank_accounts → accounts. */
function accountSink(forceType?: string): EntitySink {
  return {
    async write(ctx, input, dryRun) {
      const d = input.data;
      const name = str(d.account_name ?? d.name ?? d.Name) ?? "Unnamed account";
      const accountType = forceType ?? str(d.account_type ?? d.account_type_formatted) ?? "expense";
      const code = str(d.account_code ?? d.code);
      if (dryRun) return { internalId: input.internalId ?? null, wrote: false };

      if (input.internalId) {
        await ctx.prisma.$executeRaw`
          UPDATE accounts SET name = ${name}, code = COALESCE(${code}, code), updated_at = now()
          WHERE id = ${input.internalId}::uuid AND org_id = ${ctx.orgId}::uuid`;
        return { internalId: input.internalId, wrote: true };
      }
      const rows = (await ctx.prisma.$queryRaw`
        INSERT INTO accounts (org_id, name, account_type, code)
        VALUES (${ctx.orgId}::uuid, ${name}, ${accountType}, ${code})
        RETURNING id`) as Array<{ id: string }>;
      return { internalId: rows[0]?.id ?? null, wrote: Boolean(rows[0]) };
    }
  };
}

/** Reference sink: taxes → tax_rates. */
const taxSink: EntitySink = {
  async write(ctx, input, dryRun) {
    const d = input.data;
    const name = str(d.tax_name ?? d.name ?? d.Name) ?? "Tax";
    const rate = Number(d.tax_percentage ?? d.rate ?? d.RateOfTaxCalculation ?? 0) || 0;
    const taxType = str(d.tax_type ?? d.tax_specification) ?? "GST";
    if (dryRun) return { internalId: input.internalId ?? null, wrote: false };

    if (input.internalId) {
      await ctx.prisma.$executeRaw`
        UPDATE tax_rates SET name = ${name}, rate = ${rate}, updated_at = now()
        WHERE id = ${input.internalId}::uuid AND org_id = ${ctx.orgId}::uuid`;
      return { internalId: input.internalId, wrote: true };
    }
    const rows = (await ctx.prisma.$queryRaw`
      INSERT INTO tax_rates (org_id, name, rate, tax_type)
      VALUES (${ctx.orgId}::uuid, ${name}, ${rate}, ${taxType})
      RETURNING id`) as Array<{ id: string }>;
    return { internalId: rows[0]?.id ?? null, wrote: Boolean(rows[0]) };
  }
};

/** Reference sink: warehouses → warehouses. */
const warehouseSink: EntitySink = {
  async write(ctx, input, dryRun) {
    const d = input.data;
    const name = str(d.warehouse_name ?? d.name ?? d.Name) ?? "Warehouse";
    const code = str(d.code ?? d.warehouse_code) ?? name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 16);
    if (dryRun) return { internalId: input.internalId ?? null, wrote: false };

    if (input.internalId) {
      await ctx.prisma.$executeRaw`
        UPDATE warehouses SET name = ${name}, updated_at = now()
        WHERE id = ${input.internalId}::uuid AND org_id = ${ctx.orgId}::uuid`;
      return { internalId: input.internalId, wrote: true };
    }
    const rows = (await ctx.prisma.$queryRaw`
      INSERT INTO warehouses (org_id, name, code)
      VALUES (${ctx.orgId}::uuid, ${name}, ${code})
      ON CONFLICT DO NOTHING RETURNING id`) as Array<{ id: string }>;
    return { internalId: rows[0]?.id ?? null, wrote: Boolean(rows[0]) };
  }
};

const SINKS = new Map<EntityType, EntitySink>([
  ["customers", contactSink("customer")],
  ["vendors", contactSink("vendor")],
  ["products", itemSink],
  ["services", itemSink],
  ["inventory", itemSink],
  ["chart_of_accounts", accountSink()],
  ["bank_accounts", accountSink("bank")],
  ["taxes", taxSink],
  ["warehouses", warehouseSink]
]);

export function getSink(entity: EntityType): EntitySink {
  return SINKS.get(entity) ?? defaultSink;
}

export function registerSink(entity: EntityType, sink: EntitySink): void {
  SINKS.set(entity, sink);
}
