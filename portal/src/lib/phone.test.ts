import { describe, expect, it } from "vitest";
import { maskPhone, normalizeBdPhone } from "./phone";

describe("normalizeBdPhone", () => {
  it("normalizes local 01XXXXXXXXX to E.164", () => {
    expect(normalizeBdPhone("01883030280")).toBe("+8801883030280");
  });

  it("normalizes 880XXXXXXXXXX", () => {
    expect(normalizeBdPhone("8801883030280")).toBe("+8801883030280");
  });

  it("normalizes +880XXXXXXXXXX", () => {
    expect(normalizeBdPhone("+8801883030280")).toBe("+8801883030280");
  });

  it("normalizes bare 1XXXXXXXXX (10 digits)", () => {
    expect(normalizeBdPhone("1883030280")).toBe("+8801883030280");
  });

  it("strips spaces, dashes and parentheses", () => {
    expect(normalizeBdPhone(" 018-8303 0280 ")).toBe("+8801883030280");
    expect(normalizeBdPhone("(018)83030280")).toBe("+8801883030280");
  });

  it("rejects empty / whitespace", () => {
    expect(normalizeBdPhone("")).toBeNull();
    expect(normalizeBdPhone("   ")).toBeNull();
  });

  it("rejects too-short numbers", () => {
    expect(normalizeBdPhone("0188303")).toBeNull();
  });

  it("rejects too-long numbers", () => {
    expect(normalizeBdPhone("018830302809999")).toBeNull();
  });

  it("rejects local numbers not starting 01", () => {
    expect(normalizeBdPhone("02883030280")).toBeNull();
  });

  it("rejects non-numeric junk", () => {
    expect(normalizeBdPhone("hello")).toBeNull();
  });

  it("is idempotent on already-normalized input", () => {
    const once = normalizeBdPhone("01883030280");
    expect(normalizeBdPhone(once!)).toBe(once);
  });
});

describe("maskPhone", () => {
  it("masks the middle of a phone number", () => {
    expect(maskPhone("+8801883030280")).toBe("+880****280");
  });

  it("returns short strings unchanged", () => {
    expect(maskPhone("12345")).toBe("12345");
  });
});
