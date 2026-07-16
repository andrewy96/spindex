import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminClient from "@/components/AdminClient";
import { getDict, isLocale, Locale, locales } from "@/i18n";

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
  return { title: getDict(locale).admin.title };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-wide">{dict.admin.title}</h1>
        <p className="mt-1 text-sm text-ink-dim">{dict.admin.subtitle}</p>
      </div>
      <AdminClient locale={locale} dict={dict} />
    </div>
  );
}
