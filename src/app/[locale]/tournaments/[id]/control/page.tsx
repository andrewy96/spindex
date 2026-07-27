import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BeyliveControlClient from "@/components/BeyliveControlClient";
import { isLocale, Locale } from "@/i18n";

export const metadata: Metadata = {
  title: "BEYLIVE Control",
  description: "Host and judge controls for BEYLIVE.",
};

export default async function BeyliveControlPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <BeyliveControlClient id={id} locale={raw as Locale} />
    </div>
  );
}
