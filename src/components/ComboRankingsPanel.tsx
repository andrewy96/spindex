import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { rankings, rankingsUpdatedAt, rankedComboName } from "@/data/rankings";
import PartImage from "@/components/PartImage";
import { TYPE_COLOR } from "@/components/badges";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function ComboRankingsPanel({ locale, dict }: { locale: Locale; dict: Dict }) {
  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);
  const updated = rankingsUpdatedAt.slice(0, 10);

  return (
    <div>
      <h2 className="font-display text-xl font-bold tracking-wide">{dict.rankings.comboTitle}</h2>
      <p className="mt-1 text-sm text-ink-dim">{dict.rankings.comboSubtitle}</p>
      <p className="mb-8 mt-1 text-xs text-ink-dim/70">
        {dict.rankings.updated}: {updated}
      </p>

      {/* Podium */}
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {top3.map((r, i) => (
          <div
            key={r.rank}
            className={`panel relative overflow-hidden p-5 ${i === 0 ? "border-accent/50" : ""}`}
          >
            <div className="absolute right-3 top-3 text-3xl">{MEDALS[i]}</div>
            <div className="font-display text-xs tracking-widest text-ink-dim">
              {dict.rankings.top3} #{r.rank}
            </div>
            <div className="mx-auto my-3 h-28 w-28">
              <PartImage
                src={r.blade?.image ?? null}
                alt={rankedComboName(r, locale)}
                fallbackLabel="X"
                color={r.blade ? TYPE_COLOR[r.blade.type] : undefined}
              />
            </div>
            <div className="font-display text-lg font-bold text-glow text-accent">
              {rankedComboName(r, locale)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim">
              <span>
                {dict.rankings.colWins}: <b className="text-ink">{r.wins}</b>
              </span>
              <span>
                🥇{r.first} 🥈{r.second} 🥉{r.third}
              </span>
              <span>
                {dict.rankings.colChamp}: <b className="text-ink">{Math.round(r.champRate * 100)}%</b>
              </span>
            </div>
            {r.builderQuery && (
              <Link
                href={`/${locale}/builder?${r.builderQuery}`}
                className="clip-x mt-4 inline-block bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
              >
                {dict.rankings.build} →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left font-display text-[10px] uppercase tracking-widest text-ink-dim">
              <th className="px-4 py-3">{dict.rankings.colRank}</th>
              <th className="px-4 py-3">{dict.rankings.colCombo}</th>
              <th className="px-4 py-3 text-right">{dict.rankings.colWins}</th>
              <th className="px-4 py-3 text-right">{dict.rankings.colPodium}</th>
              <th className="px-4 py-3 text-right">{dict.rankings.colChamp}</th>
              <th className="px-4 py-3 text-right">{dict.rankings.colLast}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rest.map((r) => (
              <tr key={r.rank} className="border-b border-edge/50 transition last:border-0 hover:bg-panel-2/60">
                <td className="px-4 py-2.5 font-display font-bold text-ink-dim">{r.rank}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0">
                      <PartImage
                        src={r.blade?.image ?? null}
                        alt=""
                        fallbackLabel="X"
                        color={r.blade ? TYPE_COLOR[r.blade.type] : undefined}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{rankedComboName(r, locale)}</div>
                      {r.blade && (
                        <div className="truncate text-xs text-ink-dim">
                          {locale === "zh" ? r.blade.enFull : r.blade.zh}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-display font-bold text-accent">{r.wins}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-ink-dim">
                  {r.first} / {r.second} / {r.third}
                </td>
                <td className="px-4 py-2.5 text-right">{Math.round(r.champRate * 100)}%</td>
                <td className="px-4 py-2.5 text-right text-xs text-ink-dim">{r.lastDate ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.builderQuery && (
                    <Link
                      href={`/${locale}/builder?${r.builderQuery}`}
                      className="whitespace-nowrap text-xs font-semibold text-accent hover:underline"
                    >
                      {dict.rankings.build} →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-dim/70">{dict.rankings.note}</p>
    </div>
  );
}
