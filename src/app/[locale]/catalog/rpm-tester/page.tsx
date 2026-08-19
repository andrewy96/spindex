import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BalancingRpmTesterClient from "@/components/BalancingRpmTesterClient";
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
  return { title: "Balancing RPM Tester" };
}

function ComboLabTabs({ locale, dict }: { locale: Locale; dict: ReturnType<typeof getDict> }) {
  const tabs = [
    { href: `/${locale}/catalog`, label: dict.nav.catalog, active: false },
    { href: `/${locale}/catalog?tab=builder`, label: dict.nav.builder, active: false },
    { href: `/${locale}/catalog?tab=rankings`, label: dict.nav.rankings, active: false },
    { href: `/${locale}/catalog/rpm-tester`, label: "Balancing RPM Tester", active: true },
  ];

  return (
    <div className="mb-8 flex flex-wrap gap-1 border-b border-edge">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 font-display text-sm font-bold transition ${
            tab.active
              ? "border-accent text-accent"
              : "border-transparent text-ink-dim hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export default async function RpmTesterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-display text-xs font-black uppercase text-accent">
            Combo Lab / Under Development
          </div>
          <h1 className="mt-2 font-display text-3xl font-black uppercase text-ink sm:text-4xl">
            Balancing RPM Tester
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-dim">
            A future Combo Lab tool for pairing a Bluetooth RPM tester, collecting spin data, and checking vibration
            balance before competition. Live sensor capture is still under development, so this page currently shows a
            demo dataset and diagnostic UI.
          </p>
        </div>
        <div className="clip-x border border-bal/60 bg-bal/10 px-4 py-2 font-display text-xs font-black uppercase text-bal">
          Bluetooth RPM intake in development
        </div>
      </div>

      <ComboLabTabs locale={locale} dict={dict} />
      <BalancingRpmTesterClient />
    </div>
  );
}
