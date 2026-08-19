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
import PartImage from "@/components/PartImage";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const homeCopy = {
  eyebrow: "SPINDEX MALAYSIA",
  title: "Build better combos",
  titleAccent: "Battle live.",
  subtitle:
    "A competitive Beyblade X hub for combo building, OverDrive points, live brackets, tournament hosting, and community events.",
  primaryCta: "Build a combo",
  secondaryCta: "Watch BEYLIVE",
  tertiaryCta: "Explore events",
  comboTitle: "Featured combo",
  comboSubtitle: "Open any part to inspect details or tune the build.",
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

type ComboPart = {
  href: string;
  label: string;
  name: string;
  code: string;
  image: string | null;
  fallback: string;
  size: "large" | "medium";
};

function ComboLayer({ part, index }: { part: ComboPart; index: number }) {
  const imageSize =
    part.size === "large"
      ? "h-32 w-40 sm:h-40 sm:w-52"
      : "h-24 w-32 sm:h-28 sm:w-40";

  return (
    <Link
      href={part.href}
      className="group relative grid min-h-28 grid-cols-[8rem_1fr] items-center gap-4 rounded-md border border-accent/25 bg-[#071210]/85 p-3 transition hover:-translate-y-0.5 hover:border-accent hover:bg-accent/10 sm:grid-cols-[13rem_1fr] sm:p-4"
    >
      <div className="absolute left-3 top-3 font-display text-[10px] font-black uppercase text-accent-2/75">
        0{index + 1}
      </div>
      <div className={`${imageSize} justify-self-center pt-3`}>
        <PartImage
          src={part.image}
          alt={part.name}
          fallbackLabel={part.fallback}
          priority={index === 0}
          sizes={part.size === "large" ? "260px" : "200px"}
          className="transition duration-300 group-hover:scale-105"
        />
      </div>
      <div className="min-w-0">
        <div className="font-display text-[10px] font-black uppercase text-ink-dim">
          {part.label}
        </div>
        <div className="mt-2 truncate font-display text-base font-black text-ink group-hover:text-accent sm:text-xl">
          {part.name}
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-accent-2">{part.code}</div>
      </div>
    </Link>
  );
}

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
  const heroBlade = featured.find((blade) => blade.stockRatchet && blade.stockBit) ?? featured[0];
  const heroRatchet =
    (heroBlade?.stockRatchet
      ? ratchets.find((part) => part.id === heroBlade.stockRatchet && part.image)
      : undefined) ?? ratchets.find((part) => part.image);
  const heroBit =
    (heroBlade?.stockBit ? bits.find((part) => part.id === heroBlade.stockBit && part.image) : undefined) ??
    bits.find((part) => part.image);
  const heroAssist =
    (heroBlade?.stockAssist
      ? assists.find((part) => part.id === heroBlade.stockAssist && part.image)
      : undefined) ?? assists.find((part) => part.image);

  const comboParts: ComboPart[] = [];
  if (heroBlade) {
    comboParts.push({
      href: `/${locale}/parts/blade/${encodeURIComponent(heroBlade.id)}`,
      label: dict.part.blade,
      name: locale === "zh" ? heroBlade.zh : heroBlade.enFull,
      code: heroBlade.code,
      image: heroBlade.image,
      fallback: "X",
      size: "large",
    });
  }
  if (heroRatchet) {
    comboParts.push({
      href: `/${locale}/parts/ratchet/${encodeURIComponent(heroRatchet.id)}`,
      label: dict.part.ratchet,
      name: heroRatchet.id,
      code: heroRatchet.isMetal ? "Metal ratchet" : "Ratchet",
      image: heroRatchet.image,
      fallback: heroRatchet.id,
      size: "medium",
    });
  }
  if (heroBit) {
    comboParts.push({
      href: `/${locale}/parts/bit/${encodeURIComponent(heroBit.id)}`,
      label: dict.part.bit,
      name: heroBit.name ? `${heroBit.id} ${heroBit.name}` : heroBit.id,
      code: "Performance bit",
      image: heroBit.image,
      fallback: heroBit.id,
      size: "medium",
    });
  }
  if (heroAssist && comboParts.length < 4) {
    comboParts.push({
      href: `/${locale}/parts/assist/${encodeURIComponent(heroAssist.id)}`,
      label: dict.part.assist,
      name: heroAssist.name ? `${heroAssist.id} ${heroAssist.name}` : heroAssist.id,
      code: "Assist blade",
      image: heroAssist.image,
      fallback: heroAssist.id,
      size: "medium",
    });
  }

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
      <section className="relative isolate overflow-hidden border-b border-edge bg-[#050907]">
        <div className="bg-grid absolute inset-0 -z-20 opacity-70" />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(115deg, rgba(0,229,143,0.16), transparent 32%), linear-gradient(155deg, transparent 54%, rgba(56,217,255,0.14)), linear-gradient(180deg, rgba(5,9,7,0.2), #050907 92%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-20 -z-10 h-px bg-accent/35"
          style={{ boxShadow: "0 0 42px rgba(0,229,143,0.65)" }}
        />

        <div className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:py-16">
          <div className="max-w-xl">
            <div className="font-display text-xs font-black uppercase text-accent">
              {homeCopy.eyebrow}
            </div>
            <h1 className="mt-5 font-display text-3xl font-black uppercase leading-[0.95] text-ink sm:text-5xl lg:text-6xl">
              {homeCopy.title}
              <span className="text-glow mt-2 block text-accent">{homeCopy.titleAccent}</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-dim sm:text-lg">
              {homeCopy.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/catalog?tab=builder`}
                className="clip-x bg-accent px-6 py-3 font-display text-sm font-black uppercase text-bg transition hover:-translate-y-0.5 hover:brightness-110"
              >
                {homeCopy.primaryCta}
              </Link>
              <Link
                href={`/${locale}/beylive`}
                className="clip-x border border-accent/45 bg-panel px-6 py-3 font-display text-sm font-black uppercase text-accent transition hover:-translate-y-0.5 hover:bg-accent/10"
              >
                {homeCopy.secondaryCta}
              </Link>
              <Link
                href={`/${locale}/tournaments`}
                className="clip-x border border-edge bg-panel/80 px-6 py-3 font-display text-sm font-black uppercase text-ink-dim transition hover:-translate-y-0.5 hover:border-accent-2/60 hover:text-accent-2"
              >
                {homeCopy.tertiaryCta}
              </Link>
            </div>

            <div className="mt-10 hidden max-w-lg grid-cols-3 gap-3 sm:grid">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-md border border-edge bg-panel/70 px-4 py-3">
                  <div className="font-display text-2xl font-black text-accent">{stat.value}</div>
                  <div className="mt-1 text-xs leading-tight text-ink-dim">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-accent/30 bg-[#07100e]/90 p-4 shadow-[0_26px_90px_rgba(0,229,143,0.13)] sm:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-display text-[10px] font-black uppercase text-accent-2">
                  {homeCopy.comboTitle}
                </div>
                <div className="mt-1 text-sm text-ink-dim">{homeCopy.comboSubtitle}</div>
              </div>
              {heroBlade && (
                <div className="rounded border border-accent/35 bg-accent/10 px-3 py-1 font-display text-[10px] font-black uppercase text-accent">
                  Tier {heroBlade.tier ?? "Meta"}
                </div>
              )}
            </div>
            <div className="grid gap-3">
              {comboParts.map((part, index) => (
                <ComboLayer key={`${part.label}-${part.name}`} part={part} index={index} />
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
