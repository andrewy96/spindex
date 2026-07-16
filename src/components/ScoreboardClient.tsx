"use client";

import { useEffect, useMemo, useState } from "react";
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

const FINISHES: { key: Finish; color: string; label: (d: Dict) => string }[] = [
  { key: "spin", color: "var(--color-sta)", label: (d) => d.battle.finishSpin },
  { key: "over", color: "var(--color-def)", label: (d) => d.battle.finishOver },
  { key: "burst", color: "var(--color-spc)", label: (d) => d.battle.finishBurst },
  { key: "xtreme", color: "var(--color-atk)", label: (d) => d.battle.finishXtreme },
];

export default function ScoreboardClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const params = useSearchParams();
  const challengeId = params.get("c");
  const { profile } = useAuth();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [freeTargetScore, setFreeTargetScore] = useState(DEFAULT_WIN_SCORE);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [reportState, setReportState] = useState<"idle" | "busy" | "done" | "error">("idle");

  useEffect(() => {
    if (!supabase || !challengeId) return;
    supabase
      .from("challenges")
      .select(
        "*, host_profile:profiles!challenges_host_fkey(*), opponent_profile:profiles!challenges_opponent_fkey(*)"
      )
      .eq("id", challengeId)
      .maybeSingle()
      .then(({ data }) => {
        const c = data as unknown as Challenge | null;
        if (c && c.status === "accepted") {
          setChallenge(c);
          setName1(`@${c.host_profile?.handle ?? "?"}`);
          setName2(`@${c.opponent_profile?.handle ?? "?"}`);
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

  const targetScore = challenge?.target_score ?? freeTargetScore;
  const winner = s1 >= targetScore ? 1 : s2 >= targetScore ? 2 : null;
  const firstToLabel = dict.battle.firstToPoints.replace("{points}", String(targetScore));

  const addRound = (side: 1 | 2, finish: Finish) => {
    if (winner) return;
    setRounds([...rounds, { side, finish, pts: FINISH_POINTS[finish] }]);
  };
  const undo = () => setRounds(rounds.slice(0, -1));
  const reset = () => {
    setRounds([]);
    setReportState("idle");
  };

  const isParticipant =
    !!profile && !!challenge && (profile.id === challenge.host || profile.id === challenge.opponent);

  const report = async () => {
    if (!supabase || !challenge || !winner) return;
    setReportState("busy");
    const { error } = await supabase.rpc("report_match", {
      cid: challenge.id,
      p_rounds: rounds,
      s_host: s1,
      s_opp: s2,
    });
    setReportState(error ? "error" : "done");
  };

  const players: { n: 1 | 2; name: string; setName: (v: string) => void; score: number }[] = [
    { n: 1, name: name1, setName: setName1, score: s1 },
    { n: 2, name: name2, setName: setName2, score: s2 },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {!challenge && (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-xs text-ink-dim">
          <span>{dict.battle.freePlay}</span>
          <label className="flex items-center gap-2">
            <span>{dict.battle.targetScore}</span>
            <input
              type="number"
              min={1}
              max={30}
              value={freeTargetScore}
              onChange={(e) =>
                setFreeTargetScore(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
              }
              disabled={rounds.length > 0}
              className="w-16 rounded-md border border-edge bg-panel px-2 py-1 text-center text-ink outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
          <span>{firstToLabel}</span>
        </div>
      )}
      {challenge && (
        <p className="mb-4 text-center text-xs text-accent-2">
          ⚔ {name1} vs {name2} ·{" "}
          {challenge.format === "team" ? dict.battle.teamEvent : dict.battle.singleBattle} ·
          ★{challenge.wager} · {firstToLabel}
        </p>
      )}

      {/* Score display */}
      <div className="panel bg-grid mb-4 grid grid-cols-2 divide-x divide-edge">
        {players.map((p) => (
          <div key={p.n} className="flex flex-col items-center gap-2 p-6">
            {challenge ? (
              <div className="max-w-full truncate text-sm font-semibold">{p.name}</div>
            ) : (
              <input
                value={p.name}
                onChange={(e) => p.setName(e.target.value)}
                placeholder={p.n === 1 ? dict.battle.player1 : dict.battle.player2}
                className="w-full max-w-40 rounded-md border border-edge bg-panel px-2 py-1 text-center text-sm outline-none focus:border-accent"
              />
            )}
            <div
              className={`font-display text-7xl font-black ${
                winner === p.n ? "text-glow text-accent" : ""
              }`}
            >
              {p.score}
            </div>
            {winner === p.n && (
              <div className="font-display text-sm font-bold tracking-[0.3em] text-accent">
                🏆 {dict.battle.winner}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Finish buttons */}
      <div className="grid grid-cols-2 gap-4">
        {players.map((p) => (
          <div key={p.n} className="grid grid-cols-2 gap-2">
            {FINISHES.map((f) => (
              <button
                key={f.key}
                onClick={() => addRound(p.n, f.key)}
                disabled={!!winner}
                className="rounded-lg border px-2 py-3 font-display text-xs font-bold tracking-wide transition enabled:hover:brightness-125 disabled:opacity-30"
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
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={undo}
          disabled={rounds.length === 0 || reportState === "done"}
          className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider transition enabled:hover:border-accent-2/60 enabled:hover:text-accent-2 disabled:opacity-40"
        >
          ↩ {dict.battle.undo}
        </button>
        <button
          onClick={reset}
          disabled={rounds.length === 0 || reportState === "done"}
          className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
        >
          {dict.battle.resetMatch}
        </button>
        {winner && challenge && isParticipant && reportState !== "done" && (
          <button
            onClick={report}
            disabled={reportState === "busy"}
            className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {dict.battle.reportResult}
          </button>
        )}
      </div>

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
