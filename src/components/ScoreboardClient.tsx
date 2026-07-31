"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  supabase,
  Challenge,
  Finish,
  Round,
  FINISH_POINTS,
  DEFAULT_WIN_SCORE,
} from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";
import {
  ShareCardData,
  ShareOutcome,
  finishShareLabels,
  outcomeHeader,
  shareDateLabel,
  shareSiteLabel,
} from "@/lib/shareCard";
import Fireworks from "./Fireworks";
import ShareMatchModal from "./ShareMatchModal";
import ShootStart from "./ShootStart";

const CHALLENGE_SELECT =
  "*, host_profile:profiles!challenges_host_fkey(*), opponent_profile:profiles!challenges_opponent_fkey(*), player1_profile:profiles!challenges_player1_fkey(*), player2_profile:profiles!challenges_player2_fkey(*)";

const FINISHES: { key: Finish; color: string; label: (d: Dict) => string }[] = [
  { key: "spin", color: "var(--color-sta)", label: (d) => d.battle.finishSpin },
  { key: "over", color: "var(--color-def)", label: (d) => d.battle.finishOver },
  { key: "burst", color: "var(--color-spc)", label: (d) => d.battle.finishBurst },
  { key: "xtreme", color: "var(--color-atk)", label: (d) => d.battle.finishXtreme },
];

export default function ScoreboardClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const params = useSearchParams();
  const challengeId = params.get("c");
  const { profile, refreshProfile } = useAuth();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [freeTargetScore, setFreeTargetScore] = useState(DEFAULT_WIN_SCORE);
  /** Free play only: no point limit — the match runs until someone calls it. */
  const [endless, setEndless] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [reportState, setReportState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [shareOpen, setShareOpen] = useState(false);
  /** Last tap, so the scored points can float up off that player's total. */
  const [pulse, setPulse] = useState<{ side: 1 | 2; pts: number; id: number } | null>(null);
  const pulseId = useRef(0);

  useEffect(() => {
    if (!supabase || !challengeId) return;
    supabase
      .from("challenges")
      .select(CHALLENGE_SELECT)
      .eq("id", challengeId)
      .maybeSingle()
      .then(({ data }) => {
        const c = data as unknown as Challenge | null;
        if (c && c.status === "accepted") {
          setChallenge(c);
          const p1 = c.play_mode === "judge" ? c.player1_profile : c.host_profile;
          const p2 = c.play_mode === "judge" ? c.player2_profile : c.opponent_profile;
          setName1(profileDisplayName(p1));
          setName2(profileDisplayName(p2));
        }
      });
  }, [challengeId]);

  const [s1, s2] = useMemo(() => {
    let a = 0;
    let b = 0;
    for (const r of rounds) {
      if (r.side === 1) a += r.pts;
      else b += r.pts;
    }
    return [a, b];
  }, [rounds]);

  /** null when there is no point limit — only free play can be endless. */
  const targetScore: number | null = challenge
    ? challenge.target_score
    : endless
      ? null
      : freeTargetScore;
  const winner: 1 | 2 | null =
    targetScore === null
      ? ended && s1 !== s2
        ? s1 > s2
          ? 1
          : 2
        : null
      : s1 >= targetScore
        ? 1
        : s2 >= targetScore
          ? 2
          : null;
  /** No more scoring once a winner is decided or the endless match was called. */
  const locked = winner !== null || ended;
  const firstToLabel =
    targetScore === null
      ? dict.battle.noPointLimit
      : dict.battle.firstToPoints.replace("{points}", String(targetScore));

  const addRound = (side: 1 | 2, finish: Finish) => {
    if (locked) return;
    const pts = FINISH_POINTS[finish];
    pulseId.current += 1;
    setPulse({ side, pts, id: pulseId.current });
    navigator.vibrate?.(25);
    setRounds([...rounds, { side, finish, pts }]);
  };
  const undo = () => {
    setEnded(false);
    setPulse(null);
    setRounds(rounds.slice(0, -1));
  };
  const reset = () => {
    setRounds([]);
    setEnded(false);
    setPulse(null);
    setReportState("idle");
  };

  useEffect(() => {
    if (winner) navigator.vibrate?.([40, 70, 140]);
  }, [winner]);

  const canReport =
    !!profile &&
    !!challenge &&
    (challenge.play_mode === "judge"
      ? profile.id === challenge.host
      : profile.id === challenge.host || profile.id === challenge.opponent);

  const report = async () => {
    if (!supabase || !challenge || !winner) return;
    setReportState("busy");
    const { error } = await supabase.rpc("report_match", {
      cid: challenge.id,
      p_rounds: rounds,
      s_host: s1,
      s_opp: s2,
    });
    if (error) {
      setReportState("error");
      return;
    }
    await refreshProfile();
    setReportState("done");
  };

  const players: { n: 1 | 2; name: string; setName: (v: string) => void; score: number }[] = [
    { n: 1, name: name1, setName: setName1, score: s1 },
    { n: 2, name: name2, setName: setName2, score: s2 },
  ];

  const buildShareData = (winnerSide: 1 | 2): ShareCardData => {
    // side 1 = host / player1, side 2 = opponent / player2 (matches report_match args)
    const viewerSide: 1 | 2 | null =
      !profile || !challenge
        ? null
        : challenge.play_mode === "judge"
          ? profile.id === challenge.player1
            ? 1
            : profile.id === challenge.player2
              ? 2
              : null
          : profile.id === challenge.host
            ? 1
            : profile.id === challenge.opponent
              ? 2
              : null;
    const outcome: ShareOutcome =
      viewerSide === null ? "neutral" : viewerSide === winnerSide ? "victory" : "defeat";
    return {
      p1Name: name1 || dict.battle.player1,
      p2Name: name2 || dict.battle.player2,
      p1Score: s1,
      p2Score: s2,
      winnerSide,
      outcome,
      rounds,
      dateLabel: shareDateLabel(new Date(), locale),
      formatLabel:
        challenge?.format === "team"
          ? dict.battle.teamFormat.replace(/\{count\}/g, String(challenge.team_size ?? 1))
          : dict.battle.singleBattle,
      stars: challenge?.wager ?? 0,
      firstToLabel,
      locale,
      labels: {
        header: outcomeHeader(outcome, dict),
        winner: dict.battle.winner,
        finish: finishShareLabels(dict),
        url: shareSiteLabel(),
      },
    };
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {!challenge && (
        <div className="panel mb-3 flex flex-col items-center gap-2 px-3 py-3 sm:mb-4">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-dim">{dict.battle.targetScore}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={freeTargetScore}
                onChange={(e) =>
                  setFreeTargetScore(Math.max(1, Math.min(99, Number(e.target.value) || 1)))
                }
                disabled={endless || rounds.length > 0}
                className="w-16 rounded-md border border-edge bg-panel px-2 py-1.5 text-center text-base font-bold text-ink outline-none focus:border-accent disabled:opacity-40"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={endless}
                onChange={(e) => setEndless(e.target.checked)}
                disabled={rounds.length > 0}
                className="size-4 accent-[var(--color-accent)] disabled:opacity-40"
              />
              <span className={endless ? "font-semibold text-accent-2" : "text-ink-dim"}>
                {dict.battle.unlimited}
              </span>
            </label>
          </div>
          <div className="space-y-0.5 text-center text-xs">
            <div className={`font-semibold ${endless ? "text-accent-2" : "text-accent"}`}>
              {firstToLabel}
            </div>
            <div className="text-ink-dim">{dict.battle.freePlay}</div>
          </div>
        </div>
      )}
      {challenge && (
        <p className="mb-3 text-center text-xs text-accent-2 sm:mb-4">
          ⚔ {name1} vs {name2} ·{" "}
          {challenge.format === "team" ? dict.battle.teamEvent : dict.battle.singleBattle} ·
          ★{challenge.wager} · {firstToLabel}
        </p>
      )}

      {/* Score display */}
      <div className="panel bg-grid mb-3 grid grid-cols-2 divide-x divide-edge overflow-hidden sm:mb-4">
        {players.map((p) => (
          <div
            key={p.n}
            className={`relative flex flex-col items-center gap-2 px-2 py-5 transition-colors sm:px-4 sm:py-7 ${
              winner === p.n ? "bg-accent/[0.07]" : ""
            }`}
          >
            {challenge ? (
              <div className="max-w-full truncate text-sm font-semibold">{p.name}</div>
            ) : (
              <input
                value={p.name}
                onChange={(e) => p.setName(e.target.value)}
                placeholder={p.n === 1 ? dict.battle.player1 : dict.battle.player2}
                className="w-full max-w-44 rounded-md border border-edge bg-panel px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
              />
            )}
            <div className="relative">
              <div
                key={p.score}
                className={`animate-score-bump font-display text-[4.5rem] font-black leading-none tabular-nums sm:text-8xl ${
                  winner === p.n ? "text-glow text-accent" : ""
                }`}
              >
                {p.score}
              </div>
              {pulse?.side === p.n && (
                <span
                  key={pulse.id}
                  aria-hidden
                  className="animate-score-float pointer-events-none absolute left-full top-1 ml-1 font-display text-2xl font-black text-accent-2 drop-shadow-[0_0_10px_rgba(56,217,255,0.7)] sm:text-3xl"
                >
                  +{pulse.pts}
                </span>
              )}
            </div>
            {winner === p.n && (
              <div className="animate-winner-pulse font-display text-sm font-bold tracking-[0.25em] text-accent sm:text-base">
                🏆 {dict.battle.winner}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Start / countdown — free play only (no account needed) */}
      {!challenge && <ShootStart dict={dict} disabled={locked} />}

      {/* Finish buttons — one 2x2 pad per player, thumb-sized on phones */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {players.map((p) => (
          <div key={p.n} className="grid grid-cols-2 gap-1.5 sm:gap-2">
            {FINISHES.map((f) => (
              <button
                key={f.key}
                onClick={() => addRound(p.n, f.key)}
                disabled={locked}
                className="flex min-h-16 touch-manipulation select-none items-center justify-center rounded-lg border px-1 py-3 text-center font-display text-[0.8rem] font-bold leading-tight tracking-wide transition duration-75 enabled:active:scale-95 enabled:active:brightness-150 enabled:hover:brightness-125 disabled:opacity-30 sm:min-h-20 sm:text-base"
                style={{
                  borderColor: `color-mix(in srgb, ${f.color} 45%, transparent)`,
                  background: `color-mix(in srgb, ${f.color} 12%, transparent)`,
                  color: f.color,
                }}
              >
                {f.label(dict)}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:mt-4">
        <button
          onClick={undo}
          disabled={rounds.length === 0 || reportState === "done"}
          className="clip-x border border-edge bg-panel px-5 py-3 font-display text-sm font-bold tracking-wider transition enabled:hover:border-accent-2/60 enabled:hover:text-accent-2 disabled:opacity-40"
        >
          ↩ {dict.battle.undo}
        </button>
        {targetScore === null && !ended && (
          <button
            onClick={() => setEnded(true)}
            disabled={rounds.length === 0 || s1 === s2}
            className="clip-x bg-accent px-5 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-40"
          >
            {dict.battle.endMatch}
          </button>
        )}
        <button
          onClick={reset}
          disabled={rounds.length === 0 || reportState === "done"}
          className="clip-x border border-edge bg-panel px-5 py-3 font-display text-sm font-bold tracking-wider text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
        >
          {dict.battle.resetMatch}
        </button>
        {winner && challenge && canReport && reportState !== "done" && (
          <button
            onClick={report}
            disabled={reportState === "busy"}
            className="clip-x bg-accent px-5 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {dict.battle.reportResult}
          </button>
        )}
        {winner && (
          <button
            onClick={() => setShareOpen(true)}
            className="clip-x border border-accent-2/50 bg-accent-2/10 px-5 py-3 font-display text-sm font-bold tracking-wider text-accent-2 transition hover:bg-accent-2/20"
          >
            ⤴ {dict.battle.share}
          </button>
        )}
      </div>

      {winner && !shareOpen && <Fireworks />}

      {shareOpen && winner && (
        <ShareMatchModal
          data={buildShareData(winner)}
          fileId={challenge?.id ?? "freeplay"}
          dict={dict}
          onClose={() => setShareOpen(false)}
        />
      )}

      {reportState === "done" && (
        <p className="mt-4 text-center text-sm font-semibold text-accent">
          ✓ {dict.battle.reported}
        </p>
      )}
      {reportState === "error" && (
        <p className="mt-4 text-center text-sm font-semibold text-atk">
          {dict.battle.errorGeneric}
        </p>
      )}

      {/* Round log */}
      {rounds.length > 0 && (
        <div className="panel mt-6 p-4">
          <div className="flex flex-wrap gap-1.5">
            {rounds.map((r, i) => {
              const f = FINISHES.find((x) => x.key === r.finish)!;
              return (
                <span
                  key={i}
                  className="rounded px-2 py-1 font-display text-[10px] font-bold"
                  style={{
                    color: f.color,
                    background: `color-mix(in srgb, ${f.color} 12%, transparent)`,
                  }}
                >
                  {(r.side === 1 ? name1 || dict.battle.player1 : name2 || dict.battle.player2)}{" "}
                  +{r.pts}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-8 text-center">
        <Link href={`/${locale}/battle`} className="text-xs text-ink-dim hover:text-accent">
          ← {dict.battle.title}
        </Link>
      </p>
    </div>
  );
}
