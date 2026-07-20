import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

type SelxCreateUserResult = {
  status: string;
  user_id: number;
  user_slug?: string;
};

async function partnerFetch(path: string, init?: RequestInit) {
  if (!env.selx.baseUrl || !env.selx.partnerApiKey) {
    throw new Error("Selx partner API is not configured");
  }

  const url = `${env.selx.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.selx.partnerApiKey,
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Selx API ${path} failed (${res.status}): ${typeof data === "object" ? JSON.stringify(data) : text}`,
    );
  }

  return data;
}

/** Create a reseller user. Credentials arrive later via partner webhook. */
export async function selxCreateUser(opts: {
  name: string;
  phoneNumber: string;
}): Promise<SelxCreateUserResult> {
  if (!env.selx.defaultBridgeNumber) {
    throw new Error("SELX_DEFAULT_BRIDGE_NUMBER is required for reseller user creation");
  }

  const qs = new URLSearchParams({
    is_paid: "true",
    is_verified: "true",
  });

  const data = (await partnerFetch(`/v1/partners/users?${qs.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      phone_number: opts.phoneNumber,
      bridge_number: env.selx.defaultBridgeNumber,
    }),
  })) as SelxCreateUserResult;

  return data;
}

export async function selxTopUpMinutes(selxUserId: number, minutes: number) {
  return partnerFetch(
    `/v1/partners/users/${selxUserId}/balance?is_paid=true`,
    {
      method: "POST",
      body: JSON.stringify({ minutes }),
    },
  );
}

export async function selxEnableFeature(selxUserId: number, feature: string) {
  return partnerFetch(
    `/v1/partners/users/${selxUserId}/features/${feature}?is_paid=true`,
    { method: "POST" },
  );
}

export async function selxRegenerateToken(selxUserId: number) {
  return partnerFetch(`/v1/partners/users/${selxUserId}/regenerate-token`, {
    method: "POST",
  });
}

/** Tenant API call using the customer's own token. */
export async function selxTenantGet<T>(
  path: string,
  token: string,
  userId: number,
): Promise<T> {
  if (!env.selx.baseUrl) {
    throw new Error("SELX_BASE_URL is not configured");
  }

  const res = await fetch(`${env.selx.baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-User-Id": String(userId),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Selx tenant ${path} failed (${res.status}): ${typeof data === "object" ? JSON.stringify(data) : text}`,
    );
  }

  return data as T;
}

export function verifySelxPartnerWebhook(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !env.selx.partnerWebhookSecret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  );

  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (Number.isNaN(age) || age > 300) return false;

  const expected = createHmac("sha256", env.selx.partnerWebhookSecret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type SelxBalance = {
  user_id: number;
  balance_seconds: number;
  balance_minutes: number;
};

export type SelxCall = {
  call_id: string;
  direction: string;
  to_number?: string;
  from_number?: string;
  status: string;
  started_at?: string;
  answered_at?: string;
  ended_at?: string;
  pressed_digit?: string | null;
};
