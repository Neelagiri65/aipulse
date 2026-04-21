/**
 * email-address validation — pragmatic RFC5322 subset. Catches obvious
 * typos and upstream-garbage submissions without rejecting the 1% of
 * valid-but-odd addresses. Resend's siteverify will still reject
 * anything domain-invalid downstream.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

export type EmailValidationResult =
  | { valid: true; normalised: string }
  | { valid: false; reason: "empty" | "too-long" | "shape" };

export function validateEmail(raw: unknown): EmailValidationResult {
  if (typeof raw !== "string") return { valid: false, reason: "empty" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: false, reason: "empty" };
  if (trimmed.length > MAX_LENGTH) return { valid: false, reason: "too-long" };
  if (!EMAIL_RE.test(trimmed)) return { valid: false, reason: "shape" };
  return { valid: true, normalised: trimmed.toLowerCase() };
}
