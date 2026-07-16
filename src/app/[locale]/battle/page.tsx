import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import BattleBoardClient from "@/components/BattleBoardClient";

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
  return { title: dict.battle.title, description: dict.battle.subtitle };
}

export default async function BattlePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-wide">{dict.battle.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${locale}/battle/records`}
            className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:border-accent/60"
          >
            {dict.battle.records}
          </Link>
          <Link
            href={`/${locale}/battle/score`}
            className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60"
          >
            🧮 {dict.battle.scoreboard}
          </Link>
        </div>
      </div>
      <p className="mb-8 text-sm text-ink-dim">{dict.battle.subtitle}</p>
      <BattleBoardClient locale={locale} dict={dict} />
    </div>
  );
}
