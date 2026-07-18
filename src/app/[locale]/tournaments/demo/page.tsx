import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale } from "@/i18n";
import TournamentDemoClient from "@/components/TournamentDemoClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDict(locale).tournaments.title };
}

export default async function TournamentDemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <TournamentDemoClient locale={locale} />
    </div>
  );
}
