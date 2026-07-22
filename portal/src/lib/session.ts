import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";
import type { StoreRole } from "@/generated/prisma/client";

const COOKIE_NAME = "xcall_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export type SessionKind = "ADMIN" | "STORE";

export type SessionPayload = {
  kind: SessionKind;
  userId: string; // Admin.id or StoreUser.id
  phone: string;
  storeId?: string; // present when kind === "STORE"
  storeRole?: StoreRole; // OWNER | EMPLOYEE, when kind === "STORE"
};

function secretKey() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.phone !== "string" ||
      (payload.kind !== "ADMIN" && payload.kind !== "STORE")
    ) {
      return null;
    }
    if (payload.kind === "STORE" && typeof payload.storeId !== "string") {
      return null;
    }
    return {
      kind: payload.kind,
      userId: payload.userId,
      phone: payload.phone,
      storeId: typeof payload.storeId === "string" ? payload.storeId : undefined,
      storeRole:
        payload.storeRole === "OWNER" || payload.storeRole === "EMPLOYEE"
          ? (payload.storeRole as StoreRole)
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
