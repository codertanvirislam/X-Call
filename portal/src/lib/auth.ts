import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getSession, type SessionKind, type SessionPayload } from "./session";

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

export async function requireSession(kinds?: SessionKind[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }
  if (kinds && !kinds.includes(session.kind)) {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession(["ADMIN"]);
  const admin = await prisma.admin.findUnique({ where: { id: session.userId } });
  if (!admin) throw new AuthError("Forbidden", 403);
  return { session, admin };
}

/** Authenticated store person (owner or employee). Loads the StoreUser and its Store. */
export async function requireStore() {
  const session = await requireSession(["STORE"]);
  const storeUser = await prisma.storeUser.findUnique({
    where: { id: session.userId },
    include: { store: true },
  });
  if (!storeUser || storeUser.status === "DISABLED") {
    throw new AuthError("Unauthorized", 401);
  }
  return { session, storeUser, store: storeUser.store };
}

/** Store owner only — required to manage employees. */
export async function requireStoreOwner() {
  const ctx = await requireStore();
  if (ctx.storeUser.role !== "OWNER") {
    throw new AuthError("Only the store owner can do this", 403);
  }
  return ctx;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
