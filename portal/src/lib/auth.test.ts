import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "./auth";

describe("validatePassword", () => {
  it("accepts a valid password (>=8 chars, letters + numbers)", () => {
    expect(validatePassword("Admin12345")).toBeNull();
  });

  it("rejects passwords shorter than 8 chars", () => {
    expect(validatePassword("Ab1")).toMatch(/at least 8/);
  });

  it("rejects passwords with no digits", () => {
    expect(validatePassword("abcdefgh")).toMatch(/letters and numbers/);
  });

  it("rejects passwords with no letters", () => {
    expect(validatePassword("12345678")).toMatch(/letters and numbers/);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("Admin12345");
    expect(await verifyPassword("Admin12345", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Admin12345");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces distinct hashes for the same password (salted)", async () => {
    const a = await hashPassword("Admin12345");
    const b = await hashPassword("Admin12345");
    expect(a).not.toBe(b);
  });
});
