"use client";

import Link from "next/link";
import type { Locale } from "@/i18n";
import type { BeyliveMatch } from "@/lib/supabase";
import { tournamentPath } from "@/lib/tournamentRouting";
import { buildBeyliveBracket, type BracketNode } from "@/lib/beyliveBracket";
import {
  beyliveParticipantCode, beyliveParticipantName, beyliveParticipantWon,
  beyliveStatusLabel, isBeyliveByeMatch,
} from "@/lib/beylive";

function MatchCard({ node, locale, tournamentId, currentRound }: {
  node: BracketNode; locale: Locale; tournamentId: string; currentRound?: number;
}) {
  const match = node.actual;
  const tone = match?.status === "live" ? "border-accent bg-accent/10"
    : match?.status === "completed" ? "border-accent/35 bg-accent/5"
    : match && currentRound === node.roundNo ? "border-accent-2/45 bg-accent-2/5"
    : "border-edge bg-panel";
  return (
    <article id={node.id} className={`scroll-mt-20 rounded-md border p-3 ${tone}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        {match ? (
          <Link href={tournamentPath(locale, null, `/matches/${match.id}`, tournamentId)}
            className="font-display text-xs font-bold text-accent-2 hover:underline">
            {node.title}
          </Link>
        ) : <div className="font-display text-xs font-bold text-ink-dim">{node.title}</div>}
        <span className="shrink-0 text-[10px] font-bold uppercase text-ink-dim">
          {match ? beyliveStatusLabel(match.status) : "Upcoming"}
        </span>
      </div>
      <div className="grid gap-1.5">
        {[0, 1].map((index) => {
          const slot = node.slots[index];
          const player = slot?.player;
          const won = match && player ? beyliveParticipantWon(match, player) : false;
          return (
            <div key={index} className={`flex min-h-12 items-center justify-between gap-2 rounded px-2 py-1.5 ${
              won ? "bg-accent/15 text-accent" : player ? "bg-bg text-ink" : "border border-dashed border-edge text-ink-dim"
            }`}>
              <div className="min-w-0">
                <div className="break-words text-xs font-semibold">
                  {player ? beyliveParticipantName(player) : slot?.source || "Awaiting opponent"}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-dim">
                  {player ? [beyliveParticipantCode(player), slot?.source].filter(Boolean).join(" · ") : "To be decided"}
                </div>
              </div>
              {match && player && <span className="font-display text-lg font-bold">{player.score}</span>}
            </div>
          );
        })}
      </div>
      {node.next && (
        <a href={`#${node.next.id}`} className="mt-2 block text-xs text-accent-2 hover:underline">
          {match?.status === "completed" ? "Winner advances" : "Winner goes"} → {node.next.title}
        </a>
      )}
    </article>
  );
}

export default function BeyliveBracketView({
  matches, locale, tournamentId, currentRound, className = "", framed = true, showHeader = true,
}: {
  matches: BeyliveMatch[]; locale: Locale; tournamentId: string; currentRound?: number;
  className?: string; framed?: boolean; showHeader?: boolean;
}) {
  const rounds = buildBeyliveBracket(matches);
  if (!rounds.length) return null;
  const preliminary = rounds[0].label === "Preliminary" ? rounds[0] : undefined;
  const byes = preliminary?.nodes.filter((n) => n.bye) ?? [];
  const playIns = preliminary?.nodes.filter((n) => !n.bye) ?? [];
  const bracketRounds = preliminary ? rounds.slice(1) : rounds;
  const actualMatches = matches.filter((m) => m.bracket === "main" && !isBeyliveByeMatch(m));
  const completed = actualMatches.filter((m) => m.status === "completed").length;
  const final = rounds[rounds.length - 1].nodes[0]?.actual;
  const champion = rounds[rounds.length - 1].label === "Final" && final?.status === "completed"
    ? final.players?.find((p) => beyliveParticipantWon(final, p)) : undefined;
  const thirdPlace = matches.filter((m) => m.bracket === "losers" && !isBeyliveByeMatch(m));
  const cardProps = { locale, tournamentId, currentRound };

  return (
    <section className={`${framed ? "panel p-5" : ""} ${className}`}>
      {showHeader && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-display text-sm font-bold text-ink">Bracket overview</div>
            <div className="mt-1 text-xs text-ink-dim">{completed}/{actualMatches.length} generated matches complete</div>
          </div>
          {champion && <div className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            Champion: {beyliveParticipantName(champion)}
          </div>}
        </div>
      )}

      {preliminary && (
        <div className="mb-5 space-y-4">
          <div className="rounded-md border border-accent-2/30 bg-accent-2/5 p-3 text-sm text-ink">
            <strong>Preliminary / Play-In:</strong> {playIns.length * 2} players play {playIns.length} matches.
            {" "}{byes.length} players have byes to {rounds[1]?.label}.
          </div>
          <details open className="rounded-md border border-edge p-3">
            <summary className="cursor-pointer font-display text-sm font-bold text-accent">
              Byes to {rounds[1]?.label} — {byes.length} players
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {byes.map((bye) => {
                const player = bye.slots[0]?.player;
                return <a key={bye.id} href={`#${bye.next?.id}`} className="rounded border border-accent/25 bg-accent/5 p-2 hover:border-accent">
                  <div className="text-sm font-semibold text-ink">{player ? beyliveParticipantName(player) : "Qualified player"}</div>
                  <div className="text-[10px] text-ink-dim">{player ? beyliveParticipantCode(player) : ""}</div>
                  <div className="mt-1 text-xs text-accent">BYE → {bye.next?.title}</div>
                </a>;
              })}
            </div>
          </details>
          <div>
            <h3 className="mb-3 font-display text-sm font-bold text-accent-2">Preliminary matches — {playIns.length}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {playIns.map((node) => <MatchCard key={node.id} node={node} {...cardProps} />)}
            </div>
          </div>
        </div>
      )}

      <p className="mb-3 text-xs text-ink-dim">Follow each match’s advancement link. Upcoming cards show known qualifiers and the match winners still to be decided. Scroll horizontally to see later rounds.</p>
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {bracketRounds.map((round) => (
          <section key={round.roundNo} className="w-72 shrink-0 space-y-3">
            <h3 className="font-display text-sm font-bold text-accent-2">{round.label} · {round.nodes.length} {round.nodes.length === 1 ? "match" : "matches"}</h3>
            {round.nodes.map((node) => <MatchCard key={node.id} node={node} {...cardProps} />)}
          </section>
        ))}
      </div>

      {thirdPlace.length > 0 && (
        <div className="mt-4 border-t border-edge pt-4">
          <h3 className="mb-3 font-display text-sm font-bold text-accent-2">3rd Place</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {thirdPlace.map((m) => <MatchCard key={m.id} {...cardProps} node={{
              id: `third-place-${m.id}`, title: "3rd Place", roundNo: m.round_no, matchNo: m.match_no,
              actual: m, bye: false,
              slots: [...(m.players ?? [])].sort((a,b) => a.slot_no-b.slot_no).map((player) => ({player,source:""})),
            }} />)}
          </div>
        </div>
      )}
    </section>
  );
}
