"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  BEYLIVE_MATCH_SELECT,
  BeyliveJudge,
  BeyliveMatch,
  BeyliveTeam,
  CommunityTournament,
  Finish,
  supabase,
  TournamentPlayer,
  TOURNAMENT_SELECT,
} from "@/lib/supabase";
import {
  BEYLIVE_FINISHES,
  beyliveEventId,
  beyliveFormatLabel,
  beyliveGroupPools,
  beyliveKnockoutRoundLabel,
  beyliveKnockoutRoundLabels,
  beylivePodium,
  beyliveParticipantCode,
  beyliveParticipantName,
  beyliveParticipantWon,
  beylivePlayerCode,
  beyliveQrValue,
  beyliveTeamCode,
  beyliveTeamMembers,
  beyliveTeamQrValue,
  findBeyliveTeamByScan,
  findTournamentPlayerByScan,
  isBeyliveGroupStageTournament,
  isBeyliveByeMatch,
  isBeyliveTeamTournament,
} from "@/lib/beylive";
import {
  findLocalPartnerTeamByScan,
  isLocalPartnerLive,
  localPartnerDisplayMatches,
  localPartnerMode,
  localPartnerStageLabel,
  localPartnerTableLabel,
  localPartnerTeamCode,
  localPartnerTeamName,
  localPartnerTeams,
  LocalDisplayTeam,
  LocalPartnerState,
  PARTNER_WIN_SCORE,
  scoreLocalPartnerMatch,
  TeamMatch,
} from "@/lib/beylivePartner";
import { profileDisplayName } from "@/lib/profileName";
import BeyliveScanner from "./BeyliveScanner";
import BeyliveBracketView from "./BeyliveBracketView";
import QrCodeBadge from "./QrCodeBadge";
import SharePodiumModal from "./SharePodiumModal";
import { PodiumCardData, shareDateLabel } from "@/lib/shareCard";

const BEYLIVE_JUDGE_SELECT =
  "*, profile:profiles!beylive_judges_user_id_fkey(*)";

type ScannedParticipant = {
  kind: "player" | "team" | "local-team";
  id: string;
  code: string;
  name: string;
};

function activeMatchRank(match: BeyliveMatch, currentRound: number) {
  if (match.status === "completed" || match.status === "cancelled") return 3;
  if (match.round_no === currentRound) return 0;
  if (match.status === "live") return 1;
  return 2;
}

function matchHasScannedParticipant(match: BeyliveMatch, participant: ScannedParticipant) {
  if (participant.kind === "team") {
    return match.players?.some((player) => player.team_id === participant.id) ?? false;
  }
  if (participant.kind === "player") {
    return match.players?.some((player) => player.user_id === participant.id) ?? false;
  }
  return false;
}

function findMatchByScannedParticipants(
  matches: BeyliveMatch[],
  participants: ScannedParticipant[],
  currentRound: number,
) {
  if (participants.length !== 2) return null;
  return (
    [...matches]
      .filter((match) => match.status !== "completed" && match.status !== "cancelled")
      .sort((a, b) => activeMatchRank(a, currentRound) - activeMatchRank(b, currentRound) || a.round_no - b.round_no || a.match_no - b.match_no)
      .find((match) => participants.every((participant) => matchHasScannedParticipant(match, participant))) ?? null
  );
}

function findLocalMatchByScannedParticipants(matches: TeamMatch[], participants: ScannedParticipant[]) {
  if (participants.length !== 2 || participants.some((participant) => participant.kind !== "local-team")) return null;
  return (
    [...matches]
      .filter((match) => !match.winner)
      .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id))
      .find((match) => participants.every((participant) => match.teams.includes(participant.id))) ?? null
  );
}

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

function LocalTeamRow({
  team,
  active,
}: {
  team: LocalDisplayTeam;
  active: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 ${active ? "border-accent bg-accent/10" : "border-edge bg-panel"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xs font-bold text-accent">{team.code}</div>
          <div className="truncate text-sm font-semibold">{team.name}</div>
          <div className="truncate text-[11px] text-ink-dim">{team.members.join(" / ")}</div>
        </div>
        <QrCodeBadge value={team.code} label="BEYLIVE" size={72} />
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

function matchStageLabel(
  match: BeyliveMatch,
  teamMode: boolean,
  groupStage: boolean,
  mainRoundLabels: Map<number, string>,
) {
  if (teamMode) {
    if (match.bracket === "grand") return "Championship";
    if (match.bracket === "losers") return "Consolation";
    return `League R${match.round_no}`;
  }
  if (groupStage) {
    const poolMatch = /^pool_(\d+)$/.exec(match.bracket);
    if (poolMatch) return `Pool ${poolMatch[1]} · Round ${match.round_no}`;
    if (match.bracket === "main") return mainRoundLabels.get(match.round_no) ?? beyliveKnockoutRoundLabel(0);
    if (match.bracket === "losers") return "3rd Place";
  }
  return `Round ${match.round_no}`;
}

function MatchCard({
  match,
  teamMode,
  groupStage,
  mainRoundLabels,
  locale,
  id,
  canScore,
  scoreBusy,
  onAddPoint,
  onAddTeamPoint,
  onUndo,
  onComplete,
}: {
  match: BeyliveMatch;
  teamMode: boolean;
  groupStage: boolean;
  mainRoundLabels: Map<number, string>;
  locale: Locale;
  id: string;
  canScore: boolean;
  scoreBusy: string | null;
  onAddPoint: (matchId: string, userId: string, finish: Finish) => void;
  onAddTeamPoint: (matchId: string, teamId: string, finish: Finish) => void;
  onUndo: (matchId: string) => void;
  onComplete: (matchId: string) => void;
}) {
  const matchPlayers = [...(match.players ?? [])].sort((a, b) => a.slot_no - b.slot_no);
  const completed = match.status === "completed";
  const showScorer = canScore && matchPlayers.length === 2 && !completed;
  return (
    <div className="rounded-md border border-edge bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-ink-dim">
          {matchStageLabel(match, teamMode, groupStage, mainRoundLabels)} · Table {match.table_no ?? match.match_no} · Match {match.match_no}
        </div>
        <span className={`text-xs font-bold ${match.status === "live" ? "text-accent" : "text-ink-dim"}`}>
          {match.status}
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {matchPlayers.map((player) => {
          const won = beyliveParticipantWon(match, player);
          return (
            <div
              key={player.team_id ?? player.user_id}
              className={`rounded px-2 py-1.5 ${won ? "bg-accent/15" : "bg-bg"}`}
            >
              <div className="flex items-center justify-between">
                <span className="min-w-0 truncate text-sm">
                  <span className="mr-2 font-mono text-[11px] text-accent-2">{beyliveParticipantCode(player)}</span>
                  {beyliveParticipantName(player)}
                </span>
                <span className={`font-display text-xl font-black ${won ? "text-accent" : ""}`}>{player.score}</span>
              </div>
              {showScorer && (
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {BEYLIVE_FINISHES.map((finish) => {
                    const key = `${match.id}:${player.team_id ?? player.user_id}:${finish.key}`;
                    return (
                      <button
                        key={finish.key}
                        onClick={() =>
                          player.team_id
                            ? onAddTeamPoint(match.id, player.team_id, finish.key)
                            : onAddPoint(match.id, player.user_id, finish.key)
                        }
                        disabled={!!scoreBusy}
                        className="rounded border px-1 py-1 font-display text-[9px] font-bold tracking-wide transition enabled:hover:brightness-125 disabled:opacity-35"
                        style={{
                          borderColor: `color-mix(in srgb, ${finish.color} 45%, transparent)`,
                          background:
                            scoreBusy === key
                              ? `color-mix(in srgb, ${finish.color} 30%, transparent)`
                              : `color-mix(in srgb, ${finish.color} 12%, transparent)`,
                          color: finish.color,
                        }}
                      >
                        {finish.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {showScorer && (
          <>
            <button
              onClick={() => onUndo(match.id)}
              disabled={!!scoreBusy}
              className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={() => onComplete(match.id)}
              disabled={!!scoreBusy}
              className="clip-x border border-accent-2/50 bg-accent-2/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent-2 transition enabled:hover:bg-accent-2/20 disabled:opacity-40"
            >
              Complete
            </button>
          </>
        )}
        <Link
          href={`/${locale}/tournaments/${id}/matches/${match.id}`}
          className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
        >
          Full view
        </Link>
        <Link
          href={`/${locale}/tournaments/${id}/live`}
          className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
        >
          View live
        </Link>
      </div>
    </div>
  );
}

function matchTeams(matches: BeyliveMatch[]) {
  const map = new Map<string, BeyliveTeam>();
  for (const match of matches) {
    for (const player of match.players ?? []) {
      if (player.team) map.set(player.team.id, player.team);
    }
  }
  return [...map.values()];
}

function LocalMatchScoreForm({
  match,
  state,
  onConfirm,
}: {
  match: TeamMatch;
  state: LocalPartnerState;
  onConfirm: (scores: Record<string, number>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    match.scores
      ? Object.fromEntries(match.teams.map((teamId) => [teamId, String(match.scores?.[teamId] ?? 0)]))
      : {},
  );
  const [tie, setTie] = useState(false);

  useEffect(() => {
    setValues(
      match.scores
        ? Object.fromEntries(match.teams.map((teamId) => [teamId, String(match.scores?.[teamId] ?? 0)]))
        : {},
    );
    setTie(false);
  }, [match.id, match.scores]);

  const submit = () => {
    const scores: Record<string, number> = {};
    for (const teamId of match.teams) scores[teamId] = Math.max(0, Number(values[teamId]) || 0);
    const top = Math.max(...match.teams.map((teamId) => scores[teamId] ?? 0));
    if (match.teams.filter((teamId) => (scores[teamId] ?? 0) === top).length !== 1) {
      setTie(true);
      return;
    }
    setTie(false);
    onConfirm(scores);
  };

  return (
    <div>
      <div className="grid gap-1.5">
        {match.teams.map((teamId, index) => (
          <div key={teamId}>
            {index === 1 && <div className="my-0.5 text-center text-[10px] font-bold text-ink-dim">vs</div>}
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                <span className="mr-2 font-display text-[10px] font-bold text-accent-2">
                  {localPartnerTeamCode(state, teamId)}
                </span>
                {localPartnerTeamName(state, teamId)}
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={values[teamId] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [teamId]: event.target.value }))}
                placeholder="0"
                className="w-14 rounded border border-edge bg-panel-2 px-2 py-1 text-center text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        className="clip-x mt-2 w-full bg-accent px-3 py-2 font-display text-[10px] font-bold tracking-wider text-bg transition hover:brightness-110"
      >
        Confirm score
      </button>
      {tie && <p className="mt-1 text-[10px] text-atk">Scores cannot tie.</p>}
    </div>
  );
}

function LocalPartnerMatchCard({
  match,
  allMatches,
  state,
  canScore,
  locale,
  tournamentId,
  onScore,
}: {
  match: TeamMatch;
  allMatches: TeamMatch[];
  state: LocalPartnerState;
  canScore: boolean;
  locale: Locale;
  tournamentId: string;
  onScore: (matchId: string, scores: Record<string, number>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const mode = localPartnerMode(state);
  const completed = match.winner !== null;

  return (
    <div className={`rounded-md border p-3 ${completed ? "border-accent/40 bg-accent/5" : "border-edge bg-panel"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-ink-dim">
          {localPartnerStageLabel(match, mode)} - {localPartnerTableLabel(allMatches, match)}
        </div>
        <span className={`text-xs font-bold ${completed ? "text-accent" : "text-ink-dim"}`}>
          {completed ? "completed" : "scheduled"}
        </span>
      </div>

      <div className="mt-2">
        {match.teams.length === 1 ? (
          <p className="rounded bg-bg px-2 py-2 text-sm text-ink-dim">
            <span className="mr-2 font-mono text-[11px] text-accent-2">
              {localPartnerTeamCode(state, match.teams[0])}
            </span>
            {localPartnerTeamName(state, match.teams[0])} bye
          </p>
        ) : completed && !editing ? (
          <div>
            <div className="grid gap-1.5">
              {match.teams.map((teamId) => {
                const won = match.winner === teamId;
                return (
                  <div
                    key={teamId}
                    className={`flex items-center justify-between rounded px-2 py-1.5 ${
                      won ? "bg-accent/15 text-accent" : "bg-bg text-ink-dim"
                    }`}
                  >
                    <span className="min-w-0 truncate text-sm">
                      <span className="mr-2 font-mono text-[11px] text-accent-2">
                        {localPartnerTeamCode(state, teamId)}
                      </span>
                      {localPartnerTeamName(state, teamId)}
                    </span>
                    <span className="font-display text-xl font-black">{match.scores?.[teamId] ?? 0}</span>
                  </div>
                );
              })}
            </div>
            {canScore && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-2 text-[10px] font-semibold text-ink-dim underline decoration-dotted transition hover:text-accent-2"
              >
                Edit
              </button>
            )}
          </div>
        ) : canScore ? (
          <LocalMatchScoreForm
            match={match}
            state={state}
            onConfirm={(scores) => {
              setEditing(false);
              onScore(match.id, scores);
            }}
          />
        ) : (
          <div className="grid gap-1.5">
            {match.teams.map((teamId, index) => (
              <div key={teamId}>
                {index === 1 && <div className="my-0.5 text-center text-[10px] font-bold text-ink-dim">vs</div>}
                <div className="rounded bg-bg px-2 py-1.5 text-sm text-ink-dim">
                  <span className="mr-2 font-mono text-[11px] text-accent-2">
                    {localPartnerTeamCode(state, teamId)}
                  </span>
                  {localPartnerTeamName(state, teamId)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/${locale}/tournaments/${tournamentId}/matches/${match.id}`}
          className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20"
        >
          Judge page
        </Link>
        <Link
          href={`/${locale}/tournaments/${tournamentId}/live`}
          className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink"
        >
          View live
        </Link>
      </div>
    </div>
  );
}

export default function BeyliveControlClient({ id, locale }: { id: string; locale: Locale }) {
  const router = useRouter();
  const { enabled, profile } = useAuth();
  const [tournament, setTournament] = useState<CommunityTournament | null>(null);
  const [matches, setMatches] = useState<BeyliveMatch[]>([]);
  const [judges, setJudges] = useState<BeyliveJudge[]>([]);
  const [judgeRole, setJudgeRole] = useState<BeyliveJudge["role"] | null>(null);
  const [judgeLookup, setJudgeLookup] = useState("");
  const [newJudgeRole, setNewJudgeRole] = useState<"judge" | "scorer">("judge");
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [judgeMessage, setJudgeMessage] = useState<string | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"start" | "advance" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoreBusy, setScoreBusy] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [scanPair, setScanPair] = useState<ScannedParticipant[]>([]);
  const [scanMatchMessage, setScanMatchMessage] = useState<string | null>(null);
  const [localPartnerState, setLocalPartnerState] = useState<LocalPartnerState | null>(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [streamTitle, setStreamTitle] = useState("");
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [stadium1StreamUrl, setStadium1StreamUrl] = useState("");
  const [stadium1StreamTitle, setStadium1StreamTitle] = useState("");
  const [stadium1StreamEnabled, setStadium1StreamEnabled] = useState(false);
  const [stadium2StreamUrl, setStadium2StreamUrl] = useState("");
  const [stadium2StreamTitle, setStadium2StreamTitle] = useState("");
  const [stadium2StreamEnabled, setStadium2StreamEnabled] = useState(false);
  const [streamBusy, setStreamBusy] = useState(false);
  const [streamSaved, setStreamSaved] = useState(false);
  const partnerCacheKey = useMemo(() => `spindex.partner-battle.${id}`, [id]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: tData }, { data: mData }, { data: jData }] = await Promise.all([
      supabase.from("tournaments").select(TOURNAMENT_SELECT).eq("id", id).maybeSingle(),
      supabase
        .from("beylive_matches")
        .select(BEYLIVE_MATCH_SELECT)
        .eq("tournament_id", id)
        .order("round_no", { ascending: true })
        .order("match_no", { ascending: true }),
      supabase
        .from("beylive_judges")
        .select(BEYLIVE_JUDGE_SELECT)
        .eq("tournament_id", id)
        .order("created_at", { ascending: true }),
    ]);
    setTournament((tData as unknown as CommunityTournament | null) ?? null);
    setMatches((mData as unknown as BeyliveMatch[]) ?? []);
    setJudges((jData as unknown as BeyliveJudge[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;

    const loadJudgeRole = async () => {
      if (!supabase || !profile?.id) {
        setJudgeRole(null);
        return;
      }
      const { data } = await supabase
        .from("beylive_judges")
        .select("role")
        .eq("tournament_id", id)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (active) setJudgeRole((data?.role as BeyliveJudge["role"] | undefined) ?? null);
    };

    loadJudgeRole();
    if (!supabase || !profile?.id) {
      return () => {
        active = false;
      };
    }
    const channel = supabase
      .channel(`beylive-judge-role-${id}-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_judges", filter: `tournament_id=eq.${id}` }, loadJudgeRole)
      .subscribe();
    return () => {
      active = false;
      supabase?.removeChannel(channel);
    };
  }, [id, profile?.id]);

  useEffect(() => {
    if (!tournament) return;
    setStreamUrl(tournament.stream_url ?? "");
    setStreamTitle(tournament.stream_title ?? "");
    setStreamEnabled(Boolean(tournament.stream_enabled && tournament.stream_url));
    setStadium1StreamUrl(tournament.stadium1_stream_url ?? "");
    setStadium1StreamTitle(tournament.stadium1_stream_title ?? "");
    setStadium1StreamEnabled(Boolean(tournament.stadium1_stream_enabled && tournament.stadium1_stream_url));
    setStadium2StreamUrl(tournament.stadium2_stream_url ?? "");
    setStadium2StreamTitle(tournament.stadium2_stream_title ?? "");
    setStadium2StreamEnabled(Boolean(tournament.stadium2_stream_enabled && tournament.stadium2_stream_url));
    setStreamSaved(false);
  }, [
    tournament?.id,
    tournament?.stadium1_stream_enabled,
    tournament?.stadium1_stream_title,
    tournament?.stadium1_stream_url,
    tournament?.stadium2_stream_enabled,
    tournament?.stadium2_stream_title,
    tournament?.stadium2_stream_url,
    tournament?.stream_enabled,
    tournament?.stream_title,
    tournament?.stream_url,
  ]);

  useEffect(() => {
    let active = true;

    const applyState = (state: LocalPartnerState | null) => {
      if (!active) return;
      setLocalPartnerState(state);
      if (!state) return;
      try {
        window.localStorage.setItem(partnerCacheKey, JSON.stringify(state));
      } catch {
        /* cache unavailable */
      }
    };

    const loadPartnerState = async () => {
      let next: LocalPartnerState | null = null;
      try {
        const raw = window.localStorage.getItem(partnerCacheKey);
        if (raw) next = JSON.parse(raw) as LocalPartnerState;
      } catch {
        next = null;
      }
      applyState(next);

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
      .channel(`partner-battle-control-${id}`)
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
  }, [id, partnerCacheKey]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`beylive-control-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_matches", filter: `tournament_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_players" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_judges", filter: `tournament_id=eq.${id}` }, load)
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
  const teamMode = isBeyliveTeamTournament(tournament);
  const groupStage = isBeyliveGroupStageTournament(tournament);
  const podium = useMemo(() => beylivePodium(tournament, matches), [tournament, matches]);
  const [showPodiumModal, setShowPodiumModal] = useState(false);
  const groupPools = useMemo(() => beyliveGroupPools(tournament, matches), [tournament, matches]);
  const mainRoundLabels = useMemo(() => beyliveKnockoutRoundLabels(matches), [matches]);
  const poolRoundGroups = useMemo(() => {
    if (!groupStage) return [];
    const byRound = new Map<number, BeyliveMatch[]>();
    for (const match of matches) {
      if (!/^pool_\d+$/.test(match.bracket)) continue;
      const list = byRound.get(match.round_no);
      if (list) list.push(match);
      else byRound.set(match.round_no, [match]);
    }
    return [...byRound.entries()]
      .sort(([a], [b]) => a - b)
      .map(([roundNo, roundMatches]) => ({
        roundNo,
        matches: [...roundMatches].sort((a, b) => {
          const poolA = Number(/^pool_(\d+)$/.exec(a.bracket)?.[1] ?? 0);
          const poolB = Number(/^pool_(\d+)$/.exec(b.bracket)?.[1] ?? 0);
          return poolA - poolB || a.match_no - b.match_no;
        }),
      }));
  }, [groupStage, matches]);
  const knockoutBracketMatches = useMemo(
    () =>
      matches
        .filter((m) => (m.bracket === "main" || m.bracket === "losers") && !isBeyliveByeMatch(m))
        .sort((a, b) => {
          const bracketOrder = Number(a.bracket === "losers") - Number(b.bracket === "losers");
          return a.round_no - b.round_no || bracketOrder || a.match_no - b.match_no;
        }),
    [matches],
  );
  const teams = useMemo(
    () => {
      const byId = new Map<string, BeyliveTeam>();
      for (const team of tournament?.teams ?? []) byId.set(team.id, team);
      for (const team of matchTeams(matches)) byId.set(team.id, team);
      return [...byId.values()].sort(
        (a, b) => (a.seed ?? a.team_no) - (b.seed ?? b.team_no) || a.team_no - b.team_no,
      );
    },
    [matches, tournament],
  );
  const scannedTeam = useMemo(
    () => findBeyliveTeamByScan(teams, scanValue),
    [teams, scanValue],
  );
  const localTeams = useMemo(() => localPartnerTeams(localPartnerState), [localPartnerState]);
  const scannedLocalTeam = useMemo(
    () => findLocalPartnerTeamByScan(localTeams, scanValue),
    [localTeams, scanValue],
  );
  const scannedPlayerTeam = useMemo(
    () =>
      teamMode && scannedPlayer
        ? teams.find((team) => team.members?.some((member) => member.user_id === scannedPlayer.user_id)) ?? null
        : null,
    [scannedPlayer, teamMode, teams],
  );
  const localPartnerReady = teamMode && matches.length === 0 && isLocalPartnerLive(localPartnerState);
  const localMatches = useMemo(() => localPartnerDisplayMatches(localPartnerState), [localPartnerState]);
  const isHost = !!profile && profile.id === tournament?.host;
  const hasGlobalJudgeAccess = !!profile?.beylive_judge && !profile?.is_walkin;
  const canManage = isHost || hasGlobalJudgeAccess || !!judgeRole;
  const currentRound = tournament?.current_round ?? 1;
  const showBracketOverview =
    !teamMode && (tournament?.format === "single_elimination" || tournament?.format === "group_stage");
  const currentRoundMatches = matches.filter((match) => match.round_no === currentRound);
  const displayMatches = useMemo(() => matches.filter((match) => !isBeyliveByeMatch(match)), [matches]);
  const scanFound = teamMode ? !!scannedTeam || !!scannedLocalTeam || !!scannedPlayerTeam : !!scannedPlayer;
  const canAdvance =
    currentRoundMatches.length > 0 &&
    currentRoundMatches.every((match) => match.status === "completed" || match.status === "cancelled");

  const scannedParticipantFromValue = (value: string): ScannedParticipant | null => {
    if (teamMode) {
      const team = findBeyliveTeamByScan(teams, value);
      if (team) {
        return {
          kind: "team",
          id: team.id,
          code: beyliveTeamCode(team),
          name: team.name,
        };
      }
      const localTeam = findLocalPartnerTeamByScan(localTeams, value);
      if (localTeam) {
        return {
          kind: "local-team",
          id: localTeam.id,
          code: localTeam.code,
          name: localTeam.name,
        };
      }
    }

    const player = findTournamentPlayerByScan(players, value);
    if (!player) return null;
    if (teamMode) {
      const playerTeam = teams.find((team) => team.members?.some((member) => member.user_id === player.user_id));
      if (playerTeam) {
        return {
          kind: "team",
          id: playerTeam.id,
          code: beyliveTeamCode(playerTeam),
          name: playerTeam.name,
        };
      }
    }
    return {
      kind: "player",
      id: player.user_id,
      code: beylivePlayerCode(player.profile),
      name: profileDisplayName(player.profile),
    };
  };

  const openScannedScoreboard = (participants: ScannedParticipant[]) => {
    const match = findMatchByScannedParticipants(matches, participants, currentRound);
    if (match) {
      setScanMatchMessage(`Opening ${matchStageLabel(match, teamMode, groupStage || tournament?.format === "single_elimination", mainRoundLabels)} scoreboard.`);
      setScanPair([]);
      router.push(`/${locale}/tournaments/${id}/matches/${match.id}`);
      return;
    }

    const localMatch = findLocalMatchByScannedParticipants(localMatches, participants);
    if (localMatch) {
      setScanMatchMessage("Opening Partner Battle scoreboard.");
      setScanPair([]);
      router.push(`/${locale}/tournaments/${id}/matches/${localMatch.id}`);
      return;
    }

    setScanMatchMessage("No active match found for those two scans.");
  };

  const handleScan = (value: string) => {
    setScanValue(value);
    const participant = scannedParticipantFromValue(value);
    if (!participant) {
      setScanMatchMessage("No player or team found for that QR.");
      return;
    }

    if (!canManage) {
      setScanPair([participant]);
      setScanMatchMessage("This login is not assigned as a BEYLIVE judge.");
      return;
    }

    const withoutDuplicate = scanPair.filter((item) => item.kind !== participant.kind || item.id !== participant.id);
    const next = [...withoutDuplicate, participant].slice(-2);
    setScanPair(next);
    if (next.length === 1) {
      setScanMatchMessage(`${participant.code} locked. Scan opponent.`);
    } else {
      openScannedScoreboard(next);
    }
  };

  const run = async (kind: "start" | "advance") => {
    if (!supabase || !tournament || !isHost) return;
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

  const runScore = async (busyKey: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    if (!supabase) return;
    setScoreBusy(busyKey);
    setScoreError(null);
    const { error: err } = await fn();
    setScoreBusy(null);
    if (err) {
      setScoreError(err.message.replace(/_/g, " "));
      return;
    }
    load();
  };

  const addPoint = (matchId: string, userId: string, finish: Finish) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:${userId}:${finish}`, () =>
      client.rpc("record_beylive_point", { mid: matchId, player_id: userId, finish }),
    );
  };

  const addTeamPoint = (matchId: string, teamId: string, finish: Finish) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:${teamId}:${finish}`, () =>
      client.rpc("record_beylive_team_point", { mid: matchId, p_team_id: teamId, finish }),
    );
  };

  const undoMatchPoint = (matchId: string) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:undo`, () => client.rpc("undo_beylive_point", { mid: matchId }));
  };

  const completeMatchManually = (matchId: string) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:complete`, () => client.rpc("complete_beylive_match", { mid: matchId }));
  };

  const saveLocalPartnerState = async (nextState: LocalPartnerState) => {
    if (!supabase || !tournament || !canManage) return false;

    setLocalPartnerState(nextState);
    try {
      window.localStorage.setItem(partnerCacheKey, JSON.stringify(nextState));
    } catch {
      /* cache unavailable */
    }

    const { error: stateError } = await supabase
      .from("partner_battles")
      .upsert({
        tournament_id: tournament.id,
        state: nextState,
        updated_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      });

    if (stateError) {
      setError(stateError.message.replace(/_/g, " "));
      return false;
    }

    const { error: tournamentError } = await supabase
      .from("tournaments")
      .update({
        live_enabled: true,
        status: "started",
        current_round: nextState.round ?? 1,
        target_score: PARTNER_WIN_SCORE,
      })
      .eq("id", tournament.id);

    if (tournamentError) {
      setError(tournamentError.message.replace(/_/g, " "));
      return false;
    }

    load();
    return true;
  };

  const startLocalBeylive = async () => {
    if (!localPartnerState || !localPartnerReady) {
      setError("Start the Partner Battle first, then publish it to BEYLIVE.");
      return;
    }
    setBusy("start");
    setError(null);
    await saveLocalPartnerState({
      ...localPartnerState,
      phase: "battle",
      round: localPartnerState.round ?? 1,
    });
    setBusy(null);
  };

  const reportLocalPartnerMatch = async (matchId: string, scores: Record<string, number>) => {
    if (!localPartnerState) return;
    const nextState = scoreLocalPartnerMatch(localPartnerState, matchId, scores);
    if (!nextState) {
      setError("Scores cannot tie. Enter one winning team.");
      return;
    }
    setError(null);
    await saveLocalPartnerState(nextState);
  };

  const assignJudge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !tournament || !isHost) return;
    const lookup = judgeLookup.trim();
    if (!lookup) return;

    setJudgeBusy(true);
    setJudgeError(null);
    setJudgeMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setJudgeBusy(false);
      setJudgeError("Login again before assigning judges.");
      return;
    }

    const response = await fetch("/api/beylive/judges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tournamentId: tournament.id,
        lookup,
        role: newJudgeRole,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setJudgeBusy(false);

    if (!response.ok) {
      setJudgeError((payload?.error ?? "judge_assign_failed").replace(/_/g, " "));
      return;
    }

    setJudgeLookup("");
    setJudgeMessage("Judge access updated.");
    load();
  };

  const removeJudge = async (userId: string) => {
    if (!supabase || !tournament || !isHost) return;
    setJudgeBusy(true);
    setJudgeError(null);
    setJudgeMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setJudgeBusy(false);
      setJudgeError("Login again before removing judges.");
      return;
    }

    const response = await fetch("/api/beylive/judges", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tournamentId: tournament.id,
        userId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setJudgeBusy(false);

    if (!response.ok) {
      setJudgeError((payload?.error ?? "judge_remove_failed").replace(/_/g, " "));
      return;
    }

    setJudgeMessage("Judge removed.");
    load();
  };

  const saveStream = async () => {
    if (!supabase || !tournament || !isHost) return;

    const nextUrl = streamUrl.trim();
    const nextTitle = streamTitle.trim();
    const nextStadium1Url = stadium1StreamUrl.trim();
    const nextStadium1Title = stadium1StreamTitle.trim();
    const nextStadium2Url = stadium2StreamUrl.trim();
    const nextStadium2Title = stadium2StreamTitle.trim();
    setStreamBusy(true);
    setStreamSaved(false);
    setError(null);

    const { error: err } = await supabase
      .from("tournaments")
      .update({
        stream_url: nextUrl || null,
        stream_title: nextTitle || null,
        stream_enabled: streamEnabled && !!nextUrl,
        stadium1_stream_url: nextStadium1Url || null,
        stadium1_stream_title: nextStadium1Title || null,
        stadium1_stream_enabled: stadium1StreamEnabled && !!nextStadium1Url,
        stadium2_stream_url: nextStadium2Url || null,
        stadium2_stream_title: nextStadium2Title || null,
        stadium2_stream_enabled: stadium2StreamEnabled && !!nextStadium2Url,
      })
      .eq("id", tournament.id);

    setStreamBusy(false);
    if (err) {
      setError(err.message.replace(/_/g, " "));
      return;
    }
    setStreamSaved(true);
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
        {!canManage && (
          <p className="mt-4 rounded-md border border-bal/40 bg-bal/10 px-4 py-3 text-sm text-bal">
            Only the tournament host, an assigned BEYLIVE judge, or a Superadmin-approved BEYLIVE judge can score matches right now.
          </p>
        )}
        {canManage && !isHost && (
          <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
            {hasGlobalJudgeAccess ? "Global BEYLIVE judge mode active." : "Judge mode active."} Scan both players to open the match scoreboard.
          </p>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-atk">{error}</p>}
        {isHost && (
          <div className="mt-5 grid gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => (players.length >= 2 ? run("start") : startLocalBeylive())}
                disabled={busy !== null || matches.length > 0 || (players.length < 2 && !localPartnerReady)}
                className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
              >
                {busy === "start"
                  ? "Starting..."
                  : players.length >= 2
                    ? "Start BEYLIVE"
                    : "Start from Partner Battle"}
              </button>
              <button
                onClick={() => run("advance")}
                disabled={busy !== null || !canAdvance || tournament.status === "completed"}
                className="clip-x border border-accent-2/50 bg-accent-2/10 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-accent-2 transition enabled:hover:bg-accent-2/20 disabled:opacity-40"
              >
                {busy === "advance" ? "Advancing..." : "Advance / Finalize"}
              </button>
            </div>

            <div className="rounded-md border border-edge bg-bg/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-display text-xs font-bold tracking-[0.2em] text-accent">JUDGES</div>
                  <div className="mt-0.5 text-xs text-ink-dim">Assign a logged-in account by SPX code or @handle.</div>
                </div>
              </div>
              <form onSubmit={assignJudge} className="mt-3 grid gap-2 md:grid-cols-[1fr_130px_auto]">
                <input
                  value={judgeLookup}
                  onChange={(event) => setJudgeLookup(event.target.value)}
                  placeholder="SPX-0001 or @handle"
                  className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent"
                />
                <select
                  value={newJudgeRole}
                  onChange={(event) => setNewJudgeRole(event.target.value === "scorer" ? "scorer" : "judge")}
                  className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="judge">Judge</option>
                  <option value="scorer">Scorer</option>
                </select>
                <button
                  type="submit"
                  disabled={judgeBusy || !judgeLookup.trim()}
                  className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  {judgeBusy ? "Saving..." : "Add judge"}
                </button>
              </form>
              {(judgeError || judgeMessage) && (
                <p className={`mt-2 text-xs font-semibold ${judgeError ? "text-atk" : "text-accent"}`}>
                  {judgeError ?? judgeMessage}
                </p>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {judges.length === 0 ? (
                  <p className="rounded-md border border-edge bg-panel px-3 py-3 text-xs text-ink-dim">
                    No judges assigned yet.
                  </p>
                ) : (
                  judges.map((judge) => {
                    const isTournamentHost = judge.user_id === tournament.host;
                    return (
                      <div key={judge.user_id} className="rounded-md border border-edge bg-panel px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{profileDisplayName(judge.profile)}</div>
                            <div className="font-mono text-[11px] text-ink-dim">{beylivePlayerCode(judge.profile)}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-accent-2">
                              {isTournamentHost ? "Host" : judge.role}
                            </div>
                          </div>
                          {!isTournamentHost && (
                            <button
                              type="button"
                              onClick={() => removeJudge(judge.user_id)}
                              disabled={judgeBusy}
                              className="rounded border border-edge px-2 py-1 text-xs text-ink-dim transition hover:text-atk disabled:opacity-40"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-md border border-edge bg-bg/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display text-xs font-bold tracking-[0.2em] text-accent-2">LIVE STREAMS</div>
                  <div className="mt-0.5 text-xs text-ink-dim">YouTube Live, Twitch, Facebook, or Vimeo URLs</div>
                </div>
                <button
                  onClick={saveStream}
                  disabled={streamBusy}
                  className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition enabled:hover:bg-accent/20 disabled:opacity-40"
                >
                  {streamBusy ? "Saving..." : "Save stream"}
                </button>
              </div>
              <div className="mt-3 grid gap-3">
                <div className="rounded-md border border-edge bg-panel/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-display text-[10px] font-bold uppercase tracking-wider text-ink-dim">Event feed</div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={streamEnabled}
                        onChange={(event) => setStreamEnabled(event.target.checked)}
                        className="h-4 w-4 accent-accent"
                      />
                      On air
                    </label>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[0.75fr_1.35fr]">
                    <input
                      value={streamTitle}
                      onChange={(event) => setStreamTitle(event.target.value)}
                      maxLength={80}
                      placeholder="Event stream title"
                      className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <input
                      value={streamUrl}
                      onChange={(event) => setStreamUrl(event.target.value)}
                      maxLength={500}
                      placeholder="Event stream URL"
                      className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-edge bg-panel/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-display text-[10px] font-bold uppercase tracking-wider text-accent">Stadium 1</div>
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <input
                          type="checkbox"
                          checked={stadium1StreamEnabled}
                          onChange={(event) => setStadium1StreamEnabled(event.target.checked)}
                          className="h-4 w-4 accent-accent"
                        />
                        On air
                      </label>
                    </div>
                    <div className="grid gap-2">
                      <input
                        value={stadium1StreamTitle}
                        onChange={(event) => setStadium1StreamTitle(event.target.value)}
                        maxLength={80}
                        placeholder="Stadium 1 title"
                        className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                      <input
                        value={stadium1StreamUrl}
                        onChange={(event) => setStadium1StreamUrl(event.target.value)}
                        maxLength={500}
                        placeholder="Stadium 1 stream URL"
                        className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-edge bg-panel/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-display text-[10px] font-bold uppercase tracking-wider text-accent">Stadium 2</div>
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <input
                          type="checkbox"
                          checked={stadium2StreamEnabled}
                          onChange={(event) => setStadium2StreamEnabled(event.target.checked)}
                          className="h-4 w-4 accent-accent"
                        />
                        On air
                      </label>
                    </div>
                    <div className="grid gap-2">
                      <input
                        value={stadium2StreamTitle}
                        onChange={(event) => setStadium2StreamTitle(event.target.value)}
                        maxLength={80}
                        placeholder="Stadium 2 title"
                        className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                      <input
                        value={stadium2StreamUrl}
                        onChange={(event) => setStadium2StreamUrl(event.target.value)}
                        maxLength={500}
                        placeholder="Stadium 2 stream URL"
                        className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {streamSaved && <div className="mt-2 text-xs font-semibold text-accent">Stream saved.</div>}
            </div>
          </div>
        )}
      </section>

      {podium && podium.length > 0 && (
        <section className="panel mt-4 border-accent/40 bg-accent/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-display text-sm font-bold tracking-wider text-accent">🏆 Podium</div>
            {isHost && (
              <button
                onClick={() => setShowPodiumModal(true)}
                className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
              >
                Share podium
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {podium.map((entry, index) => (
              <div key={`${entry.place}-${index}`} className="rounded-md border border-edge bg-panel p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-dim">{entry.place}</div>
                <div className="mt-1 font-display text-sm font-bold text-ink">{entry.name}</div>
                <div className="font-mono text-xs text-accent-2">{entry.playerCode}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showPodiumModal && podium && podium.length > 0 && (
        <SharePodiumModal
          fileId={tournament.id}
          onClose={() => setShowPodiumModal(false)}
          data={
            {
              tournamentName: tournament.name,
              dateLabel: shareDateLabel(new Date(), locale),
              url: typeof window !== "undefined" ? window.location.host : "SPINDEX",
              entries: podium.map((entry) => ({
                place: entry.place,
                name: entry.name,
                playerCode: entry.playerCode,
              })),
            } satisfies PodiumCardData
          }
        />
      )}

      {groupStage && groupPools.length > 0 && (
        <section className="panel mt-4 p-5">
          <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
            Pool standings <span className="font-normal text-ink-dim">(top 2 advance)</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {groupPools.map(({ poolNo, standings }) => (
              <div key={poolNo} className="rounded-md border border-edge bg-panel p-3">
                <div className="mb-2 font-display text-xs font-bold tracking-wider text-accent-2">Pool {poolNo}</div>
                <div className="grid gap-1">
                  {standings.map((row, index) => (
                    <div
                      key={row.id}
                      className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                        index < 2 ? "bg-accent/10 text-accent" : "text-ink-dim"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {index + 1}. {row.name}
                      </span>
                      <span className="ml-2 flex shrink-0 items-baseline gap-1.5 font-mono">
                        <span>{row.wins}-{row.losses}</span>
                        <span className="text-[0.7em] text-ink-dim">
                          {row.diff > 0 ? `+${row.diff}` : row.diff}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showBracketOverview && (
        <BeyliveBracketView
          matches={matches}
          locale={locale}
          tournamentId={id}
          currentRound={currentRound}
          className="mt-4"
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.35fr]">
        <aside className="grid gap-4">
          <BeyliveScanner
            onScan={handleScan}
          />
          {canManage && (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-xs font-bold tracking-wider text-accent">Judge match scan</div>
                  <div className="mt-0.5 text-[11px] text-ink-dim">Scan player 1 and player 2</div>
                </div>
                {scanPair.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setScanPair([]);
                      setScanMatchMessage(null);
                    }}
                    className="rounded border border-edge bg-panel px-2 py-1 text-xs text-ink-dim transition hover:text-ink"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-3 grid gap-2">
                {[0, 1].map((slot) => {
                  const participant = scanPair[slot];
                  return (
                    <div key={slot} className="rounded-md border border-edge bg-panel px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-dim">Player {slot + 1}</div>
                      {participant ? (
                        <div className="mt-1">
                          <div className="font-display text-sm font-bold text-accent">{participant.code}</div>
                          <div className="truncate text-xs text-ink">{participant.name}</div>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-ink-dim">Waiting for scan</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {scanMatchMessage && <p className="mt-2 text-xs font-semibold text-ink-dim">{scanMatchMessage}</p>}
            </div>
          )}
          {scanValue && (
            <div className={`rounded-md border p-4 ${scanFound ? "border-accent bg-accent/10" : "border-atk bg-atk/10"}`}>
              <div className="font-display text-xs font-bold tracking-wider text-ink-dim">Scan result</div>
              {teamMode && scannedTeam ? (
                <div className="mt-2">
                  <div className="font-display text-lg font-black text-accent">{beyliveTeamCode(scannedTeam)}</div>
                  <div className="font-semibold">{scannedTeam.name}</div>
                  <div className="text-xs text-ink-dim">{beyliveTeamMembers(scannedTeam).join(" / ")}</div>
                </div>
              ) : teamMode && scannedLocalTeam ? (
                <div className="mt-2">
                  <div className="font-display text-lg font-black text-accent">{scannedLocalTeam.code}</div>
                  <div className="font-semibold">{scannedLocalTeam.name}</div>
                  <div className="text-xs text-ink-dim">Local Partner Battle team</div>
                </div>
              ) : teamMode && scannedPlayerTeam ? (
                <div className="mt-2">
                  <div className="font-display text-lg font-black text-accent">{beyliveTeamCode(scannedPlayerTeam)}</div>
                  <div className="font-semibold">{scannedPlayerTeam.name}</div>
                  <div className="text-xs text-ink-dim">Resolved from player QR</div>
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
                <p className="mt-2 text-sm text-atk">
                  {teamMode && teams.length === 0 && localTeams.length > 0
                    ? `No local team found for ${scanValue}. Try T01, 01, or scan the QR.`
                    : teamMode && teams.length === 0
                      ? "No team IDs yet. Run the Partner Battle draw or add joined players, then start BEYLIVE."
                    : `No ${teamMode ? "team" : "player"} found for ${scanValue}`}
                </p>
              )}
            </div>
          )}
          <div className="panel p-4">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
              {teamMode ? "Team IDs and QR" : "Player IDs and QR"}
            </div>
            <div className="grid gap-2">
              {teamMode && teams.length === 0 && localTeams.length > 0 ? (
                localTeams.map((team) => (
                  <LocalTeamRow
                    key={team.id}
                    team={team}
                    active={scannedLocalTeam?.id === team.id}
                  />
                ))
              ) : teamMode && teams.length === 0 ? (
                <p className="rounded-md border border-edge bg-bg px-3 py-4 text-sm text-ink-dim">
                  Start BEYLIVE to create database team IDs, or run the Partner Battle draw on this browser first.
                </p>
              ) : teamMode ? (
                teams.map((team) => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      active={scannedTeam?.id === team.id}
                    />
                  ))
              ) : (
                players.map((player, index) => (
                    <PlayerRow
                      key={player.user_id}
                      player={player}
                      index={index}
                      active={scannedPlayer?.user_id === player.user_id}
                    />
                  ))
              )}
            </div>
          </div>
        </aside>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-display text-sm font-bold tracking-wider text-ink-dim">Match control</div>
            <div className="text-xs text-ink-dim">
              {localPartnerReady ? localMatches.length : displayMatches.length} matches
            </div>
          </div>
          {scoreError && <p className="mb-3 text-xs font-semibold text-atk">{scoreError}</p>}
          {matches.length === 0 && localPartnerReady && localPartnerState ? (
            <div className="grid gap-3">
              {localMatches.map((match) => (
                <LocalPartnerMatchCard
                  key={match.id}
                  match={match}
                  allMatches={localMatches}
                  state={localPartnerState}
                  canScore={canManage}
                  locale={locale}
                  tournamentId={id}
                  onScore={reportLocalPartnerMatch}
                />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-dim">Start BEYLIVE to generate matches from the existing tournament format.</p>
          ) : groupStage ? (
            <div className="grid gap-4">
              {poolRoundGroups.map(({ roundNo, matches: roundMatches }) => {
                const pending = roundMatches.filter((m) => m.status !== "completed" && m.status !== "cancelled").length;
                const needsAttention = roundNo === currentRound;
                return (
                  <details key={roundNo} open={needsAttention} className="group rounded-md border border-edge">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 font-display text-xs font-bold tracking-wider text-accent-2">
                      <span>Round {roundNo}</span>
                      <span className="font-normal text-ink-dim">
                        {pending === 0 ? "all matches done" : `${pending} left · ${roundMatches.length} total`}
                      </span>
                    </summary>
                    <div className="grid gap-3 p-3 pt-0">
                      {roundMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          teamMode={teamMode}
                          groupStage={groupStage || tournament?.format === "single_elimination"}
                          mainRoundLabels={mainRoundLabels}
                          locale={locale}
                          id={id}
                          canScore={canManage}
                          scoreBusy={scoreBusy}
                          onAddPoint={addPoint}
                          onAddTeamPoint={addTeamPoint}
                          onUndo={undoMatchPoint}
                          onComplete={completeMatchManually}
                        />
                      ))}
                    </div>
                  </details>
                );
              })}
              {knockoutBracketMatches.length > 0 && (
                <div className="rounded-md border border-accent/40">
                  <div className="px-3 py-2.5 font-display text-xs font-bold tracking-wider text-accent">Knockout bracket</div>
                  <div className="grid gap-3 p-3 pt-0">
                    {knockoutBracketMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        teamMode={teamMode}
                        groupStage={groupStage || tournament?.format === "single_elimination"}
                        mainRoundLabels={mainRoundLabels}
                        locale={locale}
                        id={id}
                        canScore={canManage}
                        scoreBusy={scoreBusy}
                        onAddPoint={addPoint}
                        onAddTeamPoint={addTeamPoint}
                        onUndo={undoMatchPoint}
                        onComplete={completeMatchManually}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {displayMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teamMode={teamMode}
                  groupStage={groupStage || tournament?.format === "single_elimination"}
                  mainRoundLabels={mainRoundLabels}
                  locale={locale}
                  id={id}
                  canScore={canManage}
                  scoreBusy={scoreBusy}
                  onAddPoint={addPoint}
                  onAddTeamPoint={addTeamPoint}
                  onUndo={undoMatchPoint}
                  onComplete={completeMatchManually}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
