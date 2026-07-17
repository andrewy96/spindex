import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import { blades, canonicalBlades, ratchets, bits, assists, lockChips, tierRank } from "@/data/parts";
import { BladeCard } from "@/components/PartCard";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as Locale;
  const dict = getDict(locale);

  const featured = canonicalBlades()
    .filter((b) => b.image)
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))
    .slice(0, 8);

  const stats = [
    { n: blades.length, label: dict.home.statBlades },
    { n: lockChips.length, label: dict.home.statLockChips },
    { n: ratchets.length, label: dict.home.statRatchets },
    { n: bits.length, label: dict.home.statBits },
    { n: assists.length, label: dict.home.statAssists },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="bg-grid relative overflow-hidden border-b border-edge">
        <div
          className="pointer-events-none absolute -right-32 -top-32 size-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 size-[380px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent-2), transparent 70%)" }}
        />
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:py-28">
          <span className="animate-float-up rounded-full border border-accent/40 px-3 py-1 font-display text-[11px] tracking-[0.3em] text-accent">
            {dict.home.heroKicker}
          </span>
          <h1 className="animate-float-up font-display text-4xl font-black leading-tight tracking-wide sm:text-6xl">
            {dict.home.heroTitle1}
            <br />
            <span className="text-glow text-accent">{dict.home.heroTitle2}</span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-ink-dim sm:text-base">
            {dict.home.heroSubtitle}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={`/${locale}/builder`}
              className="clip-x bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
            >
              {dict.home.ctaBuilder} →
            </Link>
            <Link
              href={`/${locale}/catalog`}
              className="clip-x border border-edge bg-panel px-6 py-3 font-display text-sm font-bold tracking-wider text-ink transition hover:border-accent/60 hover:text-accent"
            >
              {dict.home.ctaCatalog}
            </Link>
          </div>

          <div className="mt-6 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label} className="panel px-4 py-3">
                <div className="font-display text-2xl font-bold text-accent">{s.n}</div>
                <div className="text-xs text-ink-dim">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide">
              {dict.home.featuredTitle}
            </h2>
            <p className="mt-1 text-sm text-ink-dim">{dict.home.featuredSub}</p>
          </div>
          <Link
            href={`/${locale}/catalog`}
            className="shrink-0 text-sm font-semibold text-accent hover:underline"
          >
            {dict.home.viewAll} →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {featured.map((b) => (
            <BladeCard key={b.id} blade={b} locale={locale} dict={dict} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-edge bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="mb-8 font-display text-2xl font-bold tracking-wide">
            {dict.home.howTitle}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { t: dict.home.how1Title, x: dict.home.how1Text, n: "01" },
              { t: dict.home.how2Title, x: dict.home.how2Text, n: "02" },
              { t: dict.home.how3Title, x: dict.home.how3Text, n: "03" },
            ].map((s) => (
              <div key={s.n} className="panel p-5">
                <div className="font-display text-3xl font-black text-edge">{s.n}</div>
                <div className="mt-2 font-semibold">{s.t}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{s.x}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compete & connect */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: `/${locale}/rankings`, t: dict.nav.rankings, x: dict.rankings.subtitle },
            { href: `/${locale}/tournaments`, t: dict.nav.tournaments, x: dict.tournaments.subtitle },
            { href: `/${locale}/clubs`, t: dict.nav.clubs, x: dict.clubs.subtitle },
            { href: `/${locale}/gatherings`, t: dict.nav.gatherings, x: dict.gatherings.subtitle },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="panel group p-5 transition hover:-translate-y-0.5 hover:border-accent/50"
            >
              <div className="font-display text-lg font-bold tracking-wide group-hover:text-accent">
                {card.t} →
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{card.x}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="border-t border-edge bg-panel/40">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="panel bg-grid mx-auto max-w-3xl p-8 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-accent/40 font-display text-2xl font-black text-accent text-glow">
              A
            </div>
            <h2 className="font-display text-2xl font-bold tracking-wide">
              {dict.about.title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink">{dict.about.p1}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">{dict.about.p2}</p>
            <p className="mt-4 font-display text-sm font-bold text-accent">{dict.about.sig}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
