import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import market from "@/data/market.json";
import MarketClient from "@/components/MarketClient";
import { MARKET_ENABLED } from "@/lib/features";

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
  return { title: dict.market.title, description: dict.market.subtitle };
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  // Hidden in production: the nav link is gone, so the URL should not resolve either.
  if (!MARKET_ENABLED) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-wide">{dict.market.title}</h1>
        <span className="rounded-full border border-accent/60 bg-accent/10 px-3 py-1 font-display text-xs font-bold tracking-[0.2em] text-accent">
          {dict.market.comingSoon}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-dim">{dict.market.subtitle}</p>

      {/* Coming-soon notice */}
      <div className="panel mt-6 mb-8 border-accent-2/40 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl">🚧</span>
          <div>
            <div className="font-semibold">{dict.market.noticeTitle}</div>
            <p className="mt-1 text-sm leading-relaxed text-ink-dim">{dict.market.noticeText}</p>
            <p className="mt-2 text-xs text-ink-dim">
              {dict.market.priceNote}{" "}
              <a
                href={market.source}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent-2 hover:underline"
              >
                {market.sourceName}
              </a>{" "}
              ({market.pricedAt}) ·{" "}
              <a
                href={market.source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-2 hover:underline"
              >
                {dict.market.visitSource} ↗
              </a>
            </p>
          </div>
        </div>
      </div>

      <MarketClient locale={locale} dict={dict} />
    </div>
  );
}
