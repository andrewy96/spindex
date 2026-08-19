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
  const tab = url.searchParams.get("tab") === "rankings" ? "rankings" : "builder";
  url.pathname = `/${locale}/catalog`;
  url.searchParams.set("tab", tab);

  return NextResponse.redirect(url);
}
