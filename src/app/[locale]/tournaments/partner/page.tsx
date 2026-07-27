import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale } from "@/i18n";
import PartnerBattleClient from "@/components/PartnerBattleClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: `${getDict(locale).tournaments.title} · Partner Battle`,
    description: "OTG Penang Open Bey Partner Cup — random-partner Swiss, top 2 to the final.",
  };
}

export default async function PartnerBattlePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PartnerBattleClient locale={locale} />
    </div>
  );
}
