import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getSession, type SessionPayload } from "./session";
import type { Role } from "@/generated/prisma/client";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include letters and numbers";
  }
  return null;
}

export async function requireSession(roles?: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }
  if (roles && !roles.includes(session.role)) {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}

export async function requireUser() {
  const session = await requireSession(["USER", "ADMIN"]);
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new AuthError("Unauthorized", 401);
  return { session, user };
}

export async function requireAdmin() {
  const session = await requireSession(["ADMIN"]);
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.role !== "ADMIN") throw new AuthError("Forbidden", 403);
  return { session, user };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
