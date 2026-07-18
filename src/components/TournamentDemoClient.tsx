"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Locale } from "@/i18n";
import {
  champion,
  DemoFormat,
  DemoMatch,
  firstRound,
  MIN_WIN_SCORE,
  nextRound,
  scoreWinner,
  standings,
  swissRoundCount,
} from "@/lib/demoBracket";

const MOCK_NAMES = [
  "DranSword",
  "HellsScythe",
  "WizardArrow",
  "KnightShield",
  "PhoenixWing",
  "SharkEdge",
  "CobaltDrake",
  "TyrannoBeat",
  "WhaleWave",
  "SteelSamurai",
  "ViperTail",
  "BearScratch",
];

const L = {
  zh: {
    demoBadge: "演示模式 — 模拟数据，不会写入数据库",
    title: "OTG Cup（演示）",
    meta: "Kuala Lumpur · OTG · 2026年7月20日 20:00",
    hostedBy: "主办: andrew",
    joined: "已加入",
    format: "赛制",
    addOne: "+1 玩家加入",
    addEight: "+8 玩家加入",
    start: "开始比赛",
    needTwo: "至少需要 2 名玩家",
    lineup: "名单",
    noPlayers: "暂无玩家",
    round: "第 {n} 轮",
    losersRound: "败者组 · 第 {n} 轮",
    grandFinal: "总决赛",
    bye: "轮空",
    standingsTitle: "积分榜",
    winsShort: "胜",
    lossesShort: "负",
    tableRank: "#",
    tablePlayer: "玩家",
    tableRecord: "胜负",
    tableDiff: "净胜分",
    tablePts: "得分",
    confirmScore: "确认比分",
    scoreTie: "比分不可打平，请分出胜负",
    scoreTooLow: "获胜分数需至少 {n} 分",
    editScore: "编辑",
    cancelEdit: "取消",
    swissOf: "瑞士轮 · 共 {n} 轮",
    champion: "🏆 冠军",
    reset: "重置演示",
    back: "返回赛事",
    started: "比赛进行中",
    completed: "比赛结束",
    lbHint: "排行榜模式：自由记录胜负，按胜场排名。",
    recordWin: "+胜",
    recordLoss: "+负",
    finish: "结束比赛",
    ffaHint: "多人混战：每组一名胜者晋级。",
    doubleHint: "双败淘汰（简化版）：输两场才出局，胜者组冠军对阵败者组冠军。",
    formats: {
      single_elimination: "单败淘汰",
      double_elimination: "双败淘汰",
      round_robin: "循环赛",
      swiss: "瑞士轮",
      free_for_all: "多人混战",
      leaderboard: "排行榜",
    } as Record<DemoFormat, string>,
  },
  en: {
    demoBadge: "Demo mode — mock data, nothing is written to the database",
    title: "OTG Cup (Demo)",
    meta: "Kuala Lumpur · OTG · 20 Jul 2026, 20:00",
    hostedBy: "Host: andrew",
    joined: "Joined",
    format: "Format",
    addOne: "+1 player joins",
    addEight: "+8 players join",
    start: "Start tournament",
    needTwo: "Need at least 2 players",
    lineup: "Lineup",
    noPlayers: "No players yet",
    round: "Round {n}",
    losersRound: "Losers · Round {n}",
    grandFinal: "Grand Final",
    bye: "Bye",
    standingsTitle: "Standings",
    winsShort: "W",
    lossesShort: "L",
    tableRank: "#",
    tablePlayer: "Player",
    tableRecord: "W-L",
    tableDiff: "Diff",
    tablePts: "Pts",
    confirmScore: "Confirm score",
    scoreTie: "Scores can't tie — enter a winner",
    scoreTooLow: "Winning score must be at least {n}",
    editScore: "Edit",
    cancelEdit: "Cancel",
    swissOf: "Swiss · {n} rounds",
    champion: "🏆 Champion",
    reset: "Reset demo",
    back: "Back to tournaments",
    started: "In progress",
    completed: "Completed",
    lbHint: "Leaderboard mode: record results freely, ranked by wins.",
    recordWin: "+Win",
    recordLoss: "+Loss",
    finish: "Finish tournament",
    ffaHint: "Free-for-all: one winner per group advances.",
    doubleHint: "Double elimination (simplified): out after two losses, winners champ meets losers champ.",
    formats: {
      single_elimination: "Single elimination",
      double_elimination: "Double elimination",
      round_robin: "Round robin",
      swiss: "Swiss",
      free_for_all: "Free-for-all",
      leaderboard: "Leaderboard",
    } as Record<DemoFormat, string>,
  },
};

interface LbRow {
  wins: number;
  losses: number;
}

export default function TournamentDemoClient({ locale }: { locale: Locale }) {
  const t = L[locale] ?? L.en;
  const [phase, setPhase] = useState<"open" | "started" | "completed">("open");
  const [format, setFormat] = useState<DemoFormat>("swiss");
  const [playerCount, setPlayerCount] = useState(0);
  const [matches, setMatches] = useState<DemoMatch[]>([]);
  const [round, setRound] = useState(1);
  const [lb, setLb] = useState<Record<number, LbRow>>({});
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const ids = useMemo(() => Array.from({ length: playerCount }, (_, i) => i), [playerCount]);
  const nameOf = (id: number) => MOCK_NAMES[id % MOCK_NAMES.length];

  const rows = useMemo(() => standings(ids, matches), [ids, matches]);
  const champ = useMemo(
    () => (phase === "open" ? null : champion(format, ids, matches, round)),
    [phase, format, ids, matches, round]
  );

  const lbRows = useMemo(
    () =>
      ids
        .map((id) => ({ id, wins: lb[id]?.wins ?? 0, losses: lb[id]?.losses ?? 0 }))
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses),
    [ids, lb]
  );

  const addPlayers = (n: number) => setPlayerCount((c) => Math.min(12, c + n));

  const start = () => {
    setMatches(firstRound(format, ids));
    setRound(1);
    setPhase("started");
  };

  const reset = () => {
    setPhase("open");
    setPlayerCount(0);
    setMatches([]);
    setRound(1);
    setLb({});
    setEditingMatchId(null);
  };

  const report = (matchId: string, scores: Record<number, number>) => {
    setMatches((prev) => {
      const match = prev.find((m) => m.id === matchId);
      const winnerId = match ? scoreWinner(match.players, scores) : null;
      if (!match || winnerId === null) return prev;
      const next = prev.map((m) => (m.id === matchId ? { ...m, winner: winnerId, scores } : m));

      // Correcting an earlier round's score shouldn't regenerate a bracket
      // that has already moved on — just fix the record for standings.
      if (next.some((m) => m.round > match.round)) return next;

      const current = next.filter((m) => m.round === match.round);
      if (current.every((m) => m.winner !== null)) {
        const upcoming = nextRound(format, ids, next, match.round);
        if (upcoming.length > 0) {
          setRound(match.round + 1);
          return [...next, ...upcoming];
        }
        if (format !== "round_robin" || next.every((m) => m.winner !== null)) {
          setPhase("completed");
        }
      }
      return next;
    });
    setEditingMatchId(null);
  };

  const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 1);
  const roundsList = Array.from({ length: maxRound }, (_, i) => i + 1);

  const formatLabel = t.formats[format];
  const statusLabel = phase === "open" ? `${t.joined}: ${playerCount}/12` : phase === "started" ? t.started : t.completed;

  return (
    <div>
      <div className="mb-4 rounded-md border border-accent-2/40 bg-accent-2/10 px-4 py-2 text-xs font-semibold text-accent-2">
        {t.demoBadge}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/${locale}/tournaments`}
          className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink"
        >
          {t.back}
        </Link>
        <button
          onClick={reset}
          className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60"
        >
          {t.reset}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-wide">{t.title}</h1>
                <p className="mt-1 text-sm text-ink-dim">{t.meta}</p>
                <p className="mt-1 text-xs text-ink-dim">{t.hostedBy}</p>
              </div>
              <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">
                {formatLabel}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
              <span className="rounded bg-panel px-2 py-0.5 text-accent">{statusLabel}</span>
              {phase !== "open" && format === "swiss" && (
                <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">
                  {t.swissOf.replace("{n}", String(swissRoundCount(ids.length)))}
                </span>
              )}
            </div>

            {phase === "open" && (
              <div className="mt-5 grid gap-3">
                <div>
                  <label htmlFor="demo-format" className="mb-1 block text-xs text-ink-dim">{t.format}</label>
                  <select
                    id="demo-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as DemoFormat)}
                    className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition focus:border-accent"
                  >
                    {(Object.keys(t.formats) as DemoFormat[]).map((f) => (
                      <option key={f} value={f}>
                        {t.formats[f]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => addPlayers(1)}
                    disabled={playerCount >= 12}
                    className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition enabled:hover:border-accent-2/60 disabled:opacity-50"
                  >
                    {t.addOne}
                  </button>
                  <button
                    onClick={() => addPlayers(8)}
                    disabled={playerCount >= 12}
                    className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition enabled:hover:border-accent-2/60 disabled:opacity-50"
                  >
                    {t.addEight}
                  </button>
                  <button
                    onClick={start}
                    disabled={playerCount < 2}
                    className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                    title={playerCount < 2 ? t.needTwo : undefined}
                  >
                    {t.start}
                  </button>
                </div>
                {playerCount < 2 && <p className="text-xs text-ink-dim">{t.needTwo}</p>}
              </div>
            )}

            {champ !== null && (
              <div className="mt-5 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 font-display text-sm font-bold tracking-wider text-accent">
                {t.champion}: {nameOf(champ)}
              </div>
            )}
          </div>

          {phase !== "open" && format === "leaderboard" && (
            <div className="panel mt-4 p-5">
              <p className="mb-3 text-xs text-ink-dim">{t.lbHint}</p>
              <ol className="space-y-1 text-sm">
                {lbRows.map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between rounded bg-panel px-3 py-1.5">
                    <span className="text-ink-dim">
                      #{i + 1} {nameOf(r.id)}
                      <span className="ml-2 text-xs text-accent">
                        {r.wins}{t.winsShort} / {r.losses}{t.lossesShort}
                      </span>
                    </span>
                    {phase === "started" && (
                      <span className="flex gap-1">
                        <button
                          onClick={() =>
                            setLb((p) => ({ ...p, [r.id]: { wins: (p[r.id]?.wins ?? 0) + 1, losses: p[r.id]?.losses ?? 0 } }))
                          }
                          className="rounded bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent transition hover:bg-accent/25"
                        >
                          {t.recordWin}
                        </button>
                        <button
                          onClick={() =>
                            setLb((p) => ({ ...p, [r.id]: { wins: p[r.id]?.wins ?? 0, losses: (p[r.id]?.losses ?? 0) + 1 } }))
                          }
                          className="rounded bg-atk/15 px-2 py-0.5 text-xs font-bold text-atk transition hover:bg-atk/25"
                        >
                          {t.recordLoss}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {phase === "started" && (
                <button
                  onClick={() => setPhase("completed")}
                  className="clip-x mt-4 bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
                >
                  {t.finish}
                </button>
              )}
            </div>
          )}

          {phase !== "open" &&
            format !== "leaderboard" &&
            roundsList.map((r) => {
              const roundMatches = matches.filter((m) => m.round === r);
              if (roundMatches.length === 0) return null;
              const main = roundMatches.filter((m) => m.bracket === "main");
              const losers = roundMatches.filter((m) => m.bracket === "losers");
              const grand = roundMatches.filter((m) => m.bracket === "grand");
              const section = (label: string | null, list: DemoMatch[]) =>
                list.length === 0 ? null : (
                  <div key={label ?? "main"} className="mt-3">
                    {label && (
                      <div className="mb-2 font-display text-xs font-bold tracking-wider text-ink-dim">{label}</div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((m) => (
                        <div key={m.id} className="rounded-md border border-edge bg-panel p-3">
                          {m.players.length === 1 ? (
                            <p className="text-sm text-ink-dim">
                              {nameOf(m.players[0])} — <span className="text-accent-2">{t.bye}</span>
                            </p>
                          ) : m.winner !== null && editingMatchId !== m.id ? (
                            <div>
                              <div className="grid gap-1">
                                {m.players.map((p) => (
                                  <div
                                    key={p}
                                    className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                                      m.winner === p ? "bg-accent/20 font-bold text-accent" : "text-ink-dim/50"
                                    }`}
                                  >
                                    <span className={m.winner === p ? "" : "line-through"}>{nameOf(p)}</span>
                                    <span>{m.scores?.[p] ?? 0}</span>
                                  </div>
                                ))}
                              </div>
                              <button
                                onClick={() => setEditingMatchId(m.id)}
                                className="mt-1.5 text-[10px] font-semibold text-ink-dim underline decoration-dotted transition hover:text-accent-2"
                              >
                                {t.editScore}
                              </button>
                            </div>
                          ) : (
                            <MatchScoreForm
                              match={m}
                              nameOf={nameOf}
                              onConfirm={(scores) => report(m.id, scores)}
                              onCancel={m.winner !== null ? () => setEditingMatchId(null) : undefined}
                              confirmLabel={t.confirmScore}
                              cancelLabel={t.cancelEdit}
                              tieError={t.scoreTie}
                              lowScoreError={t.scoreTooLow.replace("{n}", String(MIN_WIN_SCORE))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              return (
                <div key={r} className="panel mt-4 p-5">
                  <div className="font-display text-sm font-bold tracking-wider">
                    {t.round.replace("{n}", String(r))}
                  </div>
                  {format === "free_for_all" && r === 1 && (
                    <p className="mt-1 text-xs text-ink-dim">{t.ffaHint}</p>
                  )}
                  {format === "double_elimination" && r === 1 && (
                    <p className="mt-1 text-xs text-ink-dim">{t.doubleHint}</p>
                  )}
                  {section(losers.length > 0 || grand.length > 0 ? t.round.replace("{n}", String(r)) : null, main)}
                  {section(t.losersRound.replace("{n}", String(r)), losers)}
                  {section(t.grandFinal, grand)}
                </div>
              );
            })}
        </div>

        <div className="panel h-fit p-5">
          <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
            {phase === "open" || format === "leaderboard" ? t.lineup : t.standingsTitle}
          </div>
          {playerCount === 0 ? (
            <p className="text-sm text-ink-dim">{t.noPlayers}</p>
          ) : phase === "open" || format === "leaderboard" ? (
            <ol className="space-y-1 text-sm text-ink-dim">
              {ids.map((id, i) => (
                <li key={id} className="rounded bg-panel px-2 py-1">
                  #{i + 1} {nameOf(id)}
                </li>
              ))}
            </ol>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-dim">
                    <th className="py-1 pr-1 text-left font-medium">{t.tableRank}</th>
                    <th className="py-1 pr-1 text-left font-medium">{t.tablePlayer}</th>
                    <th className="py-1 pr-1 text-right font-medium">{t.tableRecord}</th>
                    <th className="py-1 pr-1 text-right font-medium">{t.tableDiff}</th>
                    <th className="py-1 text-right font-medium">{t.tablePts}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-edge/60">
                      <td className="py-1.5 pr-1 text-ink-dim">{i + 1}</td>
                      <td className="py-1.5 pr-1 text-ink">{nameOf(r.id)}</td>
                      <td className="py-1.5 pr-1 text-right text-ink-dim">
                        {r.wins}-{r.losses}
                      </td>
                      <td
                        className={`py-1.5 pr-1 text-right font-semibold ${
                          r.diff > 0 ? "text-accent" : r.diff < 0 ? "text-atk" : "text-ink-dim"
                        }`}
                      >
                        {r.diff > 0 ? `+${r.diff}` : r.diff}
                      </td>
                      <td className="py-1.5 text-right text-ink-dim">{r.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchScoreForm({
  match,
  nameOf,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  tieError,
  lowScoreError,
}: {
  match: DemoMatch;
  nameOf: (id: number) => string;
  onConfirm: (scores: Record<number, number>) => void;
  onCancel?: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  tieError: string;
  lowScoreError: string;
}) {
  const [values, setValues] = useState<Record<number, string>>(() =>
    match.scores
      ? Object.fromEntries(match.players.map((p) => [p, String(match.scores?.[p] ?? 0)]))
      : {}
  );
  const [error, setError] = useState<"tie" | "low" | null>(null);

  const submit = () => {
    const scores: Record<number, number> = {};
    for (const p of match.players) scores[p] = Math.max(0, Number(values[p]) || 0);
    const winnerId = scoreWinner(match.players, scores);
    if (winnerId === null) {
      setError("tie");
      return;
    }
    if (scores[winnerId] < MIN_WIN_SCORE) {
      setError("low");
      return;
    }
    setError(null);
    onConfirm(scores);
  };

  return (
    <div>
      <div className="grid gap-1.5">
        {match.players.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="flex-1 truncate text-sm text-ink">{nameOf(p)}</span>
            <input
              type="number"
              min={0}
              value={values[p] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
              placeholder="0"
              className="w-14 rounded border border-edge bg-panel-2 px-2 py-1 text-center text-sm outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          className="clip-x flex-1 bg-accent px-2 py-1.5 font-display text-[10px] font-bold tracking-wider text-bg transition hover:brightness-110"
        >
          {confirmLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
          >
            {cancelLabel}
          </button>
        )}
      </div>
      {error === "tie" && <p className="mt-1 text-[10px] text-atk">{tieError}</p>}
      {error === "low" && <p className="mt-1 text-[10px] text-atk">{lowScoreError}</p>}
    </div>
  );
}
