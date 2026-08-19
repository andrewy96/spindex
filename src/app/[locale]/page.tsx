import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import { assists, bits, blades, canonicalBlades, lockChips, ratchets, tierRank } from "@/data/parts";
import { BladeCard } from "@/components/PartCard";
import PartImage from "@/components/PartImage";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const copy = {
  en: {
    kicker: "SPINDEX MALAYSIA",
    title: "Beyblade X command hub",
    subtitle:
      "Built for Malaysian bladers who want one clean place for combos, rankings, live events, community battles, and reward tracking.",
    primaryCta: "Build a combo",
    secondaryCta: "Watch BEYLIVE",
    bioTitle: "What SPINDEX is",
    bio:
      "SPINDEX connects the daily Beyblade X scene: study parts, plan tournament-ready combos, run events, record OverDrive results, and keep every player moving with clear public records.",
    totalParts: "Parts indexed",
    liveTools: "Live tools",
    playerLoop: "Player loop",
    playerLoopText: "Build, battle, score, improve.",
    spotlight: "Current focus",
    featuredCode: "Featured blade",
    platformTitle: "One platform for the stadium floor",
    platformSub: "Fast routes into the tools players, hosts, and judges use every week.",
    operateTitle: "Built around real event flow",
    operateSub:
      "From walk-in signups to live bracket screens, SPINDEX is designed for phones at the table and larger displays around the venue.",
    communityTitle: "SPINDEX Malaysia",
    communityText:
      "A community project for Beyblade X players, collectors, hosts, and judges. The goal is simple: make local play easier to organize, easier to follow, and easier to grow.",
    viewAll: "View all parts",
    open: "Open",
    cards: [
      {
        href: "/catalog?tab=builder",
        label: "Combo Lab",
        text: "Assemble Blade, Ratchet, Bit, Lock Chip, and Assist Blade builds from the live parts database.",
        tag: "Build",
      },
      {
        href: "/battle",
        label: "OverDrive",
        text: "Stake points, confirm battles, track daily rewards, and climb the player ranking.",
        tag: "Points",
      },
      {
        href: "/beylive",
        label: "BEYLIVE",
        text: "Follow live brackets, table matches, player IDs, phone scoring, and event displays.",
        tag: "Live",
      },
      {
        href: "/tournaments",
        label: "Tournaments",
        text: "Host formats from single elimination to custom stage plans with public event pages.",
        tag: "Host",
      },
      {
        href: "/gatherings",
        label: "Gathering",
        text: "Post casual sessions with place, time, capacity, and signups for local players.",
        tag: "Meet",
      },
      {
        href: "/catalog",
        label: "Parts Catalog",
        text: "Search Beyblade X parts in English and Chinese with images, tiers, and stock info.",
        tag: "Study",
      },
    ],
    flows: [
      { label: "Register", text: "Player profiles, photos, states, and SPX IDs." },
      { label: "Compete", text: "OverDrive challenges, scoreboards, and confirmed records." },
      { label: "Broadcast", text: "BEYLIVE brackets, streams, podiums, and event history." },
    ],
  },
  zh: {
    kicker: "SPINDEX MALAYSIA",
    title: "Beyblade X 指挥中心",
    subtitle: "为马来西亚玩家打造的整合平台：组合、排名、直播赛事、社群对战与奖励记录都在同一处。",
    primaryCta: "建立组合",
    secondaryCta: "观看 BEYLIVE",
    bioTitle: "SPINDEX 是什么",
    bio: "SPINDEX 串联日常 Beyblade X 玩法：研究零件、规划比赛组合、举办赛事、记录 OverDrive 结果，并用清楚的公开记录推动玩家成长。",
    totalParts: "已收录零件",
    liveTools: "现场工具",
    playerLoop: "玩家循环",
    playerLoopText: "组装、对战、计分、进步。",
    spotlight: "当前焦点",
    featuredCode: "精选战刃",
    platformTitle: "一个平台覆盖现场流程",
    platformSub: "玩家、主办与裁判每周都会用到的工具，都能快速进入。",
    operateTitle: "围绕真实赛事流程设计",
    operateSub: "从现场临时报名到直播对战树，SPINDEX 适合桌边手机操作，也适合场地大屏显示。",
    communityTitle: "SPINDEX Malaysia",
    communityText: "为 Beyblade X 玩家、收藏家、主办与裁判打造的社群项目。目标很简单：让本地对战更容易组织、更容易观看，也更容易成长。",
    viewAll: "查看全部零件",
    open: "进入",
    cards: [
      {
        href: "/catalog?tab=builder",
        label: "组合实验室",
        text: "从即时零件数据库中组合战刃、固锁、轴心、锁芯与辅助战刃。",
        tag: "组装",
      },
      {
        href: "/battle",
        label: "OverDrive",
        text: "押注积分、确认对战、追踪每日奖励，并提升玩家排名。",
        tag: "积分",
      },
      {
        href: "/beylive",
        label: "BEYLIVE",
        text: "查看直播对战树、桌号赛程、玩家 ID、手机计分与现场显示。",
        tag: "直播",
      },
      {
        href: "/tournaments",
        label: "赛事",
        text: "从单败淘汰到自定义阶段计划，都能建立公开赛事页面。",
        tag: "主办",
      },
      {
        href: "/gatherings",
        label: "聚会",
        text: "发布休闲聚会地点、时间、人数上限与本地玩家报名。",
        tag: "聚集",
      },
      {
        href: "/catalog",
        label: "零件图鉴",
        text: "用中英文搜索 Beyblade X 零件，查看图片、阶级与原装资料。",
        tag: "研究",
      },
    ],
    flows: [
      { label: "注册", text: "玩家资料、头像、州属与 SPX ID。" },
      { label: "对战", text: "OverDrive 挑战、计分板与确认记录。" },
      { label: "直播", text: "BEYLIVE 对战树、串流、领奖台与赛事历史。" },
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

  const stats = [
    { n: totalParts, label: page.totalParts },
    { n: 4, label: page.liveTools },
    { n: "SPX", label: page.playerLoop },
  ];

  return (
    <div>
      <section className="bg-grid border-b border-edge">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
          <div>
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
              {page.kicker}
            </div>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-black leading-tight tracking-wide sm:text-6xl">
              {page.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-dim sm:text-lg">
              {page.subtitle}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/catalog?tab=builder`}
                className="clip-x bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
              >
                {page.primaryCta}
              </Link>
              <Link
                href={`/${locale}/beylive`}
                className="clip-x border border-accent-2/50 bg-panel px-6 py-3 font-display text-sm font-bold tracking-wider text-accent-2 transition hover:bg-accent-2/10"
              >
                {page.secondaryCta}
              </Link>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-md border border-edge bg-panel/75 px-4 py-3">
                  <div className="font-display text-2xl font-black text-accent">{stat.n}</div>
                  <div className="mt-1 text-xs text-ink-dim">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[25rem] overflow-hidden rounded-md border border-edge bg-panel/70">
            <div className="absolute left-4 top-4 z-10 rounded bg-bg/80 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-accent-2">
              {page.spotlight}
            </div>
            {heroBlade && (
              <div className="absolute inset-x-8 top-12 h-56 sm:inset-x-12 sm:h-64">
                <PartImage
                  src={heroBlade.image}
                  alt={locale === "zh" ? heroBlade.zh : heroBlade.enFull}
                  fallbackLabel="X"
                  priority
                  sizes="(max-width: 1024px) 85vw, 420px"
                  className="scale-105"
                />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 border-t border-edge bg-bg/80 p-4">
              <div className="font-display text-xs font-bold uppercase tracking-wider text-ink-dim">
                {page.featuredCode}
              </div>
              <div className="mt-1 truncate font-display text-xl font-black text-ink">
                {heroBlade ? (locale === "zh" ? heroBlade.zh : heroBlade.enFull) : "Beyblade X"}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {supportBlades.map((blade) => (
                  <Link
                    key={blade.id}
                    href={`/${locale}/parts/blade/${blade.id}`}
                    className="group h-20 rounded-md border border-edge bg-panel-2 p-2 transition hover:border-accent/60"
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
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border border-accent/30 bg-accent/10 p-5">
            <div className="font-display text-sm font-bold tracking-wider text-accent">{page.bioTitle}</div>
            <p className="mt-3 text-sm leading-relaxed text-ink">{page.bio}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {page.flows.map((item) => (
              <div key={item.label} className="rounded-md border border-edge bg-panel p-4">
                <div className="font-display text-sm font-bold text-accent-2">{item.label}</div>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-edge bg-panel/35">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-2xl font-black tracking-wide">{page.platformTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-dim">{page.platformSub}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.cards.map((card) => (
              <Link
                key={card.href}
                href={`/${locale}${card.href}`}
                className="group flex min-h-36 flex-col rounded-md border border-edge bg-panel p-5 transition hover:-translate-y-0.5 hover:border-accent/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-display text-lg font-black tracking-wide group-hover:text-accent">
                    {card.label}
                  </div>
                  <span className="rounded bg-bg px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-accent-2">
                    {card.tag}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-dim">{card.text}</p>
                <span className="mt-auto pt-4 font-display text-xs font-bold tracking-wider text-accent">
                  {page.open}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <h2 className="font-display text-2xl font-black tracking-wide">{page.operateTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">{page.operateSub}</p>
            <div className="mt-5 rounded-md border border-edge bg-panel p-5">
              <div className="font-display text-sm font-bold tracking-wider text-accent-2">{page.communityTitle}</div>
              <p className="mt-3 text-sm leading-relaxed text-ink">{page.communityText}</p>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-black tracking-wide">{dict.home.featuredTitle}</h2>
                <p className="mt-1 text-sm text-ink-dim">{dict.home.featuredSub}</p>
              </div>
              <Link href={`/${locale}/catalog`} className="shrink-0 text-sm font-semibold text-accent hover:underline">
                {page.viewAll}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {featured.slice(0, 4).map((blade) => (
                <BladeCard key={blade.id} blade={blade} locale={locale} dict={dict} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
