import { NextResponse } from "next/server";
import { isLocale } from "@/i18n";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  url.pathname = `/${locale}/battle`;
  url.searchParams.set("tab", "rankings");

  return NextResponse.redirect(url);
}
