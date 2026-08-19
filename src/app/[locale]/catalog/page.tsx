import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import { blades, ratchets, bits, assists, lockChips } from "@/data/parts";
import CatalogClient from "@/components/CatalogClient";
import BuilderClient from "@/components/BuilderClient";
import ComboRankingsPanel from "@/components/ComboRankingsPanel";

type SearchParams = { [key: string]: string | string[] | undefined };
type WorkspaceTab = "catalog" | "builder" | "rankings" | "rpmTester";

const BUILDER_QUERY_KEYS = ["b", "l", "r", "t", "a", "ob", "ol", "or", "ot", "oa"] as const;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveTab(searchParams: SearchParams): WorkspaceTab {
  const rawTab = firstValue(searchParams.tab);
  if (rawTab === "builder" || rawTab === "rankings") return rawTab;
  return BUILDER_QUERY_KEYS.some((key) => firstValue(searchParams[key])) ? "builder" : "catalog";
}

function workspaceHref(locale: Locale, tab: WorkspaceTab, searchParams: SearchParams): string {
  if (tab === "rpmTester") return `/${locale}/catalog/rpm-tester`;

  const params = new URLSearchParams();
  if (tab !== "catalog") params.set("tab", tab);

  if (tab === "builder") {
    for (const key of BUILDER_QUERY_KEYS) {
      const value = firstValue(searchParams[key]);
      if (value) params.set(key, value);
    }
  }

  const query = params.toString();
  return `/${locale}/catalog${query ? `?${query}` : ""}`;
}

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
  return { title: getDict(locale).catalog.title };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);
  const sp = await searchParams;
  const tab = resolveTab(sp);
  const total = blades.length + lockChips.length + ratchets.length + bits.length + assists.length;

  const tabs: { key: WorkspaceTab; label: string }[] = [
    { key: "catalog", label: dict.nav.catalog },
    { key: "builder", label: dict.nav.builder },
    { key: "rankings", label: dict.nav.rankings },
    { key: "rpmTester", label: "Balancing RPM Tester" },
  ];

  const title =
    tab === "builder"
      ? dict.builder.title
      : tab === "rankings"
        ? dict.rankings.comboTitle
        : dict.catalog.title;
  const subtitle =
    tab === "builder" ? (
      dict.builder.subtitle
    ) : tab === "rankings" ? (
      dict.rankings.comboSubtitle
    ) : (
      <>
        <span className="font-display font-bold text-accent">{total}</span>{" "}
        {dict.catalog.subtitle}
      </>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-wide">
        {title}
      </h1>
      <p className="mb-6 mt-1 text-sm text-ink-dim">{subtitle}</p>

      <div className="mb-8 flex flex-wrap gap-1 border-b border-edge">
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={workspaceHref(locale, item.key, sp)}
            className={`-mb-px border-b-2 px-4 py-2 font-display text-sm font-bold tracking-wide transition ${
              tab === item.key
                ? "border-accent text-accent"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === "builder" ? (
        <Suspense fallback={null}>
          <BuilderClient locale={locale} dict={dict} />
        </Suspense>
      ) : tab === "rankings" ? (
        <ComboRankingsPanel locale={locale} dict={dict} />
      ) : (
        <CatalogClient locale={locale} dict={dict} />
      )}
    </div>
  );
}
