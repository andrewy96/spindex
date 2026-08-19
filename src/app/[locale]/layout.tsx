import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/lib/auth";
import { getDict, isLocale, locales, Locale } from "@/i18n";
import { SITE_URL } from "@/lib/siteUrl";

const shareImage = "/brand/spindex-share-card.png";

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
  const title = `${dict.site.name} - ${dict.site.tagline}`;
  const description = dict.site.description;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${dict.site.name} — ${dict.site.tagline}`,
      template: `%s — ${dict.site.name}`,
    },
    description,
    openGraph: {
      title,
      description,
      siteName: dict.site.name,
      locale: locale === "zh" ? "zh_CN" : "en_MY",
      type: "website",
      images: [
        {
          url: shareImage,
          width: 1200,
          height: 630,
          alt: "SPINDEX Beyblade X platform",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [shareImage],
    },
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
