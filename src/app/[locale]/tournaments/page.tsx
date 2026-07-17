import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales } from "@/i18n";
import TournamentHostClient from "@/components/TournamentHostClient";

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
  const dict = getDict(locale);
  return { title: dict.tournaments.title, description: dict.tournaments.subtitle };
}

export default async function TournamentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);
  const t = dict.tournaments;

  const finishes = [
    { name: t.spinName, desc: t.spinDesc, pts: 1, color: "var(--color-sta)" },
    { name: t.overName, desc: t.overDesc, pts: 2, color: "var(--color-def)" },
    { name: t.burstName, desc: t.burstDesc, pts: 2, color: "var(--color-bal)" },
    { name: t.xtremeName, desc: t.xtremeDesc, pts: 3, color: "var(--color-atk)" },
  ];

  const formats = [
    { name: t.f1Name, desc: t.f1Desc, n: "01" },
    { name: t.f2Name, desc: t.f2Desc, n: "02" },
    { name: t.f3Name, desc: t.f3Desc, n: "03" },
  ];

  const places = [
    { name: t.challongeName, desc: t.challongeDesc, url: "https://worldbeyblade.challonge.com/" },
    { name: t.wboName, desc: t.wboDesc, url: "https://worldbeyblade.org/" },
    { name: t.ttName, desc: t.ttDesc, url: "https://takaratomyasia.com/en/beyblade-x-campiagn-page/" },
    { name: t.myName, desc: t.myDesc, url: "https://www.facebook.com/Beyblademy/" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-wide">{t.title}</h1>
      <p className="mb-10 mt-1 text-sm text-ink-dim">{t.subtitle}</p>

      <TournamentHostClient locale={locale} dict={dict} />

      {/* Scoring */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold tracking-wide">{t.scoringTitle}</h2>
        <p className="mt-1 text-sm text-ink-dim">{t.scoringIntro}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {finishes.map((f) => (
            <div key={f.name} className="panel relative overflow-hidden p-5">
              <div
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: f.color }}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-sm font-bold">{f.name}</span>
                <span className="font-display text-2xl font-black" style={{ color: f.color }}>
                  {f.pts}
                  <span className="ml-1 text-xs font-semibold text-ink-dim">{t.pts}</span>
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-dim">{f.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 font-display text-sm font-bold text-accent">◆ {t.winCondition}</p>
      </section>

      {/* Formats */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold tracking-wide">{t.formatsTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {formats.map((f) => (
            <div key={f.n} className="panel p-5">
              <div className="font-display text-3xl font-black text-edge">{f.n}</div>
              <div className="mt-2 font-semibold">{f.name}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Where to compete */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold tracking-wide">{t.findTitle}</h2>
        <p className="mt-1 text-sm text-ink-dim">{t.findIntro}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {places.map((p) => (
            <a
              key={p.url}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="panel group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold group-hover:text-accent">{p.name}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">{p.desc}</p>
              </div>
              <span className="clip-x shrink-0 border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent">
                {t.open} ↗
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
