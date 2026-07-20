import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  // DigitalOcean / managed MySQL usually needs SSL.
  // Accept both mysql://... and prisma-style URLs.
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

function createPrismaClient() {
  return new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
