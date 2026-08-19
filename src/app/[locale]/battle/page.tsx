import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import BattleBoardClient from "@/components/BattleBoardClient";
import BattleRecordsClient from "@/components/BattleRecordsClient";
import OverdriveExchangeClient from "@/components/OverdriveExchangeClient";
import PlayerRankingsClient from "@/components/PlayerRankingsClient";
import ScoreboardClient from "@/components/ScoreboardClient";

type SearchParams = { [key: string]: string | string[] | undefined };
type OverdriveTab = "challenges" | "rankings" | "records" | "scoreboard" | "exchange";

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveTab(searchParams: SearchParams): OverdriveTab {
  const rawTab = firstValue(searchParams.tab);
  if (
    rawTab === "rankings" ||
    rawTab === "records" ||
    rawTab === "scoreboard" ||
    rawTab === "exchange"
  ) {
    return rawTab;
  }
  if (firstValue(searchParams.c)) return "scoreboard";
  return "challenges";
}

function overdriveHref(locale: Locale, tab: OverdriveTab, searchParams: SearchParams): string {
  const params = new URLSearchParams();
  if (tab !== "challenges") params.set("tab", tab);
  if (tab === "scoreboard") {
    const challengeId = firstValue(searchParams.c);
    if (challengeId) params.set("c", challengeId);
  }
  const query = params.toString();
  return `/${locale}/battle${query ? `?${query}` : ""}`;
}

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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);
  const sp = await searchParams;
  const tab = resolveTab(sp);
  const tabs: { key: OverdriveTab; label: string }[] = [
    { key: "challenges", label: dict.battle.navChallenges },
    { key: "rankings", label: dict.battle.navRankings },
    { key: "records", label: dict.battle.navRecords },
    { key: "scoreboard", label: dict.battle.navScoreboard },
    { key: "exchange", label: dict.battle.navExchange },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-wide">{dict.battle.title}</h1>
        <p className="mt-2 text-sm text-ink-dim">{dict.battle.subtitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">{dict.battle.bio}</p>
      </div>

      <div className="mb-8 flex gap-1 overflow-x-auto border-b border-edge">
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={overdriveHref(locale, item.key, sp)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-display text-sm font-bold tracking-wide transition ${
              tab === item.key
                ? "border-accent text-accent"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "rankings" ? (
        <PlayerRankingsClient locale={locale} dict={dict} limit={50} />
      ) : tab === "records" ? (
        <div className="mx-auto max-w-4xl">
          <BattleRecordsClient locale={locale} dict={dict} />
        </div>
      ) : tab === "scoreboard" ? (
        <Suspense fallback={null}>
          <ScoreboardClient locale={locale} dict={dict} />
        </Suspense>
      ) : tab === "exchange" ? (
        <OverdriveExchangeClient locale={locale} dict={dict} />
      ) : (
        <BattleBoardClient locale={locale} dict={dict} />
      )}
    </div>
  );
}
