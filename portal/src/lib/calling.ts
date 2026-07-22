import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";
import { selxTenantGet, type SelxBalance } from "./selx";

/** Error carrying an HTTP status; surfaced by handleRouteError. */
export class CallingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Server-side: fetch a store's live minute balance from the call backend.
 * The bearer token never leaves the server — only the resulting balance does.
 */
export async function getStoreCallBalance(storeId: string): Promise<SelxBalance> {
  const cred = await prisma.selxCredential.findUnique({ where: { storeId } });
  if (!cred?.bearerTokenEnc) {
    throw new CallingError("No calling account yet. Buy a package first.", 404);
  }

  let token: string;
  try {
    token = decryptSecret(cred.bearerTokenEnc);
  } catch {
    throw new CallingError("Calling account not ready yet.", 409);
  }
  if (!token) throw new CallingError("Calling account not ready yet.", 409);

  return selxTenantGet<SelxBalance>("/v1/balance", token, cred.selxUserId);
}

/**
 * Enforcement point for call initiation: throws (402) if the store has no
 * minutes left. The softphone credential / call-start endpoint will call this
 * before letting an employee place a call, so the package limit is enforced
 * server-side and not just displayed.
 */
export async function assertStoreHasMinutes(storeId: string): Promise<SelxBalance> {
  const balance = await getStoreCallBalance(storeId);
  if (!balance || balance.balance_seconds <= 0) {
    throw new CallingError(
      "No calling minutes remaining. Buy a package to continue.",
      402,
    );
  }
  return balance;
}
