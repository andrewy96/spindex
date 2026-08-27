import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale } from "@/i18n";
import TournamentRegistrationClient from "@/components/TournamentRegistrationClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDict(locale);
  return { title: dict.tournaments.registrationTitle };
}

export default async function TournamentRegistrationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <TournamentRegistrationClient id={id} locale={locale} dict={dict} />
    </div>
  );
}
