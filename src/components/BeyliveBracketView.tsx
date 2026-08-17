"use client";

import Link from "next/link";
import { Locale } from "@/i18n";
import { BeyliveMatch } from "@/lib/supabase";
import {
  beyliveKnockoutRoundLabels,
  beyliveParticipantCode,
  beyliveParticipantName,
  beyliveParticipantWon,
  beyliveStatusLabel,
  isBeyliveByeMatch,
} from "@/lib/beylive";

interface BracketRound {
  roundNo: number;
  label: string;
  matches: BeyliveMatch[];
}

function groupBracketRounds(matches: BeyliveMatch[]) {
  const labels = beyliveKnockoutRoundLabels(matches);
  const byRound = new Map<number, BeyliveMatch[]>();

  for (const match of matches) {
    if (match.bracket !== "main" || isBeyliveByeMatch(match)) continue;
    const list = byRound.get(match.round_no);
    if (list) list.push(match);
    else byRound.set(match.round_no, [match]);
  }

  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([roundNo, roundMatches]) => ({
      roundNo,
      label: labels.get(roundNo) ?? `Round ${roundNo}`,
      matches: [...roundMatches].sort((a, b) => a.match_no - b.match_no),
    }));
}

function matchTone(match: BeyliveMatch, currentRound?: number) {
  if (match.status === "live") return "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(0,255,163,0.12)]";
  if (match.status === "completed") return "border-accent/35 bg-accent/5";
  if (currentRound === match.round_no) return "border-accent-2/45 bg-accent-2/10";
  return "border-edge bg-panel";
}

function MatchNode({
  match,
  locale,
  tournamentId,
  currentRound,
  lastRound,
}: {
  match: BeyliveMatch;
  locale: Locale;
  tournamentId: string;
  currentRound?: number;
  lastRound: boolean;
}) {
  const players = [...(match.players ?? [])].sort((a, b) => a.slot_no - b.slot_no);
  const href = `/${locale}/tournaments/${tournamentId}/matches/${match.id}`;

  return (
    <div className="relative">
      <Link
        href={href}
        className={`block h-[7.8rem] w-64 rounded-md border p-2.5 transition hover:border-accent/70 ${matchTone(match, currentRound)}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-display text-[10px] font-bold uppercase tracking-wider text-ink-dim">
            Match {match.match_no}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${match.status === "live" ? "text-accent" : "text-ink-dim"}`}>
            {beyliveStatusLabel(match.status)}
          </span>
        </div>
        <div className="grid gap-1.5">
          {[0, 1].map((index) => {
            const player = players[index];
            const won = player ? beyliveParticipantWon(match, player) : false;
            return (
              <div
                key={player?.team_id ?? player?.user_id ?? `empty-${index}`}
                className={`grid min-h-10 grid-cols-[1fr_auto] items-center gap-2 rounded px-2 py-1.5 ${
                  won ? "bg-accent/15 text-accent" : player ? "bg-bg/80 text-ink" : "border border-dashed border-edge/80 text-ink-dim"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {player ? beyliveParticipantName(player) : "Awaiting opponent"}
                  </div>
                  <div className="truncate font-mono text-[10px] text-accent-2">
                    {player ? beyliveParticipantCode(player) : "TBD"}
                  </div>
                </div>
                <div className={`font-display text-xl font-black ${won ? "text-accent" : "text-ink-dim"}`}>
                  {player?.score ?? "-"}
                </div>
              </div>
            );
          })}
        </div>
      </Link>
      {!lastRound && (
        <span className="pointer-events-none absolute left-full top-1/2 hidden h-px w-6 bg-edge md:block" />
      )}
    </div>
  );
}

function ThirdPlace({
  matches,
  locale,
  tournamentId,
  currentRound,
}: {
  matches: BeyliveMatch[];
  locale: Locale;
  tournamentId: string;
  currentRound?: number;
}) {
  const thirdPlace = matches
    .filter((match) => match.bracket === "losers" && !isBeyliveByeMatch(match))
    .sort((a, b) => a.round_no - b.round_no || a.match_no - b.match_no);

  if (thirdPlace.length === 0) return null;

  return (
    <div className="mt-4 border-t border-edge pt-4">
      <div className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-accent-2">
        3rd Place
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {thirdPlace.map((match) => (
          <MatchNode
            key={match.id}
            match={match}
            locale={locale}
            tournamentId={tournamentId}
            currentRound={currentRound}
            lastRound
          />
        ))}
      </div>
    </div>
  );
}

export default function BeyliveBracketView({
  matches,
  locale,
  tournamentId,
  currentRound,
  className = "",
}: {
  matches: BeyliveMatch[];
  locale: Locale;
  tournamentId: string;
  currentRound?: number;
  className?: string;
}) {
  const rounds = groupBracketRounds(matches);
  if (rounds.length === 0) return null;

  const firstRoundSize = Math.max(...rounds.map((round) => round.matches.length));
  const bracketHeight = Math.max(280, firstRoundSize * 144);
  const visibleMatchCount = rounds.reduce((sum, round) => sum + round.matches.length, 0);
  const completedMatchCount = rounds.reduce(
    (sum, round) => sum + round.matches.filter((match) => match.status === "completed").length,
    0,
  );
  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound?.matches.find((match) => match.status === "completed" && match.winner_id);
  const champion = finalMatch?.players?.find((player) => player.user_id === finalMatch.winner_id);

  return (
    <section className={`panel p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold tracking-wider text-ink">Bracket overview</div>
          <div className="mt-1 text-xs text-ink-dim">
            {completedMatchCount}/{visibleMatchCount} matches complete
          </div>
        </div>
        {champion && (
          <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-dim">Winner</div>
            <div className="max-w-56 truncate font-display text-sm font-bold text-accent">
              {beyliveParticipantName(champion)}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {rounds.map((round: BracketRound, roundIndex) => (
            <div key={round.roundNo} className="w-64 shrink-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="font-display text-xs font-bold uppercase tracking-wider text-accent-2">
                  {round.label}
                </div>
                <div className="text-[10px] font-semibold text-ink-dim">
                  {round.matches.length}
                </div>
              </div>
              <div
                className="flex flex-col justify-around gap-4"
                style={{ minHeight: `${bracketHeight}px` }}
              >
                {round.matches.map((match) => (
                  <MatchNode
                    key={match.id}
                    match={match}
                    locale={locale}
                    tournamentId={tournamentId}
                    currentRound={currentRound}
                    lastRound={roundIndex === rounds.length - 1}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ThirdPlace
        matches={matches}
        locale={locale}
        tournamentId={tournamentId}
        currentRound={currentRound}
      />
    </section>
  );
}
