import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BeyliveHubClient from "@/components/BeyliveHubClient";
import { isLocale, Locale, locales } from "@/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "BEYLIVE",
  description: "Live SPINDEX tournament scoring, player IDs, and scoreboards.",
};

export default async function BeylivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="font-display text-xs font-bold tracking-[0.28em] text-accent">SPINDEX LIVE TOURNAMENTS</div>
      <h1 className="mt-2 font-display text-3xl font-black tracking-wide">BEYLIVE</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Live tournament brackets, player IDs, phone scoring, and public score displays.
      </p>
      <BeyliveHubClient locale={locale} />
    </div>
  );
}
