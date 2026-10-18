import { describe, expect, it } from "vitest";
import { codeSchema, emailSchema, displayNameSchema, passwordSchema, signUpSchema, verifySchema } from "./schemas";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe("email", () => {
  it("is trimmed and lower-cased, as the backend matches it", () => {
    expect(emailSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("must look like an address and fit in 320 characters", () => {
    for (const bad of ["", "   ", "ada", "ada@", "@example.com", "a b@example.com", "ada@@example.com"]) {
      expect(emailSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(emailSchema.safeParse(`${"a".repeat(310)}@example.com`).success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(300)}@example.com`).success).toBe(true);
  });
});

describe("display name", () => {
  it("is trimmed and needs 1 to 100 characters, counting an emoji as one", () => {
    expect(displayNameSchema.parse("  Ada Lovelace ")).toBe("Ada Lovelace");
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(displayNameSchema.safeParse("a".repeat(100)).success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(101)).success).toBe(false);
    expect(displayNameSchema.safeParse("😀".repeat(100)).success).toBe(true);
    expect(displayNameSchema.safeParse("😀".repeat(101)).success).toBe(false);
  });

  it("refuses NUL characters the database cannot store", () => {
    expect(displayNameSchema.safeParse("Ada\u0000").success).toBe(false);
  });
});

describe("password", () => {
  it("needs 8 to 72 characters", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  it("also fits in 72 bytes, because BCrypt stops reading there", () => {
    expect(passwordSchema.safeParse("é".repeat(36)).success).toBe(true); // 72 bytes
    const tooManyBytes = passwordSchema.safeParse("é".repeat(37)); // 37 characters but 74 bytes
    expect(tooManyBytes.success).toBe(false);
    expect(messages(tooManyBytes)[0]).toMatch(/72 bytes/);
  });

  it("is not trimmed: spaces are part of a password", () => {
    expect(passwordSchema.parse("  secret  ")).toBe("  secret  ");
  });

  it("says what is wrong in plain words", () => {
    expect(messages(passwordSchema.safeParse("short"))[0]).toBe("Use at least 8 characters.");
    expect(messages(passwordSchema.safeParse("a".repeat(80)))[0]).toBe("Use at most 72 characters.");
  });
});

describe("verification code", () => {
  it("is exactly six digits, ignoring spaces around it", () => {
    expect(codeSchema.parse(" 123456 ")).toBe("123456");
    for (const bad of ["", "12345", "1234567", "12345a", "12 456", "١٢٣٤٥٦"]) {
      expect(codeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("forms", () => {
  it("sign-up reports every broken field at once", () => {
    const result = signUpSchema.safeParse({ email: "nope", displayName: "", password: "short" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["email", "displayName", "password"]));
  });

  it("verify needs an address and a code", () => {
    expect(verifySchema.safeParse({ email: "ada@example.com", code: "123456" }).success).toBe(true);
    expect(verifySchema.safeParse({ email: "ada@example.com", code: "12" }).success).toBe(false);
  });
});
