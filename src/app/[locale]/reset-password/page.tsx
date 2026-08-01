import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import { ResetPasswordForm } from "@/components/AuthForms";

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
  return { title: getDict(locale).auth.resetTitle, robots: { index: false } };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-center font-display text-3xl font-bold tracking-wide">
        {dict.auth.resetTitle}
      </h1>
      <ResetPasswordForm locale={locale} dict={dict} />
    </div>
  );
}
