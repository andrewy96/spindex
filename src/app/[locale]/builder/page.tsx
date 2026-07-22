import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import BuilderClient from "@/components/BuilderClient";
import ComboRankingsPanel from "@/components/ComboRankingsPanel";

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
  return { title: dict.builder.title, description: dict.builder.subtitle };
}

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);
  const sp = await searchParams;
  const tab = sp.tab === "rankings" ? "rankings" : "builder";

  const tabs = [
    { key: "builder", label: dict.nav.builder },
    { key: "rankings", label: dict.nav.rankings },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-wide">{dict.builder.title}</h1>
      <p className="mb-6 mt-1 text-sm text-ink-dim">{dict.builder.subtitle}</p>

      <div className="mb-8 flex gap-1 border-b border-edge">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "builder" ? `/${locale}/builder` : `/${locale}/builder?tab=rankings`}
            className={`-mb-px border-b-2 px-4 py-2 font-display text-sm font-bold tracking-wide transition ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "rankings" ? (
        <ComboRankingsPanel locale={locale} dict={dict} />
      ) : (
        <Suspense fallback={null}>
          <BuilderClient locale={locale} dict={dict} />
        </Suspense>
      )}
    </div>
  );
}
