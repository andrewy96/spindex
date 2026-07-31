/**
 * Feature flags read at build time.
 * Market is hidden in production until it is ready; it stays available in dev,
 * and can be switched on for a production build with NEXT_PUBLIC_SHOW_MARKET=true.
 */
export const MARKET_ENABLED =
  process.env.NEXT_PUBLIC_SHOW_MARKET === "true" || process.env.NODE_ENV !== "production";
