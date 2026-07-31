import { NextResponse } from "next/server";
import { locales } from "@/i18n";

/**
 * Short share link: /g/<id> -> /<locale>/gatherings/<id>.
 * Locale comes from the browser so a shared link opens in the reader's language.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accepts = request.headers.get("accept-language") ?? "";
  const locale = accepts.toLowerCase().startsWith("zh") ? "zh" : "en";
  const target = locales.includes(locale as (typeof locales)[number]) ? locale : "en";
  return NextResponse.redirect(new URL(`/${target}/gatherings/${id}`, request.url), 307);
}
