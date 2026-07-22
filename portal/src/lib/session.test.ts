import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

describe("session token round-trip", () => {
  it("round-trips an ADMIN session", async () => {
    const token = await createSessionToken({
      kind: "ADMIN",
      userId: "admin_1",
      phone: "+8801883030280",
    });
    const payload = await verifySessionToken(token);
    expect(payload).toMatchObject({
      kind: "ADMIN",
      userId: "admin_1",
      phone: "+8801883030280",
    });
  });

  it("round-trips a STORE session with storeId and role", async () => {
    const token = await createSessionToken({
      kind: "STORE",
      userId: "su_1",
      phone: "+8801700000000",
      storeId: "store_1",
      storeRole: "OWNER",
    });
    const payload = await verifySessionToken(token);
    expect(payload).toMatchObject({
      kind: "STORE",
      userId: "su_1",
      storeId: "store_1",
      storeRole: "OWNER",
    });
  });

  it("rejects a STORE token that is missing storeId", async () => {
    // Build a token that looks like STORE but has no storeId.
    const token = await createSessionToken({
      kind: "STORE",
      userId: "su_1",
      phone: "+8801700000000",
    });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a garbage / tampered token", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
    const good = await createSessionToken({
      kind: "ADMIN",
      userId: "admin_1",
      phone: "+8801883030280",
    });
    expect(await verifySessionToken(good + "tamper")).toBeNull();
  });
});
