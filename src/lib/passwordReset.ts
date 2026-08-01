/**
 * One-time codes a superadmin issues to a blader who has lost their password.
 *
 * The code is not a password and never becomes one. It only works on the reset
 * page, where the blader chooses their own password — so unlike handing over a
 * temporary password, there is no window where the account can be signed into
 * by whoever saw the code.
 */

/** Ambiguous glyphs left out — these get read aloud and typed on phones. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 2;
const GROUP_SIZE = 3;

/** Codes stay usable long enough for a host to relay one overnight. */
export const CODE_TTL_HOURS = 24;

/** Wrong guesses allowed before a code is burned. */
export const MAX_ATTEMPTS = 5;

export const CODE_LENGTH = GROUPS * GROUP_SIZE;

/**
 * Largest multiple of the alphabet that fits in a byte. Bytes at or above it
 * are thrown away rather than folded with %, which would quietly make the first
 * few letters more likely than the rest.
 */
const UNBIASED_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/**
 * e.g. "SPIN-4KQ-7MB" — two short groups, easy to dictate without mishearing.
 * Takes a byte source so it can draw again when a draw is rejected.
 */
export function generateResetCode(nextBytes: (count: number) => Uint8Array): string {
  const chars: string[] = [];
  while (chars.length < CODE_LENGTH) {
    for (const byte of nextBytes(CODE_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      chars.push(ALPHABET[byte % ALPHABET.length]);
      if (chars.length === CODE_LENGTH) break;
    }
  }
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(chars.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(""));
  }
  return `SPIN-${groups.join("-")}`;
}

/** Accepts what a blader actually types: any case, spaces or dashes anywhere. */
export function normalizeResetCode(input: string): string {
  const bare = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SPIN/, "");
  if (bare.length !== CODE_LENGTH) return "";
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(bare.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE));
  }
  return `SPIN-${groups.join("-")}`;
}

export type ResetStatus = "pending" | "issued" | "used" | "dismissed";

export interface ResetRequest {
  id: string;
  profile_id: string;
  status: ResetStatus;
  created_at: string;
  expires_at: string | null;
  handle: string;
  display_name: string;
  phone: string;
}

/**
 * Host WhatsApp number for the hand-off, digits only (e.g. 60123456789).
 * Without it the request page simply tells the blader to contact a host.
 */
export const HOST_WHATSAPP = process.env.NEXT_PUBLIC_HOST_WHATSAPP ?? "";
