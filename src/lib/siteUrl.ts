/**
 * Absolute origin for share links and OG tags.
 * Chat apps refuse relative image URLs, so this has to resolve everywhere.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://spindexmy.vercel.app");
