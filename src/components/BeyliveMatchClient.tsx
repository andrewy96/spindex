"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  BEYLIVE_MATCH_SELECT,
  BeyliveMatch,
  FINISH_POINTS,
  Finish,
  supabase,
} from "@/lib/supabase";
import {
  beyliveParticipantCode,
  beyliveParticipantName,
  beyliveParticipantQrValue,
  beyliveParticipantWon,
  beyliveStatusLabel,
} from "@/lib/beylive";
import {
  localPartnerDisplayMatches,
  localPartnerMode,
  localPartnerStageLabel,
  localPartnerTableLabel,
  localPartnerTeamCode,
  localPartnerTeamName,
  LocalPartnerState,
  PARTNER_WIN_SCORE,
  scoreLocalPartnerMatch,
  TeamMatch,
} from "@/lib/beylivePartner";
import { profileDisplayName } from "@/lib/profileName";
import QrCodeBadge from "./QrCodeBadge";

const FINISHES: { key: Finish; label: string; color: string }[] = [
  { key: "spin", label: "Spin +1", color: "var(--color-sta)" },
  { key: "over", label: "Over +2", color: "var(--color-def)" },
  { key: "burst", label: "Burst +2", color: "var(--color-spc)" },
  { key: "xtreme", label: "Xtreme +3", color: "var(--color-atk)" },
];

function matchStageLabel(match: BeyliveMatch) {
  if (match.bracket === "grand") return "Championship";
  if (match.bracket === "losers") return "Consolation";
  return `Round ${match.round_no}`;
}

function LocalPartnerScoreForm({
  match,
  state,
  disabled,
  onConfirm,
}: {
  match: TeamMatch;
  state: LocalPartnerState;
  disabled: boolean;
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
    <div className="mt-5 grid gap-3">
      {match.teams.map((teamId) => {
        const won = match.winner === teamId;
        return (
          <div key={teamId} className={`rounded-md border p-4 ${won ? "border-accent bg-accent/10" : "border-edge bg-panel"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{localPartnerTeamName(state, teamId)}</div>
                <div className="font-mono text-[11px] text-ink-dim">{localPartnerTeamCode(state, teamId)}</div>
              </div>
              <QrCodeBadge value={localPartnerTeamCode(state, teamId)} size={56} />
            </div>
            <div className="mt-3 flex items-end gap-3">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={values[teamId] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [teamId]: event.target.value }))}
                placeholder="0"
                className="w-28 rounded-md border border-edge bg-panel-2 px-3 py-2 text-center font-display text-5xl font-black text-ink outline-none focus:border-accent"
              />
              <span className="pb-2 text-xs text-ink-dim">points</span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="clip-x bg-accent px-5 py-3 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
      >
        Confirm score
      </button>
      {tie && <p className="text-sm font-semibold text-atk">Scores cannot tie.</p>}
    </div>
  );
}

function LocalPartnerMatchPanel({
  match,
  state,
  allMatches,
  busy,
  error,
  onScore,
}: {
  match: TeamMatch;
  state: LocalPartnerState;
  allMatches: TeamMatch[];
  busy: string | null;
  error: string | null;
  onScore: (scores: Record<string, number>) => void;
}) {
  const mode = localPartnerMode(state);

  return (
    <section className="panel bg-grid p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-xs font-bold tracking-[0.28em] text-accent">BEYLIVE SCOREBOARD</div>
          <h1 className="mt-2 font-display text-2xl font-black tracking-wide">
            {localPartnerStageLabel(match, mode)}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            First to {PARTNER_WIN_SCORE} - {localPartnerTableLabel(allMatches, match)}
          </p>
        </div>
        <div className="rounded-md border border-edge bg-panel px-4 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-ink-dim">Status</div>
          <div className="font-display text-lg font-black text-accent">
            {match.winner ? "Completed" : "Scheduled"}
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-atk">{error}</p>}

      {match.teams.length === 1 ? (
        <div className="mt-5 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
          {localPartnerTeamCode(state, match.teams[0])} {localPartnerTeamName(state, match.teams[0])} has a bye.
        </div>
      ) : (
        <LocalPartnerScoreForm
          match={match}
          state={state}
          disabled={!!busy}
          onConfirm={onScore}
        />
      )}
    </section>
  );
}

export default function BeyliveMatchClient({
  tournamentId,
  matchId,
  locale,
}: {
  tournamentId: string;
  matchId: string;
  locale: Locale;
}) {
  const { enabled, profile } = useAuth();
  const [match, setMatch] = useState<BeyliveMatch | null>(null);
  const [localPartnerState, setLocalPartnerState] = useState<LocalPartnerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data }, { data: partnerData }] = await Promise.all([
      supabase
        .from("beylive_matches")
        .select(BEYLIVE_MATCH_SELECT)
        .eq("id", matchId)
        .maybeSingle(),
      supabase
        .from("partner_battles")
        .select("state")
        .eq("tournament_id", tournamentId)
        .maybeSingle(),
    ]);
    setMatch((data as unknown as BeyliveMatch | null) ?? null);
    setLocalPartnerState((partnerData?.state as LocalPartnerState | undefined) ?? null);
    setLoading(false);
  }, [matchId, tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`beylive-match-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_matches", filter: `id=eq.${matchId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_players", filter: `match_id=eq.${matchId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "beylive_match_rounds", filter: `match_id=eq.${matchId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_battles", filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [load, matchId, tournamentId]);

  const players = useMemo(
    () => [...(match?.players ?? [])].sort((a, b) => a.slot_no - b.slot_no),
    [match],
  );
  const rounds = useMemo(
    () => [...(match?.rounds ?? [])].sort((a, b) => a.id - b.id),
    [match],
  );
  const localMatches = useMemo(() => localPartnerDisplayMatches(localPartnerState), [localPartnerState]);
  const localMatch = useMemo(
    () => (!match ? localMatches.find((item) => item.id === matchId) ?? null : null),
    [localMatches, match, matchId],
  );

  const run = async (
    label: string,
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    setBusy(label);
    setError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) {
      setError(err.message.replace(/_/g, " "));
      return;
    }
    load();
  };

  const addPoint = (userId: string, finish: Finish) => {
    const client = supabase;
    if (!client) return;
    run(`${userId}:${finish}`, () =>
      client.rpc("record_beylive_point", {
        mid: matchId,
        player_id: userId,
        finish,
      }),
    );
  };

  const addTeamPoint = (teamId: string, finish: Finish) => {
    const client = supabase;
    if (!client) return;
    run(`${teamId}:${finish}`, () =>
      client.rpc("record_beylive_team_point", {
        mid: matchId,
        p_team_id: teamId,
        finish,
      }),
    );
  };

  const start = () => {
    const client = supabase;
    if (!client) return;
    run("start", () => client.rpc("start_beylive_match", { mid: matchId }));
  };

  const undo = () => {
    const client = supabase;
    if (!client) return;
    run("undo", () => client.rpc("undo_beylive_point", { mid: matchId }));
  };

  const complete = () => {
    const client = supabase;
    if (!client) return;
    run("complete", () => client.rpc("complete_beylive_match", { mid: matchId }));
  };

  const reportLocalPartnerMatch = async (scores: Record<string, number>) => {
    if (!supabase || !localPartnerState || !localMatch) return;

    const nextState = scoreLocalPartnerMatch(localPartnerState, localMatch.id, scores);
    if (!nextState) {
      setError("Scores cannot tie. Enter one winning team.");
      return;
    }

    setBusy("local-score");
    setError(null);
    const { error: stateError } = await supabase
      .from("partner_battles")
      .upsert({
        tournament_id: tournamentId,
        state: nextState,
        updated_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      });

    if (stateError) {
      setBusy(null);
      setError(stateError.message.replace(/_/g, " "));
      return;
    }

    await supabase
      .from("tournaments")
      .update({
        live_enabled: true,
        status: "started",
        current_round: nextState.round ?? localMatch.round,
        target_score: PARTNER_WIN_SCORE,
      })
      .eq("id", tournamentId);

    setBusy(null);
    setLocalPartnerState(nextState);
    load();
  };

  if (!enabled || !supabase) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">Supabase is not configured.</div>;
  }
  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">Loading match...</p>;
  if (!match && !localMatch) return <p className="py-16 text-center text-sm text-ink-dim">Match not found.</p>;

  if (!match && localMatch && localPartnerState) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link href={`/${locale}/tournaments/${tournamentId}/control`} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
            BEYLIVE Control
          </Link>
          <Link href={`/${locale}/tournaments/${tournamentId}/live`} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
            Public Live
          </Link>
        </div>

        <LocalPartnerMatchPanel
          match={localMatch}
          state={localPartnerState}
          allMatches={localMatches}
          busy={busy}
          error={error}
          onScore={reportLocalPartnerMatch}
        />
      </div>
    );
  }

  const beyliveMatch = match as BeyliveMatch;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/${locale}/tournaments/${tournamentId}/control`} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          BEYLIVE Control
        </Link>
        <Link href={`/${locale}/tournaments/${tournamentId}/live`} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
          Public Live
        </Link>
      </div>

      <section className="panel bg-grid p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-xs font-bold tracking-[0.28em] text-accent">BEYLIVE SCOREBOARD</div>
            <h1 className="mt-2 font-display text-2xl font-black tracking-wide">
              {matchStageLabel(beyliveMatch)} · Table {beyliveMatch.table_no ?? beyliveMatch.match_no}
            </h1>
            <p className="mt-1 text-sm text-ink-dim">First to {beyliveMatch.target_score} · Match {beyliveMatch.match_no}</p>
          </div>
          <div className="rounded-md border border-edge bg-panel px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-dim">Status</div>
            <div className="font-display text-lg font-black text-accent">{beyliveStatusLabel(beyliveMatch.status)}</div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-atk">{error}</p>}

        <div className={`mt-5 grid gap-3 ${players.length > 2 ? "sm:grid-cols-2" : "grid-cols-2"}`}>
          {players.map((player) => {
            const won = beyliveParticipantWon(beyliveMatch, player);
            return (
              <div key={player.team_id ?? player.user_id} className={`rounded-md border p-4 ${won ? "border-accent bg-accent/10" : "border-edge bg-panel"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{beyliveParticipantName(player)}</div>
                    <div className="font-mono text-[11px] text-ink-dim">{beyliveParticipantCode(player)}</div>
                  </div>
                  <QrCodeBadge value={beyliveParticipantQrValue(player)} size={56} />
                </div>
                <div className={`mt-3 font-display text-7xl font-black ${won ? "text-glow text-accent" : "text-ink"}`}>
                  {player.score}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {FINISHES.map((finish) => (
                    <button
                      key={finish.key}
                      onClick={() =>
                        player.team_id ? addTeamPoint(player.team_id, finish.key) : addPoint(player.user_id, finish.key)
                      }
                      disabled={beyliveMatch.status === "completed" || !!busy}
                      className="rounded-md border px-2 py-2 font-display text-[11px] font-bold tracking-wide transition enabled:hover:brightness-125 disabled:opacity-35"
                      style={{
                        borderColor: `color-mix(in srgb, ${finish.color} 45%, transparent)`,
                        background: `color-mix(in srgb, ${finish.color} 12%, transparent)`,
                        color: finish.color,
                      }}
                    >
                      {finish.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={start}
            disabled={beyliveMatch.status !== "scheduled" || !!busy}
            className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
          >
            Start
          </button>
          <button
            onClick={undo}
            disabled={rounds.length === 0 || !!busy}
            className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={complete}
            disabled={beyliveMatch.status === "completed" || !!busy}
            className="clip-x border border-accent-2/50 bg-accent-2/10 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-accent-2 transition enabled:hover:bg-accent-2/20 disabled:opacity-40"
          >
            Complete
          </button>
        </div>
      </section>

      {rounds.length > 0 && (
        <section className="panel mt-4 p-4">
          <div className="mb-2 font-display text-xs font-bold tracking-wider text-ink-dim">Point log</div>
          <div className="flex flex-wrap gap-1.5">
            {rounds.map((round) => {
              const player = players.find((p) =>
                round.team_id ? p.team_id === round.team_id : p.user_id === round.user_id,
              );
              const color =
                round.finish === "spin"
                  ? "var(--color-sta)"
                  : round.finish === "over"
                    ? "var(--color-def)"
                    : round.finish === "burst"
                      ? "var(--color-spc)"
                      : "var(--color-atk)";
              return (
                <span
                  key={round.id}
                  className="rounded px-2 py-1 font-display text-[10px] font-bold"
                  style={{
                    color,
                    background: `color-mix(in srgb, ${color} 12%, transparent)`,
                  }}
                >
                  {player ? beyliveParticipantCode(player) : profileDisplayName(round.profile)} {round.finish} +{FINISH_POINTS[round.finish]}
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
