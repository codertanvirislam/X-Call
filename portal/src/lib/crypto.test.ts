import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashOtp,
  randomOtp,
  safeEqual,
} from "./crypto";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const secret = "super-secret-bearer-token-12345";
    const enc = encryptSecret(secret);
    expect(enc).not.toBe(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws on an empty payload", () => {
    expect(() => decryptSecret("")).toThrow();
  });

  it("throws on a malformed payload", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow();
  });

  it("throws when the ciphertext is tampered with (auth tag mismatch)", () => {
    const enc = encryptSecret("hello");
    const [iv, tag, data] = enc.split(".");
    const tampered = `${iv}.${tag}.${data}AAAA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("hashOtp / safeEqual", () => {
  it("is deterministic for the same code", () => {
    expect(hashOtp("123456")).toBe(hashOtp("123456"));
  });

  it("differs for different codes", () => {
    expect(hashOtp("123456")).not.toBe(hashOtp("654321"));
  });

  it("safeEqual is true for identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("safeEqual is false for different strings", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("safeEqual is false for different lengths", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("randomOtp", () => {
  it("returns a 6-digit code by default", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("respects a custom length", () => {
    expect(randomOtp(4)).toMatch(/^\d{4}$/);
  });
});
