/**
 * Malaysian mobile number helpers.
 * Accepts "012-3456789", "0123456789", "60123456789", "+60123456789"
 * and normalizes to E.164: +60123456789.
 */
export function normalizeMyPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  let rest: string;
  if (digits.startsWith("60")) rest = digits.slice(2);
  else if (digits.startsWith("0")) rest = digits.slice(1);
  else rest = digits;
  // Malaysian mobiles: 1X-XXXXXXX(X) → 9–10 digits starting with 1
  if (!/^1\d{8,9}$/.test(rest)) return null;
  return `+60${rest}`;
}

/** Accepts "+60123456789" and the bare "60123456789" that GoTrue stores. */
export function displayMyPhone(e164: string): string {
  const m = /^\+?60(1\d{8,9})$/.exec(e164);
  if (!m) return e164;
  const d = m[1];
  return `0${d.slice(0, 2)}-${d.slice(2)}`;
}
