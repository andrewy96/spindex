import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import { assists, bits, blades, canonicalBlades, lockChips, ratchets, tierRank } from "@/data/parts";
import { BladeCard } from "@/components/PartCard";
import PartImage from "@/components/PartImage";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const BEYBLADE_PARTS_VIDEO_ID = "5f-XW_X095Y";
const HERO_IMAGE = "/home/spindex-hero-cinematic.jpg";

const copy = {
  en: {
    eyebrow: "SPIN / CONNECT / GROW",
    title1: "SPIN",
    title2: "BUILDS",
    title3: "LEGENDS",
    deck: "MORE THAN BATTLES. A PLATFORM FOR EVERY BLADER.",
    subtitle:
      "SPINDEX brings the Beyblade X community closer through competitive tools, live events, combo knowledge, and shared player records.",
    primaryCta: "Join the community",
    secondaryCta: "Explore events",
    scroll: "Scroll to explore",
    totalParts: "Parts indexed",
    liveTools: "Live tools",
    onePlatform: "Connected platform",
    guidanceTitle: "Choose your next move",
    guidanceSub: "Fast entry points for players, hosts, judges, and new bladers.",
    videoTitle: "Beyblade X part system",
    videoSub: "See how Beyblade X separates into performance parts before building your own setup.",
    videoCta: "Open Combo Lab",
    platformTitle: "Built by bladers. For the community.",
    platformSub:
      "SPINDEX is not a team page. It is a shared platform for battles, events, knowledge, and community growth.",
    featuredTitle: "Study the current meta",
    featuredSub: "Start from top-tier blades, then test your own setup in the Combo Lab.",
    finalTitle: "Ready to spin?",
    finalSub: "The next battle, event, or combo test starts here.",
    joinCta: "Create account",
    eventCta: "View upcoming events",
    viewAll: "View all parts",
    heroTags: ["Combo Lab", "OverDrive points", "BEYLIVE brackets"],
    guidance: [
      {
        href: "/catalog?tab=builder",
        step: "01",
        label: "Build a combo",
        text: "Compare parts, assemble a setup, and share one clean build link.",
      },
      {
        href: "/battle",
        step: "02",
        label: "Score battles",
        text: "Post OverDrive challenges, stake points, and record confirmed results.",
      },
      {
        href: "/beylive",
        step: "03",
        label: "Watch BEYLIVE",
        text: "Follow live, upcoming, and past events from one tournament hub.",
      },
      {
        href: "/tournaments",
        step: "04",
        label: "Run an event",
        text: "Host brackets, customize formats, and manage table scoring.",
      },
    ],
    pillars: [
      {
        href: "/battle",
        label: "Battles",
        text: "Point challenges, scoreboards, records, and ranking pressure for real matches.",
      },
      {
        href: "/tournaments",
        label: "Events",
        text: "Tournament creation, public event pages, walk-ins, and BEYLIVE control.",
      },
      {
        href: "/catalog",
        label: "Knowledge",
        text: "A searchable Beyblade X parts catalog with images, stats, tiers, and combo context.",
      },
      {
        href: "/gatherings",
        label: "Community",
        text: "Gatherings and local meetups that help players find places and people to battle.",
      },
    ],
  },
  zh: {
    eyebrow: "SPIN / CONNECT / GROW",
    title1: "SPIN",
    title2: "BUILDS",
    title3: "LEGENDS",
    deck: "不只是对战。为每位玩家打造的平台。",
    subtitle: "SPINDEX 通过竞赛工具、直播赛事、组合知识和玩家记录，把 Beyblade X 社群连接得更紧密。",
    primaryCta: "加入社群",
    secondaryCta: "探索赛事",
    scroll: "继续探索",
    totalParts: "已收录零件",
    liveTools: "现场工具",
    onePlatform: "整合平台",
    guidanceTitle: "选择下一步",
    guidanceSub: "为玩家、主办、裁判和新手准备的快速入口。",
    videoTitle: "Beyblade X 零件系统",
    videoSub: "先看 Beyblade X 如何拆分成不同性能零件，再开始建立你的配置。",
    videoCta: "进入组合实验室",
    platformTitle: "由玩家打造，为社群而生。",
    platformSub: "SPINDEX 不是战队页面，而是服务对战、赛事、知识与社群成长的共享平台。",
    featuredTitle: "研究当前环境",
    featuredSub: "从顶级战刃开始，再进入组合实验室测试自己的配置。",
    finalTitle: "准备开战？",
    finalSub: "下一场对战、赛事或组合测试，从这里开始。",
    joinCta: "创建账号",
    eventCta: "查看近期赛事",
    viewAll: "查看全部零件",
    heroTags: ["组合实验室", "OverDrive 积分", "BEYLIVE 对战树"],
    guidance: [
      {
        href: "/catalog?tab=builder",
        step: "01",
        label: "建立组合",
        text: "比较零件、组出配置，并用一条链接分享。",
      },
      {
        href: "/battle",
        step: "02",
        label: "记录对战",
        text: "发布 OverDrive 挑战、押注积分，并保存确认结果。",
      },
      {
        href: "/beylive",
        step: "03",
        label: "观看 BEYLIVE",
        text: "从赛事中心追踪直播、即将举行和已结束的赛事。",
      },
      {
        href: "/tournaments",
        step: "04",
        label: "主办赛事",
        text: "建立对战树、自定义赛制，并管理桌边计分。",
      },
    ],
    pillars: [
      {
        href: "/battle",
        label: "对战",
        text: "真实比赛的积分挑战、计分板、记录与排名压力。",
      },
      {
        href: "/tournaments",
        label: "赛事",
        text: "赛事建立、公开页面、现场报名和 BEYLIVE 控制。",
      },
      {
        href: "/catalog",
        label: "知识",
        text: "可搜索的 Beyblade X 零件图鉴，包含图片、数据、阶级和组合资讯。",
      },
      {
        href: "/gatherings",
        label: "社群",
        text: "聚会与本地活动，让玩家更容易找到地点和对手。",
      },
    ],
  },
} as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as Locale;
  const dict = getDict(locale);
  const page = copy[locale];

  const featured = canonicalBlades()
    .filter((b) => b.image)
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))
    .slice(0, 8);
  const heroBlade = featured[0];
  const supportBlades = featured.slice(1, 4);
  const totalParts = blades.length + lockChips.length + ratchets.length + bits.length + assists.length;
  const numberFormat = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-MY");

  const stats = [
    { n: numberFormat.format(totalParts), label: page.totalParts },
    { n: "4", label: page.liveTools },
    { n: "1", label: page.onePlatform },
  ];

  return (
    <div className="bg-[#050507]">
      <section className="relative isolate min-h-[calc(100svh-3.5rem)] overflow-hidden border-b border-[#2a2330]">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#050507_0%,rgba(5,5,7,0.97)_33%,rgba(5,5,7,0.68)_56%,rgba(5,5,7,0.18)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#050507] to-transparent" />

        <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl flex-col justify-center px-4 py-14">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3 font-display text-xs font-black uppercase tracking-[0.26em] text-[#ff2f8b]">
              <span className="inline-block size-2 rounded-full bg-[#ff2f8b] shadow-[0_0_18px_rgba(255,47,139,0.9)]" />
              {page.eyebrow}
            </div>

            <h1 className="mt-6 font-display text-[clamp(3rem,14.5vw,4.2rem)] font-black uppercase leading-[0.9] tracking-wide text-white sm:text-[6.8rem] lg:text-[7.6rem]">
              <span className="block drop-shadow-[0_8px_28px_rgba(0,0,0,0.45)]">{page.title1}</span>
              <span className="block text-[#ff2f8b] drop-shadow-[0_0_34px_rgba(255,47,139,0.55)]">
                {page.title2}
              </span>
              <span className="block drop-shadow-[0_8px_28px_rgba(0,0,0,0.45)]">{page.title3}</span>
            </h1>

            <p className="mt-7 font-display text-sm font-bold uppercase leading-relaxed tracking-[0.24em] text-white/90">
              {page.deck}
            </p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/68 sm:text-lg">
              {page.subtitle}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {page.heroTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-white/75 backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/register`}
                className="clip-x bg-[#ff2f8b] px-6 py-3 font-display text-sm font-black uppercase tracking-wider text-white shadow-[0_0_28px_rgba(255,47,139,0.36)] transition hover:-translate-y-0.5 hover:brightness-110"
              >
                {page.primaryCta}
              </Link>
              <Link
                href={`/${locale}/tournaments`}
                className="clip-x border border-[#ff2f8b]/55 bg-black/35 px-6 py-3 font-display text-sm font-black uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-[#ff2f8b]/12"
              >
                {page.secondaryCta}
              </Link>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-md border border-white/12 bg-black/35 px-4 py-3 backdrop-blur">
                  <div className="font-display text-2xl font-black text-white">{stat.n}</div>
                  <div className="mt-1 text-xs text-white/55">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 hidden items-center gap-3 text-xs text-white/50 sm:flex">
            <span className="h-9 w-px rounded bg-gradient-to-b from-[#ff2f8b] to-transparent" />
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em]">{page.scroll}</span>
          </div>
        </div>
      </section>

      <section className="border-b border-[#2a2330] bg-[#07080c]">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 lg:grid-cols-[15rem_1fr]">
          <div>
            <h2 className="font-display text-2xl font-black uppercase tracking-wide text-white">{page.guidanceTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{page.guidanceSub}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {page.guidance.map((item) => (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                className="group min-h-40 rounded-md border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-[#ff2f8b]/70 hover:bg-[#ff2f8b]/8 hover:shadow-[0_18px_50px_rgba(255,47,139,0.12)]"
              >
                <div className="font-display text-[10px] font-black text-[#38d9ff]">{item.step}</div>
                <div className="mt-3 font-display text-base font-black uppercase tracking-wide text-white group-hover:text-[#ff2f8b]">
                  {item.label}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/58">{item.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="overflow-hidden rounded-md border border-white/10 bg-[#0c0f16] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="aspect-video bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${BEYBLADE_PARTS_VIDEO_ID}?rel=0&modestbranding=1`}
              title={page.videoTitle}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
        <div>
          <div className="font-display text-xs font-black uppercase tracking-[0.24em] text-[#ff2f8b]">
            {page.videoTitle}
          </div>
          <h2 className="mt-4 font-display text-3xl font-black uppercase leading-tight text-white sm:text-4xl">
            {page.videoSub}
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1.2fr]">
            {heroBlade && (
              <Link
                href={`/${locale}/parts/blade/${heroBlade.id}`}
                className="group flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3 transition hover:border-[#ff2f8b]/65"
                aria-label={locale === "zh" ? heroBlade.zh : heroBlade.enFull}
              >
                <span className="block h-16 w-20 shrink-0">
                  <PartImage
                    src={heroBlade.image}
                    alt={locale === "zh" ? heroBlade.zh : heroBlade.enFull}
                    fallbackLabel="X"
                    sizes="120px"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[10px] font-black uppercase tracking-wider text-white/45">
                    {dict.home.featuredTitle}
                  </span>
                  <span className="block truncate text-sm font-semibold text-white group-hover:text-[#ff2f8b]">
                    {locale === "zh" ? heroBlade.zh : heroBlade.enFull}
                  </span>
                </span>
              </Link>
            )}
            <Link
              href={`/${locale}/catalog?tab=builder`}
              className="clip-x flex items-center justify-center bg-white px-5 py-3 font-display text-xs font-black uppercase tracking-wider text-black transition hover:bg-[#ff2f8b] hover:text-white"
            >
              {page.videoCta}
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {supportBlades.map((blade) => (
              <Link
                key={blade.id}
                href={`/${locale}/parts/blade/${blade.id}`}
                className="group h-24 rounded-md border border-white/10 bg-white/[0.04] p-2 transition hover:border-[#ff2f8b]/65"
                aria-label={locale === "zh" ? blade.zh : blade.enFull}
              >
                <PartImage
                  src={blade.image}
                  alt={locale === "zh" ? blade.zh : blade.enFull}
                  fallbackLabel={blade.code}
                  sizes="120px"
                  className="transition group-hover:scale-105"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#2a2330] bg-[#07080c]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-7 max-w-3xl">
            <h2 className="font-display text-3xl font-black uppercase tracking-wide text-white">{page.platformTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/58">{page.platformSub}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {page.pillars.map((card) => (
              <Link
                key={card.href}
                href={`/${locale}${card.href}`}
                className="group flex min-h-52 flex-col rounded-md border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5 transition hover:-translate-y-1.5 hover:border-[#ff2f8b]/75 hover:shadow-[0_20px_60px_rgba(255,47,139,0.13)]"
              >
                <div className="font-display text-xl font-black uppercase tracking-wide text-white group-hover:text-[#ff2f8b]">
                  {card.label}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/58">{card.text}</p>
                <span className="mt-auto pt-5 font-display text-xs font-black uppercase tracking-wider text-[#38d9ff] transition group-hover:translate-x-1">
                  {page.secondaryCta}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="font-display text-xs font-black uppercase tracking-[0.24em] text-[#ff2f8b]">
              {page.featuredTitle}
            </div>
            <h2 className="mt-3 font-display text-3xl font-black uppercase tracking-wide text-white">
              {dict.home.featuredTitle}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/58">{page.featuredSub}</p>
          </div>
          <Link href={`/${locale}/catalog`} className="shrink-0 text-sm font-semibold text-[#ff2f8b] hover:underline">
            {page.viewAll}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {featured.slice(0, 4).map((blade) => (
            <BladeCard key={blade.id} blade={blade} locale={locale} dict={dict} />
          ))}
        </div>
      </section>

      <section className="border-t border-[#2a2330] bg-[#07080c]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="relative overflow-hidden rounded-md border border-[#ff2f8b]/35 bg-[linear-gradient(135deg,rgba(255,47,139,0.18),rgba(12,15,22,0.94)_42%,rgba(56,217,255,0.12))] p-6 sm:p-8">
            <div className="relative z-10 max-w-2xl">
              <h2 className="font-display text-3xl font-black uppercase tracking-wide text-white sm:text-4xl">
                {page.finalTitle}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-white/65">{page.finalSub}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/register`}
                  className="clip-x bg-[#ff2f8b] px-6 py-3 font-display text-xs font-black uppercase tracking-wider text-white transition hover:brightness-110"
                >
                  {page.joinCta}
                </Link>
                <Link
                  href={`/${locale}/beylive`}
                  className="clip-x border border-white/15 bg-black/30 px-6 py-3 font-display text-xs font-black uppercase tracking-wider text-white transition hover:border-[#38d9ff]/65 hover:text-[#38d9ff]"
                >
                  {page.eventCta}
                </Link>
              </div>
            </div>
            {heroBlade && (
              <div className="pointer-events-none absolute -right-10 -top-8 hidden h-56 w-56 opacity-25 sm:block">
                <PartImage
                  src={heroBlade.image}
                  alt=""
                  fallbackLabel="X"
                  sizes="260px"
                  className="animate-spin-slow"
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
