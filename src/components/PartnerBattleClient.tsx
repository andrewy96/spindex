"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Locale } from "@/i18n";
import SpinWheel from "@/components/SpinWheel";
import {
  champion,
  firstSwissRound,
  nextRound,
  PARTNER_WIN_SCORE,
  Player,
  scoreWinner,
  standings,
  swissRoundCount,
  Team,
  TeamMatch,
  teamsFromDraw,
  uid,
} from "@/lib/partnerBattle";

/** Registered walk-ins for the OTG Penang open-bey partner cup. */
const PRESET_NAMES = [
  "Han",
  "CH",
  "Eric",
  "Kai Ping",
  "Andy",
  "Wayne",
  "Norman",
  "Yun",
  "Alwin",
  "Yan",
  "Vincent Yeoh",
  "Wylern",
];

const STORAGE_KEY = "spindex.partner-battle.v1";

type Phase = "roster" | "draw" | "battle";

interface PersistState {
  phase: Phase;
  players: Player[];
  draw: string[];
  teams: Team[];
  matches: TeamMatch[];
  round: number;
}

const L = {
  en: {
    title: "Partner Battle",
    eventName: "OTG Penang · Open Bey Partner Cup",
    meta: "OTG Penang · Mon 27 Jul 2026, 8:00 PM · RM12 per person",
    rulesTitle: "Rules",
    rules: [
      "Random partner — drawn on the wheel during registration",
      "3 Beys per team",
      "First to 7 points wins",
      "Metal Bit banned",
      "Swiss battle — top 2 teams enter the final",
      "1 stadium · 1 judge",
      "Champion receives a cash prize",
    ],
    back: "Back to tournaments",
    reset: "Reset event",
    resetConfirm: "Reset the whole event? Players, teams and scores will be cleared.",
    // roster
    rosterTitle: "Players",
    rosterHint: "Add or remove bladers before the partner draw.",
    addPlaceholder: "Add blader name",
    add: "Add",
    loadPreset: "Load OTG list",
    clearAll: "Clear all",
    remove: "Remove",
    playerCount: "{n} bladers",
    startDraw: "Start partner draw",
    needFour: "Add at least 4 bladers to run a partner draw",
    oddNote: "Odd number of bladers — the last team will have 3 members.",
    // draw
    drawTitle: "Partner Draw",
    drawHint: "Spin to draw each blader. Every two draws forms a team.",
    spin: "Spin",
    undrawn: "In the wheel",
    forming: "Forming team",
    teamsFormed: "Teams",
    drawDone: "All partners drawn",
    startBattle: "Start Swiss battle",
    redraw: "Redraw partners",
    autoLast: "Auto-draw the last two",
    // battle
    battleTitle: "Swiss Battle",
    swissOf: "Swiss · {n} rounds",
    round: "Round {n}",
    grandFinal: "🏆 Grand Final",
    bye: "Bye",
    vs: "vs",
    firstTo: "First to {n}",
    confirmScore: "Confirm score",
    edit: "Edit",
    cancel: "Cancel",
    scoreTie: "Scores can't tie — enter a winner",
    standingsTitle: "Standings",
    tableRank: "#",
    tableTeam: "Team",
    tableRecord: "W–L",
    tableDiff: "Diff",
    tablePts: "Pts",
    top2: "TOP 2",
    champion: "Champion",
    inProgress: "In progress",
    completed: "Completed",
  },
  zh: {
    title: "双人组队赛",
    eventName: "OTG 槟城 · 开放战陀组队杯",
    meta: "OTG 槟城 · 2026年7月27日 周一 20:00 · 每人 RM12",
    rulesTitle: "赛规",
    rules: [
      "随机搭档 — 报到时转盘抽取",
      "每队 3 颗战陀",
      "先得 7 分者胜",
      "禁用金属轴 (Metal Bit)",
      "瑞士轮 — 前 2 名进入决赛",
      "1 个战盘 · 1 名裁判",
      "冠军获得现金奖励",
    ],
    back: "返回赛事",
    reset: "重置赛事",
    resetConfirm: "确定重置整个赛事？玩家、队伍和比分都会清空。",
    rosterTitle: "玩家",
    rosterHint: "抽签前可添加或移除玩家。",
    addPlaceholder: "输入玩家名字",
    add: "添加",
    loadPreset: "载入 OTG 名单",
    clearAll: "全部清除",
    remove: "移除",
    playerCount: "{n} 名玩家",
    startDraw: "开始搭档抽签",
    needFour: "至少需要 4 名玩家才能抽搭档",
    oddNote: "玩家人数为奇数 — 最后一队将有 3 人。",
    drawTitle: "搭档抽签",
    drawHint: "转动转盘抽取玩家，每抽两人组成一队。",
    spin: "转动",
    undrawn: "转盘中",
    forming: "正在组队",
    teamsFormed: "队伍",
    drawDone: "全部搭档已抽出",
    startBattle: "开始瑞士轮",
    redraw: "重新抽签",
    autoLast: "自动抽最后两人",
    battleTitle: "瑞士轮对战",
    swissOf: "瑞士轮 · 共 {n} 轮",
    round: "第 {n} 轮",
    grandFinal: "🏆 总决赛",
    bye: "轮空",
    vs: "对",
    firstTo: "先得 {n} 分",
    confirmScore: "确认比分",
    edit: "编辑",
    cancel: "取消",
    scoreTie: "比分不可打平，请分出胜负",
    standingsTitle: "积分榜",
    tableRank: "#",
    tableTeam: "队伍",
    tableRecord: "胜-负",
    tableDiff: "净胜分",
    tablePts: "得分",
    top2: "前二",
    champion: "冠军",
    inProgress: "进行中",
    completed: "已结束",
  },
};

export default function PartnerBattleClient({ locale }: { locale: Locale }) {
  const t = L[locale] ?? L.en;

  const [phase, setPhase] = useState<Phase>("roster");
  const [players, setPlayers] = useState<Player[]>([]);
  const [draw, setDraw] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [round, setRound] = useState(1);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Restore any in-progress event from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as PersistState;
        setPhase(s.phase ?? "roster");
        setPlayers(s.players ?? []);
        setDraw(s.draw ?? []);
        setTeams(s.teams ?? []);
        setMatches(s.matches ?? []);
        setRound(s.round ?? 1);
      }
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
  }, []);

  // Persist on every change once the initial load is done.
  useEffect(() => {
    if (!loaded) return;
    const s: PersistState = { phase, players, draw, teams, matches, round };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [loaded, phase, players, draw, teams, matches, round]);

  const nameOf = useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? "?";
  }, [players]);

  const teamLabel = useMemo(() => {
    const map = new Map(teams.map((tm) => [tm.id, tm.members.map(nameOf).join(" & ")]));
    return (id: string) => map.get(id) ?? "?";
  }, [teams, nameOf]);

  const teamIds = useMemo(() => teams.map((tm) => tm.id), [teams]);
  const rows = useMemo(() => standings(teamIds, matches), [teamIds, matches]);
  const champ = useMemo(
    () => (phase === "battle" ? champion(teamIds, matches, round) : null),
    [phase, teamIds, matches, round]
  );

  const undrawn = useMemo(
    () => players.filter((p) => !draw.includes(p.id)),
    [players, draw]
  );

  // ---- roster actions ----
  const addPlayer = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setPlayers((prev) => [...prev, { id: uid("p"), name: clean }]);
  };
  const removePlayer = (id: string) => setPlayers((prev) => prev.filter((p) => p.id !== id));
  const loadPreset = () =>
    setPlayers(PRESET_NAMES.map((name) => ({ id: uid("p"), name })));
  const clearAll = () => setPlayers([]);

  const startDraw = () => {
    setDraw([]);
    setTeams([]);
    setMatches([]);
    setRound(1);
    setPhase("draw");
  };

  // ---- draw actions ----
  const onWheelResult = (id: string) => setDraw((prev) => [...prev, id]);
  const autoLastTwo = () => setDraw((prev) => [...prev, ...undrawn.map((p) => p.id)]);
  const redraw = () => {
    setDraw([]);
    setTeams([]);
  };
  const startBattle = () => {
    const formed = teamsFromDraw(draw);
    setTeams(formed);
    const ids = formed.map((tm) => tm.id);
    setMatches(firstSwissRound(ids));
    setRound(1);
    setPhase("battle");
  };

  // Live preview of the forming teams — simple pairs, no odd-fold, so a
  // half-picked team reads as "forming" rather than a premature trio.
  const drawnTeams = useMemo(() => {
    const out: Team[] = [];
    for (let i = 0; i < draw.length; i += 2) {
      out.push({ id: `preview-${i}`, members: draw.slice(i, i + 2) });
    }
    return out;
  }, [draw]);

  // ---- battle actions ----
  const report = (matchId: string, scores: Record<string, number>) => {
    setMatches((prev) => {
      const match = prev.find((m) => m.id === matchId);
      const winnerId = match ? scoreWinner(match.teams, scores) : null;
      if (!match || winnerId === null) return prev;
      const next = prev.map((m) => (m.id === matchId ? { ...m, winner: winnerId, scores } : m));

      // Correcting an earlier round shouldn't regenerate later rounds.
      if (next.some((m) => m.round > match.round)) return next;

      const current = next.filter((m) => m.round === match.round);
      if (current.every((m) => m.winner !== null)) {
        const upcoming = nextRound(teamIds, next, match.round);
        if (upcoming.length > 0) {
          setRound(match.round + 1);
          return [...next, ...upcoming];
        }
      }
      return next;
    });
    setEditingId(null);
  };

  const reset = () => {
    if (!window.confirm(t.resetConfirm)) return;
    setPhase("roster");
    setDraw([]);
    setTeams([]);
    setMatches([]);
    setRound(1);
    setEditingId(null);
  };

  const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 1);
  const roundsList = Array.from({ length: maxRound }, (_, i) => i + 1);
  const statusLabel = champ ? t.completed : phase === "battle" ? t.inProgress : "";

  if (!loaded) return null;

  return (
    <div>
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

      {/* header */}
      <div className="panel mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-wide">{t.title}</h1>
            <p className="mt-1 font-semibold text-accent">{t.eventName}</p>
            <p className="mt-0.5 text-sm text-ink-dim">{t.meta}</p>
          </div>
          {statusLabel && (
            <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">
              {statusLabel}
            </span>
          )}
        </div>
        <div className="mt-4">
          <div className="mb-1 font-display text-xs font-bold tracking-wider text-ink-dim">
            {t.rulesTitle}
          </div>
          <ul className="grid gap-1 text-sm text-ink-dim sm:grid-cols-2">
            {t.rules.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-accent">◆</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {phase === "roster" && (
        <RosterPanel
          t={t}
          players={players}
          newName={newName}
          setNewName={setNewName}
          addPlayer={addPlayer}
          removePlayer={removePlayer}
          loadPreset={loadPreset}
          clearAll={clearAll}
          startDraw={startDraw}
        />
      )}

      {phase === "draw" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="panel p-5">
            <h2 className="font-display text-lg font-bold tracking-wide">{t.drawTitle}</h2>
            <p className="mt-1 text-sm text-ink-dim">{t.drawHint}</p>
            <div className="mt-6 flex flex-col items-center">
              {undrawn.length > 0 ? (
                <>
                  <SpinWheel
                    items={undrawn.map((p) => ({ id: p.id, label: p.name }))}
                    onResult={onWheelResult}
                    spinLabel={t.spin}
                  />
                  <div className="mt-3 text-xs text-ink-dim">
                    {t.undrawn}: {undrawn.length}
                  </div>
                  {undrawn.length === 2 && (
                    <button
                      onClick={autoLastTwo}
                      className="mt-3 text-xs font-semibold text-accent-2 underline decoration-dotted hover:text-accent"
                    >
                      {t.autoLast}
                    </button>
                  )}
                </>
              ) : (
                <div className="w-full text-center">
                  <div className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 font-display text-sm font-bold tracking-wider text-accent">
                    {t.drawDone}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      onClick={startBattle}
                      className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
                    >
                      {t.startBattle}
                    </button>
                    <button
                      onClick={redraw}
                      className="clip-x border border-edge bg-panel-2 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink"
                    >
                      {t.redraw}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel h-fit p-5">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
              {t.teamsFormed}
            </div>
            <ol className="space-y-2">
              {drawnTeams.map((tm, i) => {
                const forming = tm.members.length < 2 && undrawn.length > 0;
                return (
                  <li
                    key={tm.id}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      forming ? "border-accent/50 bg-accent/5" : "border-edge bg-panel"
                    }`}
                  >
                    <span className="font-display text-xs font-bold text-accent-2">
                      #{i + 1}
                    </span>{" "}
                    <span className="text-ink">
                      {tm.members.map(nameOf).join(" & ")}
                      {forming && (
                        <span className="ml-2 text-xs text-ink-dim">({t.forming}…)</span>
                      )}
                    </span>
                  </li>
                );
              })}
              {drawnTeams.length === 0 && (
                <li className="text-sm text-ink-dim">—</li>
              )}
            </ol>
          </div>
        </div>
      )}

      {phase === "battle" && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <div className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold tracking-wide">{t.battleTitle}</h2>
                <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
                  {t.swissOf.replace("{n}", String(swissRoundCount(teamIds.length)))}
                </span>
              </div>
              {champ && (
                <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 font-display text-sm font-bold tracking-wider text-accent">
                  {t.champion}: {teamLabel(champ)}
                </div>
              )}
            </div>

            {roundsList.map((r) => {
              const roundMatches = matches.filter((m) => m.round === r);
              if (roundMatches.length === 0) return null;
              const isFinalRound = roundMatches.some((m) => m.stage === "final");
              return (
                <div key={r} className="panel mt-4 p-5">
                  <div className="font-display text-sm font-bold tracking-wider">
                    {isFinalRound ? t.grandFinal : t.round.replace("{n}", String(r))}
                  </div>
                  <div className="mt-1 text-xs text-ink-dim">
                    {t.firstTo.replace("{n}", String(PARTNER_WIN_SCORE))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {roundMatches.map((m) => (
                      <div key={m.id} className="rounded-md border border-edge bg-panel p-3">
                        {m.teams.length === 1 ? (
                          <p className="text-sm text-ink-dim">
                            {teamLabel(m.teams[0])} — <span className="text-accent-2">{t.bye}</span>
                          </p>
                        ) : m.winner !== null && editingId !== m.id ? (
                          <div>
                            <div className="grid gap-1">
                              {m.teams.map((tid) => (
                                <div
                                  key={tid}
                                  className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                                    m.winner === tid
                                      ? "bg-accent/20 font-bold text-accent"
                                      : "text-ink-dim/60"
                                  }`}
                                >
                                  <span className={m.winner === tid ? "" : "line-through"}>
                                    {teamLabel(tid)}
                                  </span>
                                  <span>{m.scores?.[tid] ?? 0}</span>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => setEditingId(m.id)}
                              className="mt-1.5 text-[10px] font-semibold text-ink-dim underline decoration-dotted transition hover:text-accent-2"
                            >
                              {t.edit}
                            </button>
                          </div>
                        ) : (
                          <MatchScoreForm
                            match={m}
                            teamLabel={teamLabel}
                            onConfirm={(scores) => report(m.id, scores)}
                            onCancel={m.winner !== null ? () => setEditingId(null) : undefined}
                            confirmLabel={t.confirmScore}
                            cancelLabel={t.cancel}
                            tieError={t.scoreTie}
                            vs={t.vs}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel h-fit p-5">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
              {t.standingsTitle}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-dim">
                    <th className="py-1 pr-1 text-left font-medium">{t.tableRank}</th>
                    <th className="py-1 pr-1 text-left font-medium">{t.tableTeam}</th>
                    <th className="py-1 pr-1 text-right font-medium">{t.tableRecord}</th>
                    <th className="py-1 pr-1 text-right font-medium">{t.tableDiff}</th>
                    <th className="py-1 text-right font-medium">{t.tablePts}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} className="border-t border-edge/60">
                      <td className="py-1.5 pr-1">
                        {i < 2 ? (
                          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                            {i + 1}
                          </span>
                        ) : (
                          <span className="text-ink-dim">{i + 1}</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-1 text-ink">{teamLabel(row.id)}</td>
                      <td className="py-1.5 pr-1 text-right text-ink-dim">
                        {row.wins}-{row.losses}
                      </td>
                      <td
                        className={`py-1.5 pr-1 text-right font-semibold ${
                          row.diff > 0 ? "text-accent" : row.diff < 0 ? "text-atk" : "text-ink-dim"
                        }`}
                      >
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </td>
                      <td className="py-1.5 text-right text-ink-dim">{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] font-semibold text-accent">◆ {t.top2}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RosterPanel({
  t,
  players,
  newName,
  setNewName,
  addPlayer,
  removePlayer,
  loadPreset,
  clearAll,
  startDraw,
}: {
  t: (typeof L)["en"];
  players: Player[];
  newName: string;
  setNewName: (v: string) => void;
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  loadPreset: () => void;
  clearAll: () => void;
  startDraw: () => void;
}) {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addPlayer(newName);
    setNewName("");
  };
  const odd = players.length % 2 === 1;
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide">{t.rosterTitle}</h2>
          <p className="mt-1 text-sm text-ink-dim">{t.rosterHint}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadPreset}
            className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60"
          >
            {t.loadPreset}
          </button>
          {players.length > 0 && (
            <button
              onClick={clearAll}
              className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
            >
              {t.clearAll}
            </button>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.addPlaceholder}
          maxLength={40}
          className="flex-1 rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent"
        />
        <button
          type="submit"
          className="clip-x bg-accent px-5 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
        >
          {t.add}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between">
        <span className="font-display text-xs font-bold tracking-wider text-ink-dim">
          {t.playerCount.replace("{n}", String(players.length))}
        </span>
        {odd && players.length >= 4 && (
          <span className="text-xs text-bal">{t.oddNote}</span>
        )}
      </div>

      {players.length > 0 && (
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {players.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-edge bg-panel px-3 py-2 text-sm"
            >
              <span>
                <span className="font-display text-xs font-bold text-accent-2">
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                <span className="text-ink">{p.name}</span>
              </span>
              <button
                onClick={() => removePlayer(p.id)}
                aria-label={t.remove}
                className="rounded px-1.5 text-ink-dim transition hover:text-atk"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5">
        <button
          onClick={startDraw}
          disabled={players.length < 4}
          className="clip-x bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {t.startDraw}
        </button>
        {players.length < 4 && (
          <p className="mt-2 text-xs text-ink-dim">{t.needFour}</p>
        )}
      </div>
    </div>
  );
}

function MatchScoreForm({
  match,
  teamLabel,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  tieError,
  vs,
}: {
  match: TeamMatch;
  teamLabel: (id: string) => string;
  onConfirm: (scores: Record<string, number>) => void;
  onCancel?: () => void;
  confirmLabel: string;
  cancelLabel: string;
  tieError: string;
  vs: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    match.scores
      ? Object.fromEntries(match.teams.map((tid) => [tid, String(match.scores?.[tid] ?? 0)]))
      : {}
  );
  const [error, setError] = useState(false);

  const submit = () => {
    const scores: Record<string, number> = {};
    for (const tid of match.teams) scores[tid] = Math.max(0, Number(values[tid]) || 0);
    if (scoreWinner(match.teams, scores) === null) {
      setError(true);
      return;
    }
    setError(false);
    onConfirm(scores);
  };

  return (
    <div>
      <div className="grid gap-1.5">
        {match.teams.map((tid, i) => (
          <div key={tid}>
            {i === 1 && (
              <div className="my-0.5 text-center text-[10px] font-bold text-ink-dim">{vs}</div>
            )}
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-ink">{teamLabel(tid)}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={values[tid] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [tid]: e.target.value }))}
                placeholder="0"
                className="w-14 rounded border border-edge bg-panel-2 px-2 py-1 text-center text-sm outline-none focus:border-accent"
              />
            </div>
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
      {error && <p className="mt-1 text-[10px] text-atk">{tieError}</p>}
    </div>
  );
}
