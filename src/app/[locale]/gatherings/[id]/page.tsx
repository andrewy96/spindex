import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale } from "@/i18n";
import GatheringDetailClient from "@/components/GatheringDetailClient";
import { loadGatheringPreview, previewFee, previewWhen } from "@/lib/gatheringPreview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDict(locale);
  const gathering = await loadGatheringPreview(id);
  if (!gathering) return { title: dict.gatherings.title };

  // What someone needs to decide whether to come, in the order they'd ask it.
  const description = [
    previewWhen(gathering.gather_at, locale),
    `${gathering.venue}, ${gathering.city}`,
    previewFee(gathering, dict.gatherings.free),
    gathering.capacity ? `${gathering.capacity} ${dict.gatherings.capacity.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: gathering.title,
    description,
    openGraph: {
      title: gathering.title,
      description,
      type: "article",
      url: `/${locale}/gatherings/${id}`,
    },
    twitter: { card: "summary_large_image", title: gathering.title, description },
  };
}

export default async function GatheringDetailPage({
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
      <GatheringDetailClient id={id} locale={locale} dict={dict} />
    </div>
  );
}
