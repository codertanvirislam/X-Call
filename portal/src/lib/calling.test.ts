import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB and the backend API; keep real crypto so the token round-trips.
vi.mock("./prisma", () => ({
  prisma: { selxCredential: { findUnique: vi.fn() } },
}));
vi.mock("./selx", () => ({ selxTenantGet: vi.fn() }));

import { prisma } from "./prisma";
import { selxTenantGet } from "./selx";
import { encryptSecret } from "./crypto";
import { assertStoreHasMinutes, CallingError, getStoreCallBalance } from "./calling";

const findUnique = prisma.selxCredential.findUnique as unknown as ReturnType<typeof vi.fn>;
const tenantGet = selxTenantGet as unknown as ReturnType<typeof vi.fn>;

function credWithToken() {
  return { selxUserId: 42, bearerTokenEnc: encryptSecret("live-token") };
}

beforeEach(() => {
  findUnique.mockReset();
  tenantGet.mockReset();
});

describe("getStoreCallBalance", () => {
  it("throws 404 when the store has no calling account", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getStoreCallBalance("store_1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when the credential row exists but has no token yet", async () => {
    findUnique.mockResolvedValue({ selxUserId: 42, bearerTokenEnc: "" });
    await expect(getStoreCallBalance("store_1")).rejects.toBeInstanceOf(CallingError);
  });

  it("returns the live balance using the decrypted token", async () => {
    findUnique.mockResolvedValue(credWithToken());
    tenantGet.mockResolvedValue({ user_id: 42, balance_seconds: 600, balance_minutes: 10 });
    const balance = await getStoreCallBalance("store_1");
    expect(balance.balance_minutes).toBe(10);
    // The decrypted token — not the encrypted blob — is passed to the backend.
    expect(tenantGet).toHaveBeenCalledWith("/v1/balance", "live-token", 42);
  });
});

describe("assertStoreHasMinutes", () => {
  it("throws 402 when balance is zero", async () => {
    findUnique.mockResolvedValue(credWithToken());
    tenantGet.mockResolvedValue({ user_id: 42, balance_seconds: 0, balance_minutes: 0 });
    await expect(assertStoreHasMinutes("store_1")).rejects.toMatchObject({ status: 402 });
  });

  it("returns the balance when minutes remain", async () => {
    findUnique.mockResolvedValue(credWithToken());
    tenantGet.mockResolvedValue({ user_id: 42, balance_seconds: 120, balance_minutes: 2 });
    const balance = await assertStoreHasMinutes("store_1");
    expect(balance.balance_seconds).toBe(120);
  });
});
