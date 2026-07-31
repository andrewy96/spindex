import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/lib/auth";
import { getDict, isLocale, locales, Locale } from "@/i18n";
import { SITE_URL } from "@/lib/siteUrl";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDict(locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${dict.site.name} — ${dict.site.tagline}`,
      template: `%s — ${dict.site.name}`,
    },
    description: dict.site.description,
    openGraph: {
      title: `${dict.site.name} — ${dict.site.tagline}`,
      description: dict.site.description,
      siteName: dict.site.name,
      locale: locale === "zh" ? "zh_CN" : "en_MY",
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDict(locale as Locale);

  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <Nav locale={locale as Locale} dict={dict} />
        <main className="flex-1">{children}</main>
        <Footer dict={dict} />
      </div>
    </AuthProvider>
  );
}
