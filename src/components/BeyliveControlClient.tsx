"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  BEYLIVE_MATCH_SELECT,
  BeyliveMatch,
  CommunityTournament,
  supabase,
  TournamentPlayer,
  TOURNAMENT_SELECT,
} from "@/lib/supabase";
import {
  beyliveEventId,
  beyliveFormatLabel,
  beyliveParticipantCode,
  beyliveParticipantName,
  beylivePlayerCode,
  beyliveQrValue,
  beyliveTeamCode,
  beyliveTeamMembers,
  beyliveTeamQrValue,
  findBeyliveTeamByScan,
  findTournamentPlayerByScan,
  isBeyliveTeamTournament,
} from "@/lib/beylive";
import { profileDisplayName } from "@/lib/profileName";
import BeyliveScanner from "./BeyliveScanner";
import QrCodeBadge from "./QrCodeBadge";

function PlayerRow({
  player,
  index,
  active,
}: {
  player: TournamentPlayer;
  index: number;
  active: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 ${active ? "border-accent bg-accent/10" : "border-edge bg-panel"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xs font-bold text-accent">{beyliveEventId(player, index)}</div>
          <div className="truncate text-sm font-semibold">{profileDisplayName(player.profile)}</div>
          <div className="font-mono text-[11px] text-ink-dim">{beylivePlayerCode(player.profile)}</div>
        </div>
        <QrCodeBadge value={beyliveQrValue(player.profile)} label="BEYLIVE" size={72} />
      </div>
    </div>
  );
}

function TeamRow({
  team,
  active,
}: {
  team: NonNullable<CommunityTournament["teams"]>[number];
  active: boolean;
}) {
  const members = beyliveTeamMembers(team);
  return (
    <div className={`rounded-md border p-3 ${active ? "border-accent bg-accent/10" : "border-edge bg-panel"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xs font-bold text-accent">{beyliveTeamCode(team)}</div>
          <div className="truncate text-sm font-semibold">{team.name}</div>
          <div className="truncate text-[11px] text-ink-dim">{members.join(" / ")}</div>
        </div>
        <QrCodeBadge value={beyliveTeamQrValue(team)} label="BEYLIVE" size={72} />
      </div>
    </div>
  );
}

function matchStageLabel(match: BeyliveMatch, teamMode: boolean) {
  if (!teamMode) return `Round ${match.round_no}`;
  if (match.bracket === "grand") return "Championship";
  if (match.bracket === "losers") return "Consolation";
  return `League R${match.round_no}`;
}

export default function BeyliveControlClient({ id, locale }: { id: string; locale: Locale }) {
  const { enabled, profile } = useAuth();
  const [tournament, setTournament] = useState<CommunityTournament | null>(null);
  const [matches, setMatches] = useState<BeyliveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"start" | "advance" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: tData }, { data: mData }] = await Promise.all([
      supabase.from("tournaments").select(TOURNAMENT_SELECT).eq("id", id).maybeSingle(),
      supabase
        .from("beylive_matches")
        .select(BEYLIVE_MATCH_SELECT)
        .eq("tournament_id", id)
        .order("round_no", { ascending: true })
        .order("match_no", { ascending: true }),
    ]);
    setTournament((tData as unknown as CommunityTournament | null) ?? null);
    setMatches((mData as unknown as BeyliveMatch[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`beylive-control-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_matches", filter: `tournament_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_players" }, load)
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [id, load]);

  const players = useMemo(
    () =>
      [...(tournament?.players ?? [])]
        .filter((player) => player.status === "joined")
        .sort((a, b) => (a.seed ?? 999999) - (b.seed ?? 999999)),
    [tournament],
  );
  const scannedPlayer = useMemo(
    () => findTournamentPlayerByScan(players, scanValue),
    [players, scanValue],
  );
  const teamMode = isBeyliveTeamTournament(tournament) && (tournament?.teams?.length ?? 0) > 0;
  const teams = useMemo(
    () =>
      [...(tournament?.teams ?? [])].sort(
        (a, b) => (a.seed ?? a.team_no) - (b.seed ?? b.team_no) || a.team_no - b.team_no,
      ),
    [tournament],
  );
  const scannedTeam = useMemo(
    () => findBeyliveTeamByScan(teams, scanValue),
    [teams, scanValue],
  );
  const isHost = !!profile && profile.id === tournament?.host;
  const currentRound = tournament?.current_round ?? 1;
  const currentRoundMatches = matches.filter((match) => match.round_no === currentRound);
  const scanFound = teamMode ? !!scannedTeam : !!scannedPlayer;
  const canAdvance =
    currentRoundMatches.length > 0 &&
    currentRoundMatches.every((match) => match.status === "completed" || match.status === "cancelled");

  const run = async (kind: "start" | "advance") => {
    if (!supabase || !tournament) return;
    setBusy(kind);
    setError(null);
    const { error: err } =
      kind === "start"
        ? await supabase.rpc("start_beylive", { tid: tournament.id })
        : await supabase.rpc("advance_beylive_round", { tid: tournament.id });
    setBusy(null);
    if (err) {
      setError(err.message.replace(/_/g, " "));
      return;
    }
    load();
  };

  if (!enabled || !supabase) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">Supabase is not configured.</div>;
  }
  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">Loading BEYLIVE Control...</p>;
  if (!tournament) return <p className="py-16 text-center text-sm text-ink-dim">Tournament not found.</p>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/${locale}/tournaments/${id}`} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          Back to tournament
        </Link>
        <Link href={`/${locale}/tournaments/${id}/live`} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
          Public BEYLIVE
        </Link>
      </div>

      <section className="panel bg-grid p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-xs font-bold tracking-[0.28em] text-accent">BEYLIVE CONTROL</div>
            <h1 className="mt-2 font-display text-3xl font-black tracking-wide">{tournament.name}</h1>
            <p className="mt-1 text-sm text-ink-dim">
              {tournament.city} · {tournament.venue} · {beyliveFormatLabel(tournament.format)}
            </p>
          </div>
          <div className="rounded-md border border-edge bg-panel px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-dim">Round</div>
            <div className="font-display text-lg font-black text-accent">{tournament.current_round ?? "-"}</div>
          </div>
        </div>
        {!isHost && (
          <p className="mt-4 rounded-md border border-bal/40 bg-bal/10 px-4 py-3 text-sm text-bal">
            Only the tournament host can start BEYLIVE or score matches right now.
          </p>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-atk">{error}</p>}
        {isHost && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => run("start")}
              disabled={busy !== null || matches.length > 0 || players.length < 2}
              className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              {busy === "start" ? "Starting..." : "Start BEYLIVE"}
            </button>
            <button
              onClick={() => run("advance")}
              disabled={busy !== null || !canAdvance || tournament.status === "completed"}
              className="clip-x border border-accent-2/50 bg-accent-2/10 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-accent-2 transition enabled:hover:bg-accent-2/20 disabled:opacity-40"
            >
              {busy === "advance" ? "Advancing..." : "Advance / Finalize"}
            </button>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.35fr]">
        <aside className="grid gap-4">
          <BeyliveScanner
            onScan={(value) => {
              setScanValue(value);
            }}
          />
          {scanValue && (
            <div className={`rounded-md border p-4 ${scanFound ? "border-accent bg-accent/10" : "border-atk bg-atk/10"}`}>
              <div className="font-display text-xs font-bold tracking-wider text-ink-dim">Scan result</div>
              {teamMode && scannedTeam ? (
                <div className="mt-2">
                  <div className="font-display text-lg font-black text-accent">{beyliveTeamCode(scannedTeam)}</div>
                  <div className="font-semibold">{scannedTeam.name}</div>
                  <div className="text-xs text-ink-dim">{beyliveTeamMembers(scannedTeam).join(" / ")}</div>
                </div>
              ) : !teamMode && scannedPlayer ? (
                <div className="mt-2">
                  <div className="font-display text-lg font-black text-accent">
                    {beyliveEventId(scannedPlayer, players.indexOf(scannedPlayer))}
                  </div>
                  <div className="font-semibold">{profileDisplayName(scannedPlayer.profile)}</div>
                  <div className="font-mono text-xs text-ink-dim">{beylivePlayerCode(scannedPlayer.profile)}</div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-atk">No {teamMode ? "team" : "player"} found for {scanValue}</p>
              )}
            </div>
          )}
          <div className="panel p-4">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
              {teamMode ? "Team IDs and QR" : "Player IDs and QR"}
            </div>
            <div className="grid gap-2">
              {teamMode
                ? teams.map((team) => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      active={scannedTeam?.id === team.id}
                    />
                  ))
                : players.map((player, index) => (
                    <PlayerRow
                      key={player.user_id}
                      player={player}
                      index={index}
                      active={scannedPlayer?.user_id === player.user_id}
                    />
                  ))}
            </div>
          </div>
        </aside>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-display text-sm font-bold tracking-wider text-ink-dim">Match control</div>
            <div className="text-xs text-ink-dim">{matches.length} matches</div>
          </div>
          {matches.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-dim">Start BEYLIVE to generate matches from the existing tournament format.</p>
          ) : (
            <div className="grid gap-3">
              {matches.map((match) => {
                const matchPlayers = [...(match.players ?? [])].sort((a, b) => a.slot_no - b.slot_no);
                return (
                  <div key={match.id} className="rounded-md border border-edge bg-panel p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-ink-dim">
                        {matchStageLabel(match, teamMode)} · Table {match.table_no ?? match.match_no} · Match {match.match_no}
                      </div>
                      <span className={`text-xs font-bold ${match.status === "live" ? "text-accent" : "text-ink-dim"}`}>
                        {match.status}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {matchPlayers.map((player) => (
                        <div key={player.team_id ?? player.user_id} className="flex items-center justify-between rounded bg-bg px-2 py-1.5">
                          <span className="min-w-0 truncate text-sm">
                            <span className="mr-2 font-mono text-[11px] text-accent-2">{beyliveParticipantCode(player)}</span>
                            {beyliveParticipantName(player)}
                          </span>
                          <span className="font-display text-xl font-black text-accent">{player.score}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/${locale}/tournaments/${id}/matches/${match.id}`}
                        className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
                      >
                        Score
                      </Link>
                      <Link
                        href={`/${locale}/tournaments/${id}/live`}
                        className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink"
                      >
                        View live
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
