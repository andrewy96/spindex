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
  Profile,
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
  beylivePoolStageInfo,
  beylivePlayerCode,
  beyliveQrValue,
  beyliveStadiumCount,
  beyliveStadiums,
  beyliveTeamCode,
  beyliveTeamMembers,
  beyliveTeamQrValue,
  findBeyliveTeamByScan,
  findTournamentPlayerByScan,
  isBeyliveGroupStageTournament,
  isBeyliveByeMatch,
  isBeyliveTeamTournament,
} from "@/lib/beylive";
import type { BeyliveStadiumView } from "@/lib/beylive";
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
import { BEYLIVE_SYNC_EVENT, beyliveSyncTopic, broadcastBeyliveRefresh } from "@/lib/beyliveRealtime";
import {
  canAccessBeyliveControl,
  hasBeyliveHostControlAccess,
  hasGlobalBeyliveJudgeAccess,
} from "@/lib/beyliveAccess";
import BeyliveScanner from "./BeyliveScanner";
import BeyliveBracketView from "./BeyliveBracketView";
import QrCodeBadge from "./QrCodeBadge";
import SharePodiumModal from "./SharePodiumModal";
import { PodiumCardData, shareDateLabel } from "@/lib/shareCard";
import { tournamentLookupColumn, tournamentPath, tournamentRouteParam } from "@/lib/tournamentRouting";

const BEYLIVE_JUDGE_SELECT =
  "*, profile:profiles!beylive_judges_user_id_fkey(*)";

type ScannedParticipant = {
  kind: "player" | "team" | "local-team";
  id: string;
  code: string;
  name: string;
};

type StadiumForm = {
  label: string;
  streamTitle: string;
  streamUrl: string;
  streamEnabled: boolean;
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
    <div className={`rounded-md border p-2.5 transition ${active ? "border-accent bg-accent/10 shadow-[0_0_22px_rgba(0,229,143,0.12)]" : "border-edge bg-panel/80"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 inline-flex rounded border border-accent/40 bg-accent/10 px-2 py-0.5 font-display text-[11px] font-black text-accent">
            {beyliveEventId(player, index)}
          </div>
          <div className="truncate text-sm font-bold text-ink">{profileDisplayName(player.profile)}</div>
          <div className="font-mono text-[11px] font-semibold text-accent-2">{beylivePlayerCode(player.profile)}</div>
        </div>
        <QrCodeBadge value={beyliveQrValue(player.profile)} label="SCAN" size={58} />
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
    <div className={`rounded-md border p-2.5 transition ${active ? "border-accent bg-accent/10 shadow-[0_0_22px_rgba(0,229,143,0.12)]" : "border-edge bg-panel/80"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 inline-flex rounded border border-accent/40 bg-accent/10 px-2 py-0.5 font-display text-[11px] font-black text-accent">{team.code}</div>
          <div className="truncate text-sm font-bold text-ink">{team.name}</div>
          <div className="truncate text-[11px] text-ink-dim">{team.members.join(" / ")}</div>
        </div>
        <QrCodeBadge value={team.code} label="SCAN" size={58} />
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
    <div className={`rounded-md border p-2.5 transition ${active ? "border-accent bg-accent/10 shadow-[0_0_22px_rgba(0,229,143,0.12)]" : "border-edge bg-panel/80"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 inline-flex rounded border border-accent/40 bg-accent/10 px-2 py-0.5 font-display text-[11px] font-black text-accent">{beyliveTeamCode(team)}</div>
          <div className="truncate text-sm font-bold text-ink">{team.name}</div>
          <div className="truncate text-[11px] text-ink-dim">{members.join(" / ")}</div>
        </div>
        <QrCodeBadge value={beyliveTeamQrValue(team)} label="SCAN" size={58} />
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
  canEditStadium,
  stadiums,
  scoreBusy,
  onStart,
  onChangeStadium,
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
  canEditStadium: boolean;
  stadiums: BeyliveStadiumView[];
  scoreBusy: string | null;
  onStart: (matchId: string) => void;
  onChangeStadium: (matchId: string, stadiumNo: number) => void;
  onAddPoint: (matchId: string, userId: string, finish: Finish) => void;
  onAddTeamPoint: (matchId: string, teamId: string, finish: Finish) => void;
  onUndo: (matchId: string) => void;
  onComplete: (matchId: string) => void;
}) {
  const matchPlayers = [...(match.players ?? [])].sort((a, b) => a.slot_no - b.slot_no);
  const completed = match.status === "completed";
  const topScore = matchPlayers.reduce((top, player) => Math.max(top, player.score), 0);
  const leaderCount = matchPlayers.filter((player) => player.score === topScore).length;
  const targetReached = topScore >= match.target_score && leaderCount === 1;
  const showScorer = canScore && matchPlayers.length === 2 && !completed;
  const stadiumNo = match.table_no ?? match.match_no;
  const assignedStadium = stadiums.find((stadium) => stadium.stadium_no === stadiumNo) ?? null;
  const selectedStadiumNo = assignedStadium?.stadium_no ?? stadiums[0]?.stadium_no ?? stadiumNo;
  const liveUrl = assignedStadium?.stream_enabled && assignedStadium.stream_url ? assignedStadium.stream_url : null;
  return (
    <div className="rounded-md border border-edge bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-ink-dim">
          {matchStageLabel(match, teamMode, groupStage, mainRoundLabels)} · {assignedStadium?.label ?? `Stadium ${stadiumNo}`} · Match {match.match_no}
        </div>
        <span className={`text-xs font-bold ${match.status === "live" ? "text-accent" : "text-ink-dim"}`}>
          {match.status}
        </span>
      </div>
      {canEditStadium && stadiums.length > 0 && !completed && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
          <span>Assign stadium</span>
          <select
            value={selectedStadiumNo}
            onChange={(event) => onChangeStadium(match.id, Number(event.target.value))}
            disabled={!!scoreBusy}
            className="rounded border border-edge bg-bg px-2 py-1 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent disabled:opacity-40"
          >
            {stadiums.map((stadium) => (
              <option key={stadium.stadium_no} value={stadium.stadium_no}>
                {stadium.label}
              </option>
            ))}
          </select>
        </label>
      )}
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
                        disabled={!!scoreBusy || targetReached}
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
      {showScorer && targetReached && (
        <p className="mt-2 rounded border border-accent/40 bg-accent/10 px-2 py-1.5 text-[10px] font-semibold text-accent">
          Target reached. Click Complete to publish the winner and advance sync.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {showScorer && (
          <>
            {match.status === "scheduled" && (
              <button
                onClick={() => onStart(match.id)}
                disabled={!!scoreBusy}
                className="clip-x border border-accent/50 bg-accent/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent transition enabled:hover:bg-accent/20 disabled:opacity-40"
              >
                Start
              </button>
            )}
            <button
              onClick={() => onUndo(match.id)}
              disabled={!!scoreBusy}
              className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={() => onComplete(match.id)}
              disabled={!!scoreBusy || !targetReached}
              className="clip-x border border-accent-2/50 bg-accent-2/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent-2 transition enabled:hover:bg-accent-2/20 disabled:opacity-40"
            >
              Complete
            </button>
          </>
        )}
        <Link
          href={tournamentPath(locale, null, `/matches/${match.id}`, id)}
          className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
        >
          Full view
        </Link>
        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="clip-x border border-accent/50 bg-accent/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent transition hover:bg-accent/20"
          >
            View live
          </a>
        ) : (
          <Link
            href={tournamentPath(locale, null, "/live", id)}
            className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
          >
            View live
          </Link>
        )}
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
          href={tournamentPath(locale, null, `/matches/${match.id}`, tournamentId)}
          className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20"
        >
          Judge page
        </Link>
        <Link
          href={tournamentPath(locale, null, "/live", tournamentId)}
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
  const [currentJudge, setCurrentJudge] = useState<BeyliveJudge | null>(null);
  const [eligibleJudges, setEligibleJudges] = useState<Profile[]>([]);
  const [judgeLookup, setJudgeLookup] = useState("");
  const [newJudgeRole, setNewJudgeRole] = useState<"judge" | "scorer">("judge");
  const [newJudgeStadiumNo, setNewJudgeStadiumNo] = useState("1");
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [judgeRoleLoading, setJudgeRoleLoading] = useState(true);
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
  const [stadiumCountInput, setStadiumCountInput] = useState("2");
  const [stadiumForms, setStadiumForms] = useState<Record<number, StadiumForm>>({});
  const [streamBusy, setStreamBusy] = useState(false);
  const [streamSaved, setStreamSaved] = useState(false);
  const [judgeToolsOpen, setJudgeToolsOpen] = useState(false);
  const [streamToolsOpen, setStreamToolsOpen] = useState(false);
  const [idToolsOpen, setIdToolsOpen] = useState(false);
  const [bracketOverviewOpen, setBracketOverviewOpen] = useState(false);
  const [poolStandingsOpen, setPoolStandingsOpen] = useState(true);
  const resolvedTournamentId = tournament?.id ?? "";
  const routeParam = tournamentRouteParam(tournament, id);
  const partnerCacheKey = useMemo(
    () => `spindex.partner-battle.${resolvedTournamentId || id}`,
    [id, resolvedTournamentId],
  );

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: tData } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq(tournamentLookupColumn(id), id)
      .maybeSingle();
    const nextTournament = (tData as unknown as CommunityTournament | null) ?? null;
    const [{ data: mData }, { data: jData }] = nextTournament
      ? await Promise.all([
          supabase
            .from("beylive_matches")
            .select(BEYLIVE_MATCH_SELECT)
            .eq("tournament_id", nextTournament.id)
            .order("round_no", { ascending: true })
            .order("match_no", { ascending: true }),
          supabase
            .from("beylive_judges")
            .select(BEYLIVE_JUDGE_SELECT)
            .eq("tournament_id", nextTournament.id)
            .order("created_at", { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }];
    setTournament(nextTournament);
    setMatches((mData as unknown as BeyliveMatch[]) ?? []);
    setJudges((jData as unknown as BeyliveJudge[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!resolvedTournamentId) return;
    let active = true;
    setJudgeRoleLoading(true);

    const loadJudgeRole = async () => {
      if (!supabase || !profile?.id || !resolvedTournamentId) {
        setCurrentJudge(null);
        setJudgeRole(null);
        setJudgeRoleLoading(false);
        return;
      }
      const { data } = await supabase
        .from("beylive_judges")
        .select(BEYLIVE_JUDGE_SELECT)
        .eq("tournament_id", resolvedTournamentId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (active) {
        const next = (data as unknown as BeyliveJudge | null) ?? null;
        setCurrentJudge(next);
        setJudgeRole(next?.role ?? null);
        setJudgeRoleLoading(false);
      }
    };

    loadJudgeRole();
    if (!supabase || !profile?.id || !resolvedTournamentId) {
      return () => {
        active = false;
      };
    }
    const channel = supabase
      .channel(`beylive-judge-role-${resolvedTournamentId}-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_judges", filter: `tournament_id=eq.${resolvedTournamentId}` }, loadJudgeRole)
      .subscribe();
    return () => {
      active = false;
      supabase?.removeChannel(channel);
    };
  }, [profile?.id, resolvedTournamentId]);

  useEffect(() => {
    if (!tournament) return;
    setStreamUrl(tournament.stream_url ?? "");
    setStreamTitle(tournament.stream_title ?? "");
    setStreamEnabled(Boolean(tournament.stream_enabled && tournament.stream_url));
    setStadiumCountInput(String(beyliveStadiumCount(tournament)));
    setStadiumForms(
      Object.fromEntries(
        beyliveStadiums(tournament).map((stadium) => [
          stadium.stadium_no,
          {
            label: stadium.label,
            streamTitle: stadium.stream_title ?? "",
            streamUrl: stadium.stream_url ?? "",
            streamEnabled: Boolean(stadium.stream_enabled && stadium.stream_url),
          } satisfies StadiumForm,
        ]),
      ),
    );
    setStreamSaved(false);
  }, [
    tournament?.id,
    tournament?.beylive_stadium_count,
    tournament?.stadiums,
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
        .eq("tournament_id", resolvedTournamentId)
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
      .channel(`partner-battle-control-${resolvedTournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "partner_battles",
          filter: `tournament_id=eq.${resolvedTournamentId}`,
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
  }, [id, partnerCacheKey, resolvedTournamentId]);

  useEffect(() => {
    if (!supabase || !resolvedTournamentId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        load();
      }, 150);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    const channel = supabase
      .channel(`beylive-control-${resolvedTournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${resolvedTournamentId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_matches", filter: `tournament_id=eq.${resolvedTournamentId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_players" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_rounds" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_judges", filter: `tournament_id=eq.${resolvedTournamentId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_stadiums", filter: `tournament_id=eq.${resolvedTournamentId}` }, refresh)
      .subscribe();
    const syncChannel = supabase
      .channel(beyliveSyncTopic(resolvedTournamentId))
      .on("broadcast", { event: BEYLIVE_SYNC_EVENT }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", load);
    window.addEventListener("online", load);
    const fallbackRefresh = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.clearInterval(fallbackRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", load);
      window.removeEventListener("online", load);
      supabase?.removeChannel(channel);
      supabase?.removeChannel(syncChannel);
    };
  }, [id, load, resolvedTournamentId]);

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
  const teamEvent = isBeyliveTeamTournament(tournament);
  const groupStage = isBeyliveGroupStageTournament(tournament);
  const podium = useMemo(() => beylivePodium(tournament, matches), [tournament, matches]);
  const [showPodiumModal, setShowPodiumModal] = useState(false);
  const groupPools = useMemo(() => beyliveGroupPools(tournament, matches), [tournament, matches]);
  const poolStageInfo = useMemo(() => beylivePoolStageInfo(tournament), [tournament]);
  const stadiums = useMemo(() => beyliveStadiums(tournament), [tournament]);
  const stadiumCount = beyliveStadiumCount(tournament);
  const activeStadiumStreams = stadiums.filter((stadium) => stadium.stream_enabled && stadium.stream_url).length;
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
  const localPartnerReady = tournament?.format === "partner" && matches.length === 0 && isLocalPartnerLive(localPartnerState);
  const teamMode = teamEvent && (teams.length > 0 || localPartnerReady);
  const scannedPlayerTeam = useMemo(
    () =>
      teamMode && scannedPlayer
        ? teams.find((team) => team.members?.some((member) => member.user_id === scannedPlayer.user_id)) ?? null
        : null,
    [scannedPlayer, teamMode, teams],
  );
  const localMatches = useMemo(() => localPartnerDisplayMatches(localPartnerState), [localPartnerState]);
  const idEntryCount = teamMode
    ? teams.length > 0
      ? teams.length
      : localTeams.length
      : players.length;
  const entryLabel = teamEvent ? "teams" : "players";
  const entryLabelSingular = teamEvent ? "team" : "player";
  const scanSlotLabel = teamEvent ? "Team" : "Player";
  const isHost = !!profile && profile.id === tournament?.host;
  const hasHostControlAccess = hasBeyliveHostControlAccess(profile, tournament);
  const hasGlobalJudgeAccess = hasGlobalBeyliveJudgeAccess(profile);
  const canManage = canAccessBeyliveControl(profile, tournament, judgeRole);
  const currentJudgeStadiumNo = currentJudge?.stadium_no ?? null;
  const currentJudgeStadium = currentJudgeStadiumNo
    ? stadiums.find((stadium) => stadium.stadium_no === currentJudgeStadiumNo)
    : null;
  const globalJudgeUnassigned = hasGlobalJudgeAccess && currentJudgeStadiumNo == null;
  const canScoreMatch = (match: BeyliveMatch) =>
    isHost ||
    globalJudgeUnassigned ||
    (currentJudgeStadiumNo == null && !!judgeRole) ||
    (currentJudgeStadiumNo != null && match.table_no === currentJudgeStadiumNo);
  const currentRound = tournament?.current_round ?? 1;
  const showBracketOverview =
    !teamMode && (tournament?.format === "single_elimination" || tournament?.format === "group_stage" || tournament?.format === "swiss");
  const currentRoundMatches = matches.filter((match) => match.round_no === currentRound);
  const displayMatches = useMemo(() => matches.filter((match) => !isBeyliveByeMatch(match)), [matches]);
  const controlDisplayMatches = useMemo(
    () =>
      !isHost && currentJudgeStadiumNo != null
        ? displayMatches.filter((match) => match.table_no === currentJudgeStadiumNo)
        : displayMatches,
    [currentJudgeStadiumNo, displayMatches, isHost],
  );
  const scanFound = teamMode ? !!scannedTeam || !!scannedLocalTeam || !!scannedPlayerTeam : !!scannedPlayer;
  const canAdvance =
    currentRoundMatches.length > 0 &&
    currentRoundMatches.every((match) => match.status === "completed" || match.status === "cancelled");

  useEffect(() => {
    let active = true;

    const loadEligibleJudges = async () => {
      if (!supabase || !hasHostControlAccess || !tournament) {
        setEligibleJudges([]);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const response = await fetch(`/api/beylive/judges?tournamentId=${encodeURIComponent(tournament.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => null)) as { judges?: Profile[] } | null;
      if (active && response.ok) setEligibleJudges(payload?.judges ?? []);
    };

    loadEligibleJudges();
    return () => {
      active = false;
    };
  }, [hasHostControlAccess, tournament?.id]);

  useEffect(() => {
    if ((Number(newJudgeStadiumNo) || 1) > stadiumCount) {
      setNewJudgeStadiumNo(String(stadiumCount));
    }
  }, [newJudgeStadiumNo, stadiumCount]);

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
      if (!canScoreMatch(match)) {
        setScanMatchMessage("That match is assigned to another stadium.");
        return;
      }
      setScanMatchMessage(`Opening ${matchStageLabel(match, teamMode, groupStage || tournament?.format === "single_elimination", mainRoundLabels)} scoreboard.`);
      setScanPair([]);
      router.push(tournamentPath(locale, tournament, `/matches/${match.id}`, id));
      return;
    }

    const localMatch = findLocalMatchByScannedParticipants(localMatches, participants);
    if (localMatch) {
      setScanMatchMessage("Opening Partner Battle scoreboard.");
      setScanPair([]);
      router.push(tournamentPath(locale, tournament, `/matches/${localMatch.id}`, id));
      return;
    }

    setScanMatchMessage("No active match found for those two scans.");
  };

  const handleScan = (value: string) => {
    setScanValue(value);
    const participant = scannedParticipantFromValue(value);
    if (!participant) {
      setScanMatchMessage(`No ${entryLabelSingular} found for that QR.`);
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
    if (!supabase || !tournament || !hasHostControlAccess) return;
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
    void broadcastBeyliveRefresh(supabase, tournament.id, { reason: kind });
  };

  const runScore = async (
    busyKey: string,
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    matchId?: string,
  ) => {
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
    void broadcastBeyliveRefresh(supabase, resolvedTournamentId || id, { matchId, reason: busyKey });
  };

  const startMatch = (matchId: string) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:start`, () => client.rpc("start_beylive_match", { mid: matchId }), matchId);
  };

  const changeMatchStadium = (matchId: string, stadiumNo: number) => {
    const client = supabase;
    if (!client || !hasHostControlAccess) return;
    runScore(`${matchId}:stadium`, () =>
      client.rpc("set_beylive_match_stadium", { mid: matchId, p_stadium_no: stadiumNo }),
      matchId,
    );
  };

  const addPoint = (matchId: string, userId: string, finish: Finish) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:${userId}:${finish}`, () =>
      client.rpc("record_beylive_point", { mid: matchId, player_id: userId, finish }),
      matchId,
    );
  };

  const addTeamPoint = (matchId: string, teamId: string, finish: Finish) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:${teamId}:${finish}`, () =>
      client.rpc("record_beylive_team_point", { mid: matchId, p_team_id: teamId, finish }),
      matchId,
    );
  };

  const undoMatchPoint = (matchId: string) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:undo`, () => client.rpc("undo_beylive_point", { mid: matchId }), matchId);
  };

  const completeMatchManually = (matchId: string) => {
    const client = supabase;
    if (!client) return;
    runScore(`${matchId}:complete`, () => client.rpc("complete_beylive_match", { mid: matchId }), matchId);
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
    void broadcastBeyliveRefresh(supabase, tournament.id, { reason: "local-partner-state" });
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
    if (!supabase || !tournament || !hasHostControlAccess) return;
    const lookup = judgeLookup.trim();
    if (!lookup) return;
    const stadiumNo = Math.max(1, Math.min(stadiumCount, Number(newJudgeStadiumNo) || 1));

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
        stadiumNo,
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
    void broadcastBeyliveRefresh(supabase, tournament.id, { reason: "judge-assign" });
  };

  const removeJudge = async (userId: string) => {
    if (!supabase || !tournament || !hasHostControlAccess) return;
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
    void broadcastBeyliveRefresh(supabase, tournament.id, { reason: "judge-remove" });
  };

  const saveStream = async () => {
    if (!supabase || !tournament || !hasHostControlAccess) return;

    const nextUrl = streamUrl.trim();
    const nextTitle = streamTitle.trim();
    const nextStadiumCount = Math.max(1, Math.min(16, Number(stadiumCountInput) || stadiumCount));
    const stadiumRows = Array.from({ length: nextStadiumCount }, (_, index) => {
      const stadiumNo = index + 1;
      const form = stadiumForms[stadiumNo] ?? {
        label: `Stadium ${stadiumNo}`,
        streamTitle: "",
        streamUrl: "",
        streamEnabled: false,
      };
      const cleanUrl = form.streamUrl.trim();
      const cleanTitle = form.streamTitle.trim();
      const cleanLabel = form.label.trim() || `Stadium ${stadiumNo}`;
      return {
        tournament_id: tournament.id,
        stadium_no: stadiumNo,
        label: cleanLabel,
        stream_url: cleanUrl || null,
        stream_title: cleanTitle || null,
        stream_enabled: form.streamEnabled && !!cleanUrl,
        updated_at: new Date().toISOString(),
      };
    });
    const stadium1 = stadiumRows[0];
    const stadium2 = stadiumRows[1];
    setStreamBusy(true);
    setStreamSaved(false);
    setError(null);

    const { error: err } = await supabase
      .from("tournaments")
      .update({
        beylive_stadium_count: nextStadiumCount,
        stream_url: nextUrl || null,
        stream_title: nextTitle || null,
        stream_enabled: streamEnabled && !!nextUrl,
        stadium1_stream_url: stadium1?.stream_url ?? null,
        stadium1_stream_title: stadium1?.stream_title ?? null,
        stadium1_stream_enabled: stadium1?.stream_enabled ?? false,
        stadium2_stream_url: stadium2?.stream_url ?? null,
        stadium2_stream_title: stadium2?.stream_title ?? null,
        stadium2_stream_enabled: stadium2?.stream_enabled ?? false,
      })
      .eq("id", tournament.id);

    if (err) {
      setStreamBusy(false);
      setError(err.message.replace(/_/g, " "));
      return;
    }

    const { error: stadiumError } = await supabase
      .from("beylive_stadiums")
      .upsert(stadiumRows, { onConflict: "tournament_id,stadium_no" });

    setStreamBusy(false);
    if (stadiumError) {
      setError(stadiumError.message.replace(/_/g, " "));
      return;
    }

    setStreamSaved(true);
    load();
    void broadcastBeyliveRefresh(supabase, tournament.id, { reason: "stream-save" });
  };

  if (!enabled || !supabase) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">Supabase is not configured.</div>;
  }
  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">Loading BEYLIVE Control...</p>;
  if (!tournament) return <p className="py-16 text-center text-sm text-ink-dim">Tournament not found.</p>;
  if (judgeRoleLoading && profile && !hasHostControlAccess && !hasGlobalJudgeAccess) {
    return <p className="py-16 text-center text-sm text-ink-dim">Checking BEYLIVE access...</p>;
  }
  if (!canManage) {
    return (
      <div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link href={tournamentPath(locale, tournament, "", id)} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
            Back to tournament
          </Link>
          <Link href={tournamentPath(locale, tournament, "/live", id)} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
            Public BEYLIVE
          </Link>
        </div>
        <div className="panel border-bal/40 p-5">
          <div className="font-display text-sm font-bold tracking-wider text-bal">BEYLIVE Control restricted</div>
          <p className="mt-2 text-sm text-ink-dim">
            Only the approved tournament host or a BEYLIVE judge can access this control page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={tournamentPath(locale, tournament, "", id)} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          Back to tournament
        </Link>
        <Link href={tournamentPath(locale, tournament, "/live", id)} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
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
        {canManage && !isHost && (
          <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
            {currentJudgeStadium
              ? `Judge mode active for ${currentJudgeStadium.label}.`
              : hasGlobalJudgeAccess
                ? "Global BEYLIVE judge mode active."
                : "Judge mode active."} Scan both {entryLabel} to open the match scoreboard.
          </p>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-atk">{error}</p>}
        {hasHostControlAccess && (
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
                  <div className="mt-0.5 text-xs text-ink-dim">
                    Assign backend-approved BEYLIVE judges to a stadium.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setJudgeToolsOpen((open) => !open)}
                  className="clip-x border border-edge bg-panel px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
                >
                  {judgeToolsOpen ? "Hide" : "Show"}
                </button>
              </div>
              {judgeToolsOpen ? (
                <>
                  <form onSubmit={assignJudge} className="mt-3 grid gap-2 md:grid-cols-[1fr_110px_140px_auto]">
                    <select
                      value={judgeLookup}
                      onChange={(event) => setJudgeLookup(event.target.value)}
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      <option value="">Select approved judge</option>
                      {eligibleJudges.map((judge) => (
                        <option key={judge.id} value={judge.player_code ?? judge.id}>
                          {profileDisplayName(judge)} ({beylivePlayerCode(judge)})
                        </option>
                      ))}
                    </select>
                    <select
                      value={newJudgeRole}
                      onChange={(event) => setNewJudgeRole(event.target.value === "scorer" ? "scorer" : "judge")}
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      <option value="judge">Judge</option>
                      <option value="scorer">Scorer</option>
                    </select>
                    <select
                      value={newJudgeStadiumNo}
                      onChange={(event) => setNewJudgeStadiumNo(event.target.value)}
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      {stadiums.map((stadium) => (
                        <option key={stadium.stadium_no} value={stadium.stadium_no}>
                          {stadium.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={judgeBusy || !judgeLookup.trim()}
                      className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
                    >
                      {judgeBusy ? "Saving..." : "Assign"}
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
                        const stadium = judge.stadium_no
                          ? stadiums.find((item) => item.stadium_no === judge.stadium_no)
                          : null;
                        return (
                          <div key={judge.user_id} className="rounded-md border border-edge bg-panel px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{profileDisplayName(judge.profile)}</div>
                                <div className="font-mono text-[11px] text-ink-dim">{beylivePlayerCode(judge.profile)}</div>
                                <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide">
                                  <span className="rounded bg-accent-2/10 px-1.5 py-0.5 text-accent-2">
                                    {isTournamentHost ? "Host" : judge.role}
                                  </span>
                                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-ink-dim">
                                    {isTournamentHost ? "All stadiums" : stadium?.label ?? "All stadiums"}
                                  </span>
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
                </>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-ink-dim">
                  <span className="rounded bg-panel px-2 py-1">{judges.length} assigned</span>
                  <span className="rounded bg-panel px-2 py-1">{eligibleJudges.length} approved available</span>
                </div>
              )}
            </div>

            <div className="rounded-md border border-edge bg-bg/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display text-xs font-bold tracking-[0.2em] text-accent-2">LIVE STREAMS</div>
                  <div className="mt-0.5 text-xs text-ink-dim">YouTube Live, Twitch, Facebook, or Vimeo URLs</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {streamToolsOpen && (
                    <button
                      onClick={saveStream}
                      disabled={streamBusy}
                      className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition enabled:hover:bg-accent/20 disabled:opacity-40"
                    >
                      {streamBusy ? "Saving..." : "Save stream"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStreamToolsOpen((open) => !open)}
                    className="clip-x border border-edge bg-panel px-3 py-2 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
                  >
                    {streamToolsOpen ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {streamToolsOpen ? (
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

                <div className="rounded-md border border-edge bg-panel/60 p-3">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-accent">
                    Active stadiums
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={stadiumCountInput}
                    onChange={(event) => setStadiumCountInput(event.target.value)}
                    className="w-28 rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <p className="mt-1 text-[10px] text-ink-dim">
                    New and uncompleted matches are assigned within this stadium count.
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {Array.from({ length: Math.max(1, Math.min(16, Number(stadiumCountInput) || stadiumCount)) }, (_, index) => {
                    const stadiumNo = index + 1;
                    const form = stadiumForms[stadiumNo] ?? {
                      label: `Stadium ${stadiumNo}`,
                      streamTitle: "",
                      streamUrl: "",
                      streamEnabled: false,
                    };
                    const setForm = (patch: Partial<StadiumForm>) =>
                      setStadiumForms((current) => ({
                        ...current,
                        [stadiumNo]: { ...form, ...current[stadiumNo], ...patch },
                      }));

                    return (
                      <div key={stadiumNo} className="rounded-md border border-edge bg-panel/60 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="font-display text-[10px] font-bold uppercase tracking-wider text-accent">
                            {form.label || `Stadium ${stadiumNo}`}
                          </div>
                          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                            <input
                              type="checkbox"
                              checked={form.streamEnabled}
                              onChange={(event) => setForm({ streamEnabled: event.target.checked })}
                              className="h-4 w-4 accent-accent"
                            />
                            On air
                          </label>
                        </div>
                        <div className="grid gap-2">
                          <input
                            value={form.label}
                            onChange={(event) => setForm({ label: event.target.value })}
                            maxLength={40}
                            placeholder={`Stadium ${stadiumNo}`}
                            className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                          />
                          <input
                            value={form.streamTitle}
                            onChange={(event) => setForm({ streamTitle: event.target.value })}
                            maxLength={80}
                            placeholder={`${form.label || `Stadium ${stadiumNo}`} title`}
                            className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                          />
                          <input
                            value={form.streamUrl}
                            onChange={(event) => setForm({ streamUrl: event.target.value })}
                            maxLength={500}
                            placeholder={`${form.label || `Stadium ${stadiumNo}`} stream URL`}
                            className="rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-ink-dim">
                  <span className="rounded bg-panel px-2 py-1">{stadiumCount} stadiums</span>
                  <span className="rounded bg-panel px-2 py-1">{activeStadiumStreams} stadium feeds on air</span>
                  {streamEnabled && streamUrl && <span className="rounded bg-panel px-2 py-1">Event feed on air</span>}
                </div>
              )}
              {streamSaved && <div className="mt-2 text-xs font-semibold text-accent">Stream saved.</div>}
            </div>
          </div>
        )}
      </section>

      {podium && podium.length > 0 && (
        <section className="panel mt-4 border-accent/40 bg-accent/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-display text-sm font-bold tracking-wider text-accent">🏆 Podium</div>
            {hasHostControlAccess && (
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
              dateLabel: shareDateLabel(tournament.starts_at, locale),
              venueLabel: [tournament.city, tournament.venue].filter(Boolean).join(" - "),
              participantsLabel: `${players.length} ${entryLabel}`,
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-display text-sm font-bold tracking-wider text-ink-dim">
              Pool standings <span className="font-normal text-ink-dim">({poolStageInfo.label})</span>
            </div>
            <button
              type="button"
              aria-expanded={poolStandingsOpen}
              aria-controls="pool-standings-grid"
              onClick={() => setPoolStandingsOpen((open) => !open)}
              className="clip-x border border-edge bg-panel px-3 py-2 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
            >
              {poolStandingsOpen ? "Minimize" : "Show"}
            </button>
          </div>
          {poolStandingsOpen ? (
            <div id="pool-standings-grid" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {groupPools.map(({ poolNo, standings }) => (
                <div key={poolNo} className="rounded-md border border-edge bg-panel p-3">
                  <div className="mb-2 font-display text-xs font-bold tracking-wider text-accent-2">Pool {poolNo}</div>
                  <div className="grid gap-1">
                    {standings.map((row, index) => (
                      <div
                        key={row.id}
                        className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                          index < poolStageInfo.perPoolCut ? "bg-accent/10 text-accent" : "text-ink-dim"
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
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-ink-dim">
              <span className="rounded bg-panel px-2 py-1">Standings minimized</span>
              <span className="rounded bg-panel px-2 py-1">{groupPools.length} pools</span>
            </div>
          )}
        </section>
      )}

      {showBracketOverview && (
        <section className="panel mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-sm font-bold tracking-wider text-ink">Bracket overview</div>
              <div className="mt-1 text-xs text-ink-dim">
                {knockoutBracketMatches.filter((match) => match.status === "completed").length}/{knockoutBracketMatches.length} matches complete
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBracketOverviewOpen((open) => !open)}
              className="clip-x border border-edge bg-panel px-3 py-2 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
            >
              {bracketOverviewOpen ? "Hide" : "Show"}
            </button>
          </div>
          {bracketOverviewOpen ? (
            <BeyliveBracketView
              matches={matches}
              locale={locale}
              tournamentId={routeParam}
              currentRound={currentRound}
              className="mt-4"
              framed={false}
              showHeader={false}
            />
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-ink-dim">
              <span className="rounded bg-panel px-2 py-1">Bracket hidden</span>
              <span className="rounded bg-panel px-2 py-1">{knockoutBracketMatches.length} matches</span>
            </div>
          )}
        </section>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="grid gap-4 xl:sticky xl:top-24 xl:self-start">
          <BeyliveScanner
            onScan={handleScan}
          />
          {canManage && (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-xs font-bold tracking-wider text-accent">Judge match scan</div>
                  <div className="mt-0.5 text-[11px] text-ink-dim">
                    Scan {entryLabelSingular} 1 and {entryLabelSingular} 2
                  </div>
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
                      <div className="text-[10px] uppercase tracking-wide text-ink-dim">{scanSlotLabel} {slot + 1}</div>
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
                    : `No ${entryLabelSingular} found for ${scanValue}`}
                </p>
              )}
            </div>
          )}
          <div className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-sm font-bold tracking-wider text-ink-dim">
                  {teamEvent ? "Team IDs and QR" : "Player IDs and QR"}
                </div>
                <div className="mt-0.5 text-xs text-ink-dim">
                  {idEntryCount} {entryLabel} ready for scan
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIdToolsOpen((open) => !open)}
                className="clip-x border border-edge bg-panel px-3 py-2 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
              >
                {idToolsOpen ? "Hide" : "Show"}
              </button>
            </div>
            {idToolsOpen ? (
              <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1 thin-scroll">
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
            ) : (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-ink-dim">
                <span className="rounded bg-panel px-2 py-1">{idEntryCount} IDs</span>
                <span className="rounded bg-panel px-2 py-1">QR list hidden</span>
                {scanValue && scanFound && <span className="rounded bg-accent/10 px-2 py-1 text-accent">scan matched</span>}
              </div>
            )}
          </div>
        </aside>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-display text-sm font-bold tracking-wider text-ink-dim">Match control</div>
            <div className="text-xs text-ink-dim">
              {localPartnerReady ? localMatches.length : controlDisplayMatches.length} matches
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
                  tournamentId={routeParam}
                  onScore={reportLocalPartnerMatch}
                />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-dim">Start BEYLIVE to generate matches from the existing tournament format.</p>
          ) : groupStage ? (
            <div className="grid gap-4">
              {poolRoundGroups.map(({ roundNo, matches: roundMatches }) => {
                const visibleRoundMatches =
                  !isHost && currentJudgeStadiumNo != null
                    ? roundMatches.filter((match) => match.table_no === currentJudgeStadiumNo)
                    : roundMatches;
                if (visibleRoundMatches.length === 0) return null;
                const pending = visibleRoundMatches.filter((m) => m.status !== "completed" && m.status !== "cancelled").length;
                const needsAttention = roundNo === currentRound;
                return (
                  <details key={roundNo} open={needsAttention} className="group rounded-md border border-edge">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 font-display text-xs font-bold tracking-wider text-accent-2">
                      <span>Round {roundNo}</span>
                      <span className="font-normal text-ink-dim">
                        {pending === 0 ? "all matches done" : `${pending} left · ${visibleRoundMatches.length} total`}
                      </span>
                    </summary>
                    <div className="grid gap-3 p-3 pt-0">
                      {visibleRoundMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          teamMode={teamMode}
                          groupStage={groupStage || tournament?.format === "single_elimination"}
                          mainRoundLabels={mainRoundLabels}
                          locale={locale}
                          id={routeParam}
                          canScore={canScoreMatch(match)}
                          canEditStadium={hasHostControlAccess}
                          stadiums={stadiums}
                          scoreBusy={scoreBusy}
                          onStart={startMatch}
                          onChangeStadium={changeMatchStadium}
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
                    {knockoutBracketMatches
                      .filter((match) => isHost || currentJudgeStadiumNo == null || match.table_no === currentJudgeStadiumNo)
                      .map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        teamMode={teamMode}
                        groupStage={groupStage || tournament?.format === "single_elimination"}
                        mainRoundLabels={mainRoundLabels}
                        locale={locale}
                        id={routeParam}
                        canScore={canScoreMatch(match)}
                        canEditStadium={hasHostControlAccess}
                        stadiums={stadiums}
                        scoreBusy={scoreBusy}
                        onStart={startMatch}
                        onChangeStadium={changeMatchStadium}
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
              {controlDisplayMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teamMode={teamMode}
                  groupStage={groupStage || tournament?.format === "single_elimination"}
                  mainRoundLabels={mainRoundLabels}
                  locale={locale}
                  id={routeParam}
                  canScore={canScoreMatch(match)}
                  canEditStadium={hasHostControlAccess}
                  stadiums={stadiums}
                  scoreBusy={scoreBusy}
                  onStart={startMatch}
                  onChangeStadium={changeMatchStadium}
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
