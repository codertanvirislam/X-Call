import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";

function createAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const parsed = new URL(url.replace(/^mysql:\/\//, "http://"));
  const database = parsed.pathname.replace(/^\//, "").split("?")[0];
  const sslMode = parsed.searchParams.get("ssl-mode") || parsed.searchParams.get("sslmode");
  const wantsSsl =
    sslMode?.toUpperCase() === "REQUIRED" ||
    parsed.searchParams.get("ssl") === "true" ||
    parsed.port === "25060";

  return new PrismaMariaDb({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: 5,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

const prisma = new PrismaClient({ adapter: createAdapter() });

async function main() {
  const packages = [
    {
      code: "HUMAN_STARTER",
      name: "Human Calling Starter",
      description: "Agent-mediated click-to-call minutes for your team.",
      serviceType: "HUMAN" as const,
      priceBdt: 2000,
      minutes: 500,
      validityDays: 30,
      features: "transfer,recording",
      sortOrder: 1,
    },
    {
      code: "HUMAN_PRO",
      name: "Human Calling Pro",
      description: "More minutes for live agent calling.",
      serviceType: "HUMAN" as const,
      priceBdt: 5000,
      minutes: 1500,
      validityDays: 30,
      features: "transfer,recording,multi_extension",
      sortOrder: 2,
    },
    {
      code: "AI_BASIC",
      name: "AI Auto Call Basic",
      description: "Outbound IVR / workflow auto calling minutes.",
      serviceType: "AI" as const,
      priceBdt: 3500,
      minutes: 1000,
      validityDays: 30,
      features: "workflows",
      sortOrder: 3,
    },
    {
      code: "AI_BLAST",
      name: "AI Auto Call + Blast",
      description: "AI workflow calling with bulk blast enabled.",
      serviceType: "AI" as const,
      priceBdt: 8000,
      minutes: 3000,
      validityDays: 30,
      features: "workflows,call_blast,recording",
      sortOrder: 4,
    },
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { code: pkg.code },
      create: pkg,
      update: {
        name: pkg.name,
        description: pkg.description,
        serviceType: pkg.serviceType,
        priceBdt: pkg.priceBdt,
        minutes: pkg.minutes,
        validityDays: pkg.validityDays,
        features: pkg.features,
        sortOrder: pkg.sortOrder,
        isActive: true,
      },
    });
  }

  const adminPhone = process.env.ADMIN_PHONE;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Portal Admin";

  if (adminPhone && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.admin.upsert({
      where: { phone: adminPhone },
      create: {
        phone: adminPhone,
        name: adminName,
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
      update: {
        name: adminName,
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
    });
    console.log(`Admin ready: ${adminPhone}`);
  } else {
    console.log("ADMIN_PHONE / ADMIN_PASSWORD not set — skipped admin seed");
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
