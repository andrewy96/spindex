export const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** Combining accents left behind by NFKD normalisation. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Turn a free-text blader name into a valid @handle.
 * Returns "" when nothing usable is left — the caller decides how to prompt.
 */
export function slugifyHandle(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  if (!base) return "";
  return base.length < 3 ? `${base}_my`.slice(0, 20) : base;
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}
