#!/usr/bin/env node
/**
 * One-off: insert the QuikConstruction App + OAuthClient rows in Neon.
 * Idempotent — upserts by slug / clientId.
 *
 * Required env:
 *   DATABASE_URL                  (Neon pooled)
 *   QUIKCONSTRUCTION_URL          (e.g. https://quikconstruction.vercel.app)
 *   QUIKCONSTRUCTION_SECRET_PLAIN (the plaintext secret Vercel has)
 *
 * Does NOT touch quikscale, admin, or quikit rows.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DB_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.QUIKCONSTRUCTION_URL;
const SECRET_PLAIN = process.env.QUIKCONSTRUCTION_SECRET_PLAIN;

if (!DB_URL || !BASE_URL || !SECRET_PLAIN) {
  console.error("Missing env: DATABASE_URL, QUIKCONSTRUCTION_URL, QUIKCONSTRUCTION_SECRET_PLAIN");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

async function main() {
  const cleanBaseUrl = BASE_URL.replace(/\/$/, "");

  const app = await prisma.app.upsert({
    where: { slug: "quikconstruction" },
    update: {
      name: "QuikConstruction",
      description: "Construction ERP — Projects, BOQ/DPR, Purchase, Store, Finance, HRMS, Safety, Quality.",
      baseUrl: cleanBaseUrl,
      status: "active",
    },
    create: {
      name: "QuikConstruction",
      slug: "quikconstruction",
      description: "Construction ERP — Projects, BOQ/DPR, Purchase, Store, Finance, HRMS, Safety, Quality.",
      baseUrl: cleanBaseUrl,
      status: "active",
    },
  });
  console.log(`✅ App: ${app.name} → ${app.baseUrl}`);

  const hashedSecret = await bcrypt.hash(SECRET_PLAIN, 12);
  const redirectUris = [`${cleanBaseUrl}/api/auth/callback/quikit`];

  const existing = await prisma.oAuthClient.findUnique({ where: { clientId: "quikconstruction" } });

  if (existing) {
    await prisma.oAuthClient.update({
      where: { clientId: "quikconstruction" },
      data: {
        clientSecret: hashedSecret,
        redirectUris,
        scopes: ["openid", "profile", "email", "tenant"],
      },
    });
    console.log(`✅ OAuthClient updated: quikconstruction`);
  } else {
    await prisma.oAuthClient.create({
      data: {
        appId: app.id,
        clientId: "quikconstruction",
        clientSecret: hashedSecret,
        redirectUris,
        scopes: ["openid", "profile", "email", "tenant"],
      },
    });
    console.log(`✅ OAuthClient created: quikconstruction`);
  }
  console.log(`   redirectUris: ${redirectUris.join(", ")}`);
  console.log(`✨ Done.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
