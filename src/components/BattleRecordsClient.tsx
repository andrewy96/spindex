"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { Match, Round, supabase } from "@/lib/supabase";

const MATCH_SELECT =
  "*, p1_profile:profiles!matches_p1_fkey(*), p2_profile:profiles!matches_p2_fkey(*)";

const FINISH_COLOR: Record<string, string> = {
  spin: "var(--color-sta)",
  over: "var(--color-def)",
  burst: "var(--color-spc)",
  xtreme: "var(--color-atk)",
};

function fmtDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function RecordRow({ m, locale, dict }: { m: Match; locale: Locale; dict: Dict }) {
  const p1Won = m.winner === m.p1;
  const rounds = (m.rounds ?? []) as Round[];
  const format = m.format ?? "single";
  const teamSize = m.team_size ?? 1;
  const targetScore = m.target_score ?? 4;
  const formatLabel =
    format === "team"
      ? dict.battle.teamFormat.replace("{count}", String(teamSize))
      : dict.battle.singleBattle;
  const moved = m.stars_moved ?? m.wager;

  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/${locale}/players/${m.p1_profile?.handle ?? ""}`}
          className={`font-semibold hover:text-accent ${p1Won ? "text-accent" : "text-ink"}`}
        >
          @{m.p1_profile?.handle ?? "?"}
        </Link>
        <span className="font-display text-lg font-black">
          {m.p1_score}:{m.p2_score}
        </span>
        <Link
          href={`/${locale}/players/${m.p2_profile?.handle ?? ""}`}
          className={`font-semibold hover:text-accent ${!p1Won ? "text-accent" : "text-ink"}`}
        >
          @{m.p2_profile?.handle ?? "?"}
        </Link>
        <span className="ml-auto text-xs text-ink-dim">{fmtDate(m.created_at, locale)}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded bg-accent-2/10 px-2 py-0.5 text-[10px] font-semibold text-accent-2">
          {formatLabel}
        </span>
        <span className="rounded bg-bal/10 px-2 py-0.5 text-[10px] font-semibold text-bal">
          ★{moved}
        </span>
        <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
          {dict.battle.firstToPoints.replace("{points}", String(targetScore))}
        </span>
      </div>

      {rounds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {rounds.map((r, i) => {
            const name =
              r.side === 1
                ? m.p1_profile?.handle ?? dict.battle.player1
                : m.p2_profile?.handle ?? dict.battle.player2;
            return (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 font-display text-[9px] font-bold"
                style={{
                  color: FINISH_COLOR[r.finish],
                  background: `color-mix(in srgb, ${FINISH_COLOR[r.finish]} 12%, transparent)`,
                }}
              >
                @{name} +{r.pts}
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}

export default function BattleRecordsClient({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dict;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setMatches((data as unknown as Match[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (!supabase) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        🚧 {dict.auth.notConfigured}
      </div>
    );
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-ink-dim">{dict.battle.loadingRecords}</p>;
  }

  if (matches.length === 0) {
    return <p className="py-16 text-center text-sm text-ink-dim">{dict.battle.noRecords}</p>;
  }

  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <RecordRow key={m.id} m={m} locale={locale} dict={dict} />
      ))}
    </div>
  );
}
