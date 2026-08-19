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

const CARD_WIDTH = 256;
const CARD_HEIGHT = 126;
const COLUMN_GAP = 96;
const ROW_STEP = 168;
const HEADER_HEIGHT = 34;
const BOTTOM_PADDING = 18;

interface BracketRound {
  roundNo: number;
  label: string;
  matches: BeyliveMatch[];
}

interface PositionedMatch {
  match: BeyliveMatch;
  title: string;
  x: number;
  y: number;
  centerY: number;
}

interface PositionedRound {
  roundNo: number;
  label: string;
  x: number;
  matches: PositionedMatch[];
}

interface BracketConnection {
  id: string;
  d: string;
  active: boolean;
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

function nextMatchNo(matchNo: number) {
  return Math.max(1, Math.ceil(matchNo / 2));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bracketMatchTitle(round: BracketRound, match: BeyliveMatch) {
  if (round.matches.length <= 1) return round.label;
  const suffix = round.label.startsWith("Round of") ? ` #${match.match_no}` : ` ${match.match_no}`;
  return `${round.label}${suffix}`;
}

function buildBracketLayout(rounds: BracketRound[]) {
  const positionedRounds: PositionedRound[] = [];
  const positionsById = new Map<string, PositionedMatch>();

  rounds.forEach((round, roundIndex) => {
    const x = roundIndex * (CARD_WIDTH + COLUMN_GAP);
    const matches = round.matches.map((match) => {
      const matchSlot = Math.max(0, match.match_no - 1);
      const idealSpan = 2 ** roundIndex;
      const idealCenterSlot = matchSlot * idealSpan + (idealSpan - 1) / 2;
      const fallbackCenterY = HEADER_HEIGHT + CARD_HEIGHT / 2 + idealCenterSlot * ROW_STEP;
      let centerY = fallbackCenterY;

      if (roundIndex > 0) {
        const previousRound = rounds[roundIndex - 1];
        const sourceCenters = previousRound.matches
          .filter((source) => nextMatchNo(source.match_no) === match.match_no)
          .map((source) => positionsById.get(source.id)?.centerY)
          .filter((value): value is number => typeof value === "number");

        if (sourceCenters.length > 1) centerY = average(sourceCenters);
      }

      const positioned = {
        match,
        title: bracketMatchTitle(round, match),
        x,
        y: centerY - CARD_HEIGHT / 2,
        centerY,
      };
      positionsById.set(match.id, positioned);
      return positioned;
    });

    positionedRounds.push({ roundNo: round.roundNo, label: round.label, x, matches });
  });

  const connections: BracketConnection[] = [];
  positionedRounds.forEach((round, roundIndex) => {
    const nextRound = positionedRounds[roundIndex + 1];
    if (!nextRound) return;

    round.matches.forEach((source) => {
      const target = nextRound.matches.find((candidate) => candidate.match.match_no === nextMatchNo(source.match.match_no));
      if (!target) return;

      const startX = source.x + CARD_WIDTH;
      const endX = target.x;
      const midX = startX + (endX - startX) / 2;
      connections.push({
        id: `${source.match.id}-${target.match.id}`,
        d: `M ${startX} ${source.centerY} H ${midX} V ${target.centerY} H ${endX}`,
        active: source.match.status === "completed" || target.match.status === "live" || target.match.status === "completed",
      });
    });
  });

  const width = rounds.length * CARD_WIDTH + Math.max(0, rounds.length - 1) * COLUMN_GAP;
  const bottom = Math.max(
    HEADER_HEIGHT + CARD_HEIGHT,
    ...positionedRounds.flatMap((round) => round.matches.map((match) => match.y + CARD_HEIGHT)),
  );

  return {
    width,
    height: bottom + BOTTOM_PADDING,
    rounds: positionedRounds,
    connections,
  };
}

function MatchNode({
  match,
  title,
  locale,
  tournamentId,
  currentRound,
}: {
  match: BeyliveMatch;
  title: string;
  locale: Locale;
  tournamentId: string;
  currentRound?: number;
}) {
  const players = [...(match.players ?? [])].sort((a, b) => a.slot_no - b.slot_no);
  const href = `/${locale}/tournaments/${tournamentId}/matches/${match.id}`;

  return (
    <Link
      href={href}
      aria-label={`${title}, table ${match.table_no ?? match.match_no}`}
      className={`block rounded-md border p-2.5 transition hover:border-accent/70 ${matchTone(match, currentRound)}`}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-2">
        <span
          className="min-w-0 truncate font-display text-[10px] font-bold uppercase tracking-wider text-ink-dim"
          title={`Table ${match.table_no ?? match.match_no} · Match ${match.match_no}`}
        >
          {title}
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
            title="3rd Place"
            locale={locale}
            tournamentId={tournamentId}
            currentRound={currentRound}
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

  const layout = buildBracketLayout(rounds);
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

      <div className="thin-scroll overflow-x-auto pb-2">
        <div
          className="relative min-w-max"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className="pointer-events-none absolute inset-0 z-0"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.connections.map((connection) => (
              <path
                key={connection.id}
                d={connection.d}
                fill="none"
                stroke={connection.active ? "rgba(0, 229, 143, 0.48)" : "rgba(56, 217, 255, 0.24)"}
                strokeWidth={connection.active ? 2 : 1.5}
                strokeLinecap="square"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {layout.rounds.map((round) => (
            <div key={round.roundNo}>
              <div
                className="absolute top-0 z-10 flex items-center justify-between gap-2"
                style={{ left: round.x, width: CARD_WIDTH }}
              >
                <div className="min-w-0 truncate font-display text-xs font-bold uppercase tracking-wider text-accent-2">
                  {round.label}
                </div>
                <div className="shrink-0 text-[10px] font-semibold text-ink-dim">
                  {round.matches.length}
                </div>
              </div>
              {round.matches.map((positioned) => (
                <div
                  key={positioned.match.id}
                  className="absolute z-10"
                  style={{ left: positioned.x, top: positioned.y }}
                >
                  <MatchNode
                    match={positioned.match}
                    title={positioned.title}
                    locale={locale}
                    tournamentId={tournamentId}
                    currentRound={currentRound}
                  />
                </div>
              ))}
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
