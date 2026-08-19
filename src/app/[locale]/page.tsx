import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import {
  assists,
  bits,
  blades,
  canonicalBlades,
  lockChips,
  ratchets,
  tierRank,
} from "@/data/parts";
import { BladeCard } from "@/components/PartCard";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const HERO_IMAGE = "/home/spindex-green-hero.png";

const homeCopy = {
  eyebrow: "SPIN / CONNECT / GROW",
  title1: "SPIN",
  title2: "BUILDS",
  title3: "LEGENDS",
  deck: "MORE THAN BATTLES. A PLATFORM FOR EVERY BLADER.",
  subtitle:
    "SPINDEX brings the Beyblade X community closer through combo tools, live events, OverDrive points, and shared player records.",
  primaryCta: "Join the community",
  secondaryCta: "Build a combo",
  statParts: "Parts indexed",
  statTools: "Live tools",
  statPlatform: "Connected platform",
  guidanceTitle: "Where to start",
  guidanceSub: "Pick the workflow you need and jump straight into the tool.",
  featuredTitle: "Top-tier blades",
  featuredSub: "Start from strong blades, then tune the ratchet and bit in Combo Lab.",
  viewAll: "View all parts",
  finalTitle: "Ready for the next launch?",
  finalSub: "Build a setup, post a challenge, or follow the next live bracket from SPINDEX.",
  finalCta: "Open OverDrive",
};

function GuideCard({
  href,
  label,
  text,
  badge,
}: {
  href: string;
  label: string;
  text: string;
  badge: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-36 flex-col rounded-md border border-edge bg-panel/80 p-4 transition hover:-translate-y-1 hover:border-accent/70 hover:bg-accent/10"
    >
      <div className="font-display text-[10px] font-black uppercase text-accent-2">
        {badge}
      </div>
      <div className="mt-3 font-display text-base font-black uppercase text-ink group-hover:text-accent">
        {label}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">{text}</p>
    </Link>
  );
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

  const totalParts = blades.length + lockChips.length + ratchets.length + bits.length + assists.length;
  const numberFormat = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-MY");
  const stats = [
    { value: numberFormat.format(totalParts), label: homeCopy.statParts },
    { value: "4", label: homeCopy.statTools },
    { value: "1", label: homeCopy.statPlatform },
  ];

  const guideCards = [
    {
      href: `/${locale}/catalog?tab=builder`,
      label: "Combo Lab",
      text: "Build with blades, ratchets, bits, assist blades, and lock chips.",
      badge: "Build",
    },
    {
      href: `/${locale}/battle`,
      label: "OverDrive",
      text: "Post point challenges, score results, and climb the ranking.",
      badge: "Battle",
    },
    {
      href: `/${locale}/beylive`,
      label: "BEYLIVE",
      text: "Follow live, upcoming, and past tournament brackets.",
      badge: "Live",
    },
    {
      href: `/${locale}/tournaments`,
      label: "Tournaments",
      text: "Create events, manage walk-ins, and run table scoring.",
      badge: "Host",
    },
  ];

  return (
    <div className="bg-bg">
      <section className="relative isolate min-h-[calc(100svh-3.5rem)] overflow-hidden border-b border-edge bg-black">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-30 object-cover object-[66%_center] opacity-85 sm:origin-top-right sm:scale-[1.08] sm:object-contain sm:object-right sm:opacity-100 lg:scale-[1.14] xl:scale-[1.2]"
        />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,#030504_0%,rgba(3,5,4,0.96)_30%,rgba(3,5,4,0.62)_53%,rgba(3,5,4,0.1)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(3,5,4,0.08)_0%,rgba(3,5,4,0.02)_62%,#06080b_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg to-transparent" />

        <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-[1760px] flex-col justify-center px-6 py-12 sm:px-12 lg:py-14">
          <div className="max-w-xl">
            <div className="flex flex-wrap items-center gap-3 font-display text-xs font-black uppercase text-accent">
              <span className="inline-block size-2 rounded-full bg-accent shadow-[0_0_18px_rgba(0,229,143,0.9)]" />
              {homeCopy.eyebrow}
            </div>
            <h1 className="mt-6 font-display text-6xl font-black uppercase leading-[0.88] text-white sm:text-7xl lg:text-8xl">
              <span className="block drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)]">{homeCopy.title1}</span>
              <span className="text-glow block text-accent drop-shadow-[0_0_34px_rgba(0,229,143,0.55)]">
                {homeCopy.title2}
              </span>
              <span className="block drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)]">{homeCopy.title3}</span>
            </h1>
            <p className="mt-8 font-display text-sm font-black uppercase leading-relaxed text-white/90">
              {homeCopy.deck}
            </p>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-dim sm:text-lg">
              {homeCopy.subtitle}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/register`}
                className="clip-x bg-accent px-6 py-3 font-display text-sm font-black uppercase text-bg transition hover:-translate-y-0.5 hover:brightness-110"
              >
                {homeCopy.primaryCta}
              </Link>
              <Link
                href={`/${locale}/catalog?tab=builder`}
                className="clip-x border border-accent/45 bg-panel px-6 py-3 font-display text-sm font-black uppercase text-accent transition hover:-translate-y-0.5 hover:bg-accent/10"
              >
                {homeCopy.secondaryCta}
              </Link>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {stats.map((stat) => (
                <div key={stat.label} className="border-l border-white/30 pl-3">
                  <div className="font-display text-2xl font-black text-white">{stat.value}</div>
                  <div className="mt-1 text-xs leading-tight text-white/62">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-edge bg-panel/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 lg:grid-cols-[16rem_1fr]">
          <div>
            <h2 className="font-display text-2xl font-black uppercase text-ink">
              {homeCopy.guidanceTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">{homeCopy.guidanceSub}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {guideCards.map((card) => (
              <GuideCard key={card.href} {...card} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="font-display text-xs font-black uppercase text-accent">
              {homeCopy.featuredTitle}
            </div>
            <h2 className="mt-2 font-display text-3xl font-black uppercase text-ink">
              {dict.home.featuredTitle}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
              {homeCopy.featuredSub}
            </p>
          </div>
          <Link href={`/${locale}/catalog`} className="text-sm font-semibold text-accent hover:underline">
            {homeCopy.viewAll}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {featured.slice(0, 4).map((blade) => (
            <BladeCard key={blade.id} blade={blade} locale={locale} dict={dict} />
          ))}
        </div>
      </section>

      <section className="border-t border-edge bg-panel/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="relative overflow-hidden rounded-md border border-accent/30 bg-[#07100e] p-6 sm:p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                  "linear-gradient(115deg, rgba(0,229,143,0.16), transparent 42%), linear-gradient(90deg, transparent, rgba(56,217,255,0.08))",
              }}
            />
            <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_15rem] lg:items-center">
              <div>
                <h2 className="font-display text-3xl font-black uppercase text-ink sm:text-4xl">
                  {homeCopy.finalTitle}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-dim">{homeCopy.finalSub}</p>
              </div>
              <Link
                href={`/${locale}/battle`}
                className="clip-x justify-self-start bg-accent px-6 py-3 font-display text-sm font-black uppercase text-bg transition hover:brightness-110 lg:justify-self-end"
              >
                {homeCopy.finalCta}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
