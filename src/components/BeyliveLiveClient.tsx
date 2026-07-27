"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Locale } from "@/i18n";
import {
  BEYLIVE_MATCH_SELECT,
  BeyliveMatch,
  CommunityTournament,
  supabase,
  TOURNAMENT_SELECT,
} from "@/lib/supabase";
import {
  beyliveFormatLabel,
  beyliveParticipantCode,
  beyliveParticipantName,
  beyliveParticipantWon,
  beyliveTeamCode,
  beyliveTeamMembers,
  beyliveTeamName,
  isBeyliveTeamTournament,
  beyliveEventId,
  beylivePlayerCode,
  beyliveStandings,
  beyliveStatusLabel,
  beyliveStreamEmbedUrl,
} from "@/lib/beylive";
import {
  isLocalPartnerLive,
  localPartnerChampion,
  localPartnerConsolationChampion,
  localPartnerGroupedRounds,
  localPartnerMode,
  localPartnerStageLabel,
  localPartnerStandings,
  localPartnerTableLabel,
  localPartnerTeamCode,
  localPartnerTeamName,
  localPartnerTeams,
  LocalPartnerState,
  TeamMatch,
} from "@/lib/beylivePartner";
import { profileDisplayName } from "@/lib/profileName";

function groupByRound(matches: BeyliveMatch[]) {
  const map = new Map<number, BeyliveMatch[]>();
  for (const match of matches) {
    const list = map.get(match.round_no) ?? [];
    list.push(match);
    map.set(match.round_no, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function roundTitle(roundNo: number, matches: BeyliveMatch[], teamMode: boolean) {
  if (!teamMode) return `Round ${roundNo}`;
  const hasChampionship = matches.some((match) => match.bracket === "grand");
  const hasConsolation = matches.some((match) => match.bracket === "losers");
  if (hasChampionship && hasConsolation) return "Playoffs";
  if (hasChampionship) return "Championship";
  if (hasConsolation) return "Consolation";
  return `League Round ${roundNo}`;
}

function MatchCard({ match }: { match: BeyliveMatch }) {
  const players = [...(match.players ?? [])].sort((a, b) => a.slot_no - b.slot_no);
  return (
    <div className={`rounded-md border p-3 ${match.status === "live" ? "border-accent bg-accent/10" : "border-edge bg-panel"}`}>
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
        <span>Table {match.table_no ?? match.match_no} · Match {match.match_no}</span>
        <span className={match.status === "live" ? "text-accent" : match.status === "completed" ? "text-accent-2" : ""}>
          {beyliveStatusLabel(match.status)}
        </span>
      </div>
      <div className="grid gap-1.5">
        {players.map((player) => {
          const won = beyliveParticipantWon(match, player);
          return (
            <div
              key={player.team_id ?? player.user_id}
              className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 ${
                won ? "bg-accent/15 text-accent" : "bg-bg/70 text-ink"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{beyliveParticipantName(player)}</div>
                <div className="text-[10px] text-ink-dim">{beyliveParticipantCode(player)}</div>
              </div>
              <div className="font-display text-3xl font-black">{player.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function localRoundTitle(roundNo: number, matches: TeamMatch[], mode: ReturnType<typeof localPartnerMode>) {
  const hasChampionship = matches.some((match) => match.bracket === "championship");
  const hasConsolation = matches.some((match) => match.bracket === "consolation");
  if (hasChampionship && hasConsolation) return "Playoffs";
  if (matches[0]) return localPartnerStageLabel(matches[0], mode);
  return `Round ${roundNo}`;
}

function LocalPartnerLiveMatchCard({
  match,
  allMatches,
  state,
}: {
  match: TeamMatch;
  allMatches: TeamMatch[];
  state: LocalPartnerState;
}) {
  const completed = match.winner !== null;

  return (
    <div className={`rounded-md border p-3 ${completed ? "border-accent/40 bg-accent/5" : "border-edge bg-panel"}`}>
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
        <span>{localPartnerTableLabel(allMatches, match)}</span>
        <span className={completed ? "text-accent" : ""}>{completed ? "Completed" : "Scheduled"}</span>
      </div>
      <div className="grid gap-1.5">
        {match.teams.length === 1 ? (
          <div className="rounded bg-bg/70 px-2 py-1.5 text-sm text-ink-dim">
            <span className="mr-2 font-mono text-[11px] text-accent-2">
              {localPartnerTeamCode(state, match.teams[0])}
            </span>
            {localPartnerTeamName(state, match.teams[0])} bye
          </div>
        ) : (
          match.teams.map((teamId) => {
            const won = match.winner === teamId;
            return (
              <div
                key={teamId}
                className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 ${
                  won ? "bg-accent/15 text-accent" : "bg-bg/70 text-ink"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{localPartnerTeamName(state, teamId)}</div>
                  <div className="text-[10px] text-ink-dim">{localPartnerTeamCode(state, teamId)}</div>
                </div>
                <div className="font-display text-3xl font-black">{match.scores?.[teamId] ?? 0}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface StreamFeed {
  key: string;
  label: string;
  title: string;
  url: string | null;
}

function StreamPanel({ feeds, hostName }: { feeds: StreamFeed[]; hostName: string }) {
  if (feeds.length === 0) return null;

  return (
    <section className="panel mt-4 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-panel px-4 py-3">
        <div>
          <div className="font-display text-[10px] font-bold tracking-[0.24em] text-accent">LIVE STREAMS</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">
            {feeds.length > 1 ? "Stadium feeds" : feeds[0].title}
          </div>
        </div>
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
          {feeds.length} on air
        </span>
      </div>
      <div className={`grid gap-px bg-edge ${feeds.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {feeds.map((feed) => {
          const embedUrl = beyliveStreamEmbedUrl(feed.url, hostName);
          return (
            <div key={feed.key} className="bg-black">
              <div className="flex items-center justify-between gap-2 bg-panel px-3 py-2">
                <div className="min-w-0">
                  <div className="font-display text-[10px] font-bold uppercase tracking-wider text-accent">
                    {feed.label}
                  </div>
                  <div className="truncate text-xs font-semibold text-ink">{feed.title}</div>
                </div>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                  Live
                </span>
              </div>
              <div className="aspect-video bg-black">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={feed.title}
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink-dim">
                    Stream unavailable
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function BeyliveLiveClient({ id, locale }: { id: string; locale: Locale }) {
  const [tournament, setTournament] = useState<CommunityTournament | null>(null);
  const [matches, setMatches] = useState<BeyliveMatch[]>([]);
  const [localPartnerState, setLocalPartnerState] = useState<LocalPartnerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hostName, setHostName] = useState("localhost");

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
    let active = true;
    const cacheKey = `spindex.partner-battle.${id}`;

    const applyState = (state: LocalPartnerState | null) => {
      if (!active) return;
      setLocalPartnerState(state);
      if (!state) return;
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(state));
      } catch {
        /* cache unavailable */
      }
    };

    const loadPartnerState = async () => {
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (raw) applyState(JSON.parse(raw) as LocalPartnerState);
      } catch {
        /* ignore cache */
      }

      if (!supabase) return;
      const { data } = await supabase
        .from("partner_battles")
        .select("state")
        .eq("tournament_id", id)
        .maybeSingle();
      if (data?.state) applyState(data.state as LocalPartnerState);
    };

    loadPartnerState();

    if (!supabase) {
      return () => {
        active = false;
      };
    }

    const channel = supabase
      .channel(`partner-battle-live-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "partner_battles",
          filter: `tournament_id=eq.${id}`,
        },
        (payload) => {
          const state = (payload.new as { state?: LocalPartnerState } | null)?.state;
          if (state) applyState(state);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase?.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    setHostName(window.location.hostname || "localhost");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`beylive-live-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_matches", filter: `tournament_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_players" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_rounds" }, load)
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [id, load]);

  const dbStandings = useMemo(() => beyliveStandings(tournament, matches), [matches, tournament]);
  const rounds = useMemo(() => groupByRound(matches), [matches]);
  const streamFeeds = useMemo<StreamFeed[]>(() => {
    if (!tournament) return [];
    const stadiumFeeds = [
      {
        key: "stadium1",
        label: "Stadium 1",
        title: tournament.stadium1_stream_title || "Stadium 1",
        url: tournament.stadium1_stream_enabled ? tournament.stadium1_stream_url : null,
      },
      {
        key: "stadium2",
        label: "Stadium 2",
        title: tournament.stadium2_stream_title || "Stadium 2",
        url: tournament.stadium2_stream_enabled ? tournament.stadium2_stream_url : null,
      },
    ].filter((feed) => !!feed.url);

    if (stadiumFeeds.length > 0) return stadiumFeeds;
    if (tournament.stream_enabled && tournament.stream_url) {
      return [
        {
          key: "event",
          label: "Event feed",
          title: tournament.stream_title || "BEYLIVE live feed",
          url: tournament.stream_url,
        },
      ];
    }
    return [];
  }, [tournament]);
  const localPartnerReady = isBeyliveTeamTournament(tournament) && matches.length === 0 && isLocalPartnerLive(localPartnerState);
  const localMode = localPartnerMode(localPartnerState);
  const localRounds = useMemo(() => localPartnerGroupedRounds(localPartnerState), [localPartnerState]);
  const localTeams = useMemo(() => localPartnerTeams(localPartnerState), [localPartnerState]);
  const localChampionId = localPartnerChampion(localPartnerState);
  const localConsolationId = localPartnerConsolationChampion(localPartnerState);
  const localChampion = localChampionId ? localTeams.find((team) => team.id === localChampionId) : null;
  const localConsolation = localConsolationId ? localTeams.find((team) => team.id === localConsolationId) : null;
  const teamMode = isBeyliveTeamTournament(tournament) && ((tournament?.teams?.length ?? 0) > 0 || localPartnerReady);
  const teams = useMemo(
    () =>
      [...(tournament?.teams ?? [])].sort(
        (a, b) => (a.seed ?? a.team_no) - (b.seed ?? b.team_no) || a.team_no - b.team_no,
      ),
    [tournament],
  );
  const displayStandings = useMemo(
    () =>
      localPartnerReady
        ? localPartnerStandings(localPartnerState).map((row) => ({
            id: row.id,
            event_id: row.code,
            name: row.name,
            sub: row.members.join(" / "),
            wins: row.wins,
            losses: row.losses,
            diff: row.diff,
          }))
        : dbStandings.map((row) => ({
            id: row.id,
            event_id: row.event_id,
            name: row.name,
            sub: row.player_code,
            wins: row.wins,
            losses: row.losses,
            diff: row.diff,
          })),
    [dbStandings, localPartnerReady, localPartnerState],
  );

  if (!supabase) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">Supabase is not configured.</div>;
  }
  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">Loading BEYLIVE...</p>;
  if (!tournament) return <p className="py-16 text-center text-sm text-ink-dim">Tournament not found.</p>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/${locale}/tournaments/${id}`} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          Back to tournament
        </Link>
        <Link href={`/${locale}/tournaments/${id}/control`} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
          BEYLIVE Control
        </Link>
      </div>

      <section className="panel bg-grid p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-xs font-bold tracking-[0.28em] text-accent">BEYLIVE ARENA</div>
            <h1 className="mt-2 font-display text-3xl font-black tracking-wide">{tournament.name}</h1>
            <p className="mt-1 text-sm text-ink-dim">
              {tournament.city} · {tournament.venue} · {beyliveFormatLabel(tournament.format)}
            </p>
          </div>
          <div className="rounded-md border border-edge bg-panel px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-dim">Status</div>
            <div className="font-display text-lg font-black text-accent">{beyliveStatusLabel(tournament.status)}</div>
          </div>
        </div>
        {(tournament.winner_team || tournament.winner_profile) && (
          <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 font-display text-sm font-bold tracking-wider text-accent">
            Champion: {tournament.winner_team ? `${beyliveTeamCode(tournament.winner_team)} ${beyliveTeamName(tournament.winner_team)}` : profileDisplayName(tournament.winner_profile)}
          </div>
        )}
        {localPartnerReady && localChampion && !tournament.winner_team && !tournament.winner_profile && (
          <div className="mt-4 space-y-2">
            <div className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 font-display text-sm font-bold tracking-wider text-accent">
              Champion: {localChampion.code} {localChampion.name}
            </div>
            {localConsolation && (
              <div className="rounded-md border border-accent-2/40 bg-accent-2/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2">
                Consolation: {localConsolation.code} {localConsolation.name}
              </div>
            )}
          </div>
        )}
      </section>

      <StreamPanel feeds={streamFeeds} hostName={hostName} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_0.85fr]">
        <div className="grid gap-4">
          {localPartnerReady ? (
            localRounds.map(([roundNo, roundMatches]) => (
              <section key={roundNo} className="panel p-5">
                <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
                  {localRoundTitle(roundNo, roundMatches, localMode)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {roundMatches.map((match) => (
                    <LocalPartnerLiveMatchCard
                      key={match.id}
                      match={match}
                      allMatches={localPartnerState?.matches ?? []}
                      state={localPartnerState ?? {}}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : rounds.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-ink-dim">BEYLIVE has not started yet.</div>
          ) : (
            rounds.map(([roundNo, roundMatches]) => (
              <section key={roundNo} className="panel p-5">
                <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
                  {roundTitle(roundNo, roundMatches, teamMode)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {roundMatches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="panel h-fit p-5">
          <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
            {teamMode ? "Team standings" : "Live standings"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-dim">
                  <th className="py-1 pr-2 text-left font-medium">ID</th>
                  <th className="py-1 pr-2 text-left font-medium">{teamMode ? "Team" : "Player"}</th>
                  <th className="py-1 pr-2 text-right font-medium">W-L</th>
                  <th className="py-1 text-right font-medium">Diff</th>
                </tr>
              </thead>
              <tbody>
                {displayStandings.map((row) => (
                  <tr key={row.id} className="border-t border-edge/60">
                    <td className="py-1.5 pr-2 font-display text-accent">{row.event_id}</td>
                    <td className="py-1.5 pr-2">
                      <div className="text-ink">{row.name}</div>
                      <div className="text-[10px] text-ink-dim">{row.sub}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-ink-dim">{row.wins}-{row.losses}</td>
                    <td className={`py-1.5 text-right font-semibold ${row.diff > 0 ? "text-accent" : row.diff < 0 ? "text-atk" : "text-ink-dim"}`}>
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-md border border-edge bg-bg p-3">
            <div className="font-display text-xs font-bold tracking-wider text-ink-dim">
              {teamMode ? "Team IDs" : "Player IDs"}
            </div>
            {localPartnerReady ? (
              <ol className="mt-2 space-y-1 text-xs text-ink-dim">
                {localTeams.map((team) => (
                  <li key={team.id} className="rounded bg-panel px-2 py-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink">{team.name}</span>
                      <span className="font-mono text-accent-2">{team.code}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-dim">{team.members.join(" / ")}</div>
                  </li>
                ))}
              </ol>
            ) : teamMode ? (
              <ol className="mt-2 space-y-1 text-xs text-ink-dim">
                {teams.map((team) => (
                  <li key={team.id} className="rounded bg-panel px-2 py-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink">{team.name}</span>
                      <span className="font-mono text-accent-2">{beyliveTeamCode(team)}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-dim">{beyliveTeamMembers(team).join(" / ")}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="mt-2 space-y-1 text-xs text-ink-dim">
                {(tournament.players ?? [])
                  .filter((player) => player.status === "joined")
                  .sort((a, b) => (a.seed ?? 999999) - (b.seed ?? 999999))
                  .map((player, index) => (
                    <li key={player.user_id} className="flex justify-between gap-2 rounded bg-panel px-2 py-1">
                      <span>{beyliveEventId(player, index)} {profileDisplayName(player.profile)}</span>
                      <span className="font-mono text-accent-2">{beylivePlayerCode(player.profile)}</span>
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
