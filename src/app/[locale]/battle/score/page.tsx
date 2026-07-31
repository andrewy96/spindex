import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import ScoreboardClient from "@/components/ScoreboardClient";

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
  return { title: dict.battle.scoreboard, description: dict.battle.scoreboardSub };
}

export default async function ScorePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
      <h1 className="text-center font-display text-2xl font-bold tracking-wide sm:text-3xl">
        {dict.battle.scoreboard}
      </h1>
      <p className="mb-5 mt-1 text-center text-xs text-ink-dim sm:mb-8 sm:text-sm">
        {dict.battle.scoreboardSub}
      </p>
      <Suspense fallback={null}>
        <ScoreboardClient locale={locale} dict={dict} />
      </Suspense>
    </div>
  );
}
