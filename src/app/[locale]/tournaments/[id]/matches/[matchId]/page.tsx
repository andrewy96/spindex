import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BeyliveMatchClient from "@/components/BeyliveMatchClient";
import { isLocale, Locale } from "@/i18n";

export const metadata: Metadata = {
  title: "BEYLIVE Scoreboard",
  description: "Phone scoring screen for a BEYLIVE match.",
};

export default async function BeyliveMatchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; matchId: string }>;
}) {
  const { locale: raw, id, matchId } = await params;
  if (!isLocale(raw)) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <BeyliveMatchClient tournamentId={id} matchId={matchId} locale={raw as Locale} />
    </div>
  );
}
