"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { MATCH_SELECT, Match, Round, supabase } from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";
import { matchToShareData } from "@/lib/shareCard";
import ShareMatchModal from "./ShareMatchModal";

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
  const { profile } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const p1Won = m.winner === m.p1;
  const rounds = (m.rounds ?? []) as Round[];
  const format = m.format ?? "single";
  const teamSize = m.team_size ?? 1;
  const targetScore = m.target_score ?? 4;
  const formatLabel =
    format === "team"
      ? dict.battle.teamFormat.replace(/\{count\}/g, String(teamSize))
      : dict.battle.singleBattle;
  const moved = m.stars_moved ?? m.wager;

  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/${locale}/players/${m.p1_profile?.handle ?? ""}`}
          className={`font-semibold hover:text-accent ${p1Won ? "text-accent" : "text-ink"}`}
        >
          {profileDisplayName(m.p1_profile)}
        </Link>
        <span className="font-display text-lg font-black">
          {m.p1_score}:{m.p2_score}
        </span>
        <Link
          href={`/${locale}/players/${m.p2_profile?.handle ?? ""}`}
          className={`font-semibold hover:text-accent ${!p1Won ? "text-accent" : "text-ink"}`}
        >
          {profileDisplayName(m.p2_profile)}
        </Link>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-dim">{fmtDate(m.created_at, locale)}</span>
          <button
            onClick={() => setShareOpen(true)}
            aria-label={dict.battle.share}
            title={dict.battle.share}
            className="text-ink-dim transition hover:text-accent"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
              <path d="M16 6l-4-4-4 4" />
              <path d="M12 2v13" />
            </svg>
          </button>
        </span>
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
                ? profileDisplayName(m.p1_profile, dict.battle.player1)
                : profileDisplayName(m.p2_profile, dict.battle.player2);
            return (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 font-display text-[9px] font-bold"
                style={{
                  color: FINISH_COLOR[r.finish],
                  background: `color-mix(in srgb, ${FINISH_COLOR[r.finish]} 12%, transparent)`,
                }}
              >
                {name} +{r.pts}
              </span>
            );
          })}
        </div>
      )}

      {shareOpen && (
        <ShareMatchModal
          data={matchToShareData(m, profile?.id ?? null, locale, dict)}
          fileId={m.id}
          dict={dict}
          onClose={() => setShareOpen(false)}
        />
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
