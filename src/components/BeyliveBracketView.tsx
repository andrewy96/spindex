"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "@/i18n";
import type { BeyliveMatch } from "@/lib/supabase";
import { tournamentPath } from "@/lib/tournamentRouting";
import { buildBeyliveBracket, layoutBeyliveBracket, type BracketNode } from "@/lib/beyliveBracket";
import {
  beyliveParticipantCode, beyliveParticipantName, beyliveParticipantWon,
  beyliveStatusLabel, isBeyliveByeMatch,
} from "@/lib/beylive";

function MatchCard({ node, locale, tournamentId, currentRound, graph = false }: {
  node: BracketNode; locale: Locale; tournamentId: string; currentRound?: number; graph?: boolean;
}) {
  const match = node.actual;
  const tone = match?.status === "live" ? "border-accent bg-accent/10"
    : match?.status === "completed" ? "border-accent/35 bg-accent/5"
    : match && currentRound === node.roundNo ? "border-accent-2/45 bg-accent-2/5"
    : "border-edge bg-panel";
  return (
    <article id={node.id} className={`scroll-mt-20 overflow-hidden rounded-md border p-3 ${graph ? "h-[196px]" : ""} ${tone}`}>
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
                <div className="truncate text-xs font-semibold">
                  {player ? beyliveParticipantName(player) : slot?.source || "Awaiting opponent"}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-ink-dim">
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
  const [zoom, setZoom] = useState(1);
  const markerId = useId().replace(/:/g, "");
  const rounds = buildBeyliveBracket(matches);
  if (!rounds.length) return null;
  const preliminary = rounds[0].label === "Preliminary" ? rounds[0] : undefined;
  const byes = preliminary?.nodes.filter((n) => n.bye) ?? [];
  const playIns = preliminary?.nodes.filter((n) => !n.bye) ?? [];
  const layout = layoutBeyliveBracket(rounds);
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

        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-dim">Follow the arrows from each player or match to the next round. Green = advanced / bye. Cyan = winner to be decided.</p>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" aria-label="Zoom out bracket" onClick={() => setZoom(z => Math.max(0.25, +(z - 0.15).toFixed(2)))} className="rounded border border-edge px-3 py-2">&minus;</button>
          <span className="min-w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in bracket" onClick={() => setZoom(z => Math.min(1.3, +(z + 0.15).toFixed(2)))} className="rounded border border-edge px-3 py-2">+</button>
          <button type="button" onClick={() => setZoom(1)} className="rounded border border-edge px-3 py-2">Reset</button>
        </div>
      </div>
      <div role="region" aria-label="Tournament bracket with advancement arrows" tabIndex={0} className="max-h-[75vh] overflow-auto rounded-md border border-edge bg-bg/30 p-3">
        <div style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div className="relative origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
              <defs>
                <marker id={`${markerId}-pending`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#38d9ff" /></marker>
                <marker id={`${markerId}-advanced`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#00e58f" /></marker>
              </defs>
              {layout.connections.map(edge => <path key={edge.sourceId} data-source={edge.sourceId} data-target={edge.targetId} d={edge.d} fill="none" stroke={edge.advanced ? "#00e58f" : "#38d9ff"} strokeWidth="2" markerEnd={`url(#${markerId}-${edge.advanced ? "advanced" : "pending"})`} />)}
            </svg>
            {rounds.map((round, index) => <h3 key={round.roundNo} className="absolute top-0 font-display text-sm font-bold text-accent-2" style={{ left: index * (layout.cardWidth + layout.columnGap), width: layout.cardWidth }}>{round.label === "Preliminary" ? "Preliminary / Byes" : round.label}</h3>)}
            {layout.cards.map(({node,x,y,height}) => <div key={node.id} className="absolute" style={{left:x,top:y,width:layout.cardWidth,height}}>
              {node.bye ? <article id={node.id} className="h-full overflow-hidden rounded-md border border-accent/50 bg-panel p-3">
                <div className="text-[10px] font-bold uppercase text-accent">BYE &middot; Advanced</div>
                <div className="mt-1 truncate text-sm font-semibold text-ink">{node.slots[0]?.player ? beyliveParticipantName(node.slots[0].player) : "Qualified player"}</div>
                <a href={`#${node.next?.id}`} className="mt-1 block text-xs text-accent hover:underline">BYE &rarr; {node.next?.title}</a>
              </article> : <MatchCard node={node} {...cardProps} graph />}
            </div>)}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-dim">Scroll across and down to follow the bracket. Use &minus; to see more rounds at once.</p>

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
