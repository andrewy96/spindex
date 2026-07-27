import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BeyliveLiveClient from "@/components/BeyliveLiveClient";
import { isLocale, Locale } from "@/i18n";

export const metadata: Metadata = {
  title: "BEYLIVE Arena",
  description: "Live tournament score display.",
};

export default async function BeyliveLivePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <BeyliveLiveClient id={id} locale={raw as Locale} />
    </div>
  );
}
