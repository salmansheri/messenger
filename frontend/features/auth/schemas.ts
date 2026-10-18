import { z } from "zod";

/** Mirrors the backend's rules for these fields, so a mistake is caught before the request is sent. */

const codePoints = (value: string) => [...value].length;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .regex(/^[^\s@]+@[^\s@]+$/, "Enter a valid email address, like ada@example.com.")
  .max(320, "Use at most 320 characters.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter the name others will see.")
  .refine((name) => codePoints(name) <= 100, "Use at most 100 characters.")
  .refine((name) => !name.includes("\u0000"), "Remove the special character from your name.");

/** BCrypt reads 72 bytes, so a password is limited both in characters and in UTF-8 bytes. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "Use at most 72 bytes; some characters count as more than one.",
  );

export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

export const signUpSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});
export type SignUpValues = z.input<typeof signUpSchema>;

export const verifySchema = z.object({ email: emailSchema, code: codeSchema });
export type VerifyValues = z.input<typeof verifySchema>;
