"use client";

import { useEffect, useMemo, useState } from "react";
import { Locale } from "@/i18n";
import SpinWheel from "@/components/SpinWheel";
import {
  BattleMode,
  champion,
  consolationChampion,
  firstRound,
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

type Phase = "roster" | "draw" | "battle";

interface PersistState {
  phase: Phase;
  mode: BattleMode;
  players: Player[];
  draw: string[];
  teams: Team[];
  matches: TeamMatch[];
  round: number;
}

const L = {
  en: {
    heading: "Partner Battle",
    intro: "Random 2-blader teams · first to 7.",
    viewerNote: "The host runs the partner draw and scoring live at the venue.",
    reset: "Reset draw",
    resetConfirm: "Reset the partner draw? Teams and scores will be cleared.",
    rosterTitle: "Bladers",
    rosterHint: "Add or remove bladers before the partner draw.",
    addPlaceholder: "Add blader name",
    add: "Add",
    loadLineup: "Load from lineup",
    clearAll: "Clear all",
    remove: "Remove",
    playerCount: "{n} bladers",
    startDraw: "Start partner draw",
    needFour: "Add at least 4 bladers to run a partner draw",
    oddNote: "Odd number — the last team will have 3 members.",
    modeTitle: "Battle format",
    modeSwiss: "Swiss",
    modeSwissDesc: "Pair on similar records each round, then top 2 play the final.",
    modeLeague: "League",
    modeLeagueDesc: "Round-robin, then top half play off for the title, bottom half for a consolation prize.",
    drawTitle: "Partner Draw",
    drawHint: "Spin to draw each blader. Every two draws forms a team.",
    spin: "Spin",
    undrawn: "In the wheel",
    forming: "forming",
    teamsFormed: "Teams",
    drawDone: "All partners drawn",
    startBattle: "Start battle",
    redraw: "Redraw partners",
    autoLast: "Auto-draw the last two",
    battleTitle: "Battle",
    swissOf: "Swiss · {n} rounds",
    leagueOf: "League + knockout playoffs",
    round: "Round {n}",
    leagueRound: "League · Round {n}",
    grandFinal: "🏆 Grand Final",
    championship: "🏆 Championship",
    consolation: "Consolation prize",
    bye: "Bye",
    vs: "vs",
    firstTo: "First to {n}",
    confirmScore: "Confirm score",
    edit: "Edit",
    cancel: "Cancel",
    scoreTie: "Scores can't tie — enter a winner",
    standingsTitle: "Standings",
    tableRank: "#",
    tableId: "ID",
    tableTeam: "Team",
    tableRecord: "W–L",
    tableDiff: "Diff",
    tablePts: "Pts",
    top2: "Top 2 advance to the final",
    leagueSplit: "Top half → title · bottom half → consolation",
    champion: "Champion",
    consChampion: "Consolation winner",
    completed: "Completed",
    inProgress: "In progress",
    titles: {
      Semifinal: "Semifinal",
      Quarterfinal: "Quarterfinal",
      Final: "Final",
      "Consolation Final": "Consolation Final",
      "3rd place": "3rd place",
      "Consolation 3rd place": "Consolation 3rd place",
    } as Record<string, string>,
  },
  zh: {
    heading: "双人组队赛",
    intro: "随机 2 人组队 · 先得 7 分。",
    viewerNote: "由主办方在现场进行抽签与计分。",
    reset: "重置抽签",
    resetConfirm: "确定重置搭档抽签？队伍和比分将被清空。",
    rosterTitle: "玩家",
    rosterHint: "抽签前可添加或移除玩家。",
    addPlaceholder: "输入玩家名字",
    add: "添加",
    loadLineup: "从名单载入",
    clearAll: "全部清除",
    remove: "移除",
    playerCount: "{n} 名玩家",
    startDraw: "开始搭档抽签",
    needFour: "至少需要 4 名玩家才能抽搭档",
    oddNote: "人数为奇数 — 最后一队将有 3 人。",
    modeTitle: "对战赛制",
    modeSwiss: "瑞士轮",
    modeSwissDesc: "每轮按相近战绩配对，最后前 2 名打决赛。",
    modeLeague: "联赛",
    modeLeagueDesc: "循环赛后，上半区争冠军，下半区争安慰奖。",
    drawTitle: "搭档抽签",
    drawHint: "转动转盘抽取玩家，每抽两人组成一队。",
    spin: "转动",
    undrawn: "转盘中",
    forming: "组队中",
    teamsFormed: "队伍",
    drawDone: "全部搭档已抽出",
    startBattle: "开始对战",
    redraw: "重新抽签",
    autoLast: "自动抽最后两人",
    battleTitle: "对战",
    swissOf: "瑞士轮 · 共 {n} 轮",
    leagueOf: "循环赛 + 淘汰赛",
    round: "第 {n} 轮",
    leagueRound: "循环赛 · 第 {n} 轮",
    grandFinal: "🏆 总决赛",
    championship: "🏆 冠军赛",
    consolation: "安慰奖",
    bye: "轮空",
    vs: "对",
    firstTo: "先得 {n} 分",
    confirmScore: "确认比分",
    edit: "编辑",
    cancel: "取消",
    scoreTie: "比分不可打平，请分出胜负",
    standingsTitle: "积分榜",
    tableRank: "#",
    tableId: "ID",
    tableTeam: "队伍",
    tableRecord: "胜-负",
    tableDiff: "净胜分",
    tablePts: "得分",
    top2: "前 2 名进入决赛",
    leagueSplit: "上半区争冠 · 下半区争安慰奖",
    champion: "冠军",
    consChampion: "安慰奖得主",
    completed: "已结束",
    inProgress: "进行中",
    titles: {
      Semifinal: "半决赛",
      Quarterfinal: "四分之一决赛",
      Final: "决赛",
      "Consolation Final": "安慰奖决赛",
      "3rd place": "季军赛",
      "Consolation 3rd place": "安慰奖季军赛",
    } as Record<string, string>,
  },
};

/**
 * Embeddable partner-battle organizer for a community tournament of format
 * "partner". State is host-local (localStorage keyed by tournament id) — a
 * single judge runs the draw and scoring on one device.
 */
export default function PartnerBattleRunner({
  locale,
  storageKey,
  seedNames,
  canManage,
}: {
  locale: Locale;
  storageKey: string;
  seedNames: string[];
  canManage: boolean;
}) {
  const t = L[locale] ?? L.en;

  const [phase, setPhase] = useState<Phase>("roster");
  const [mode, setMode] = useState<BattleMode>("league");
  const [players, setPlayers] = useState<Player[]>([]);
  const [draw, setDraw] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [round, setRound] = useState(1);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as PersistState;
        setPhase(s.phase ?? "roster");
        setMode(s.mode ?? "league");
        setPlayers(s.players ?? []);
        setDraw(s.draw ?? []);
        setTeams(s.teams ?? []);
        setMatches(s.matches ?? []);
        setRound(s.round ?? 1);
      } else {
        setPlayers(seedNames.map((name) => ({ id: uid("p"), name })));
      }
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded || !canManage) return;
    const s: PersistState = { phase, mode, players, draw, teams, matches, round };
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [loaded, canManage, storageKey, phase, mode, players, draw, teams, matches, round]);

  const nameOf = useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? "?";
  }, [players]);

  const teamLabel = useMemo(() => {
    const map = new Map(teams.map((tm) => [tm.id, tm.members.map(nameOf).join(" & ")]));
    return (id: string) => map.get(id) ?? "?";
  }, [teams, nameOf]);
  const teamCode = useMemo(() => {
    const map = new Map(teams.map((tm, i) => [tm.id, `T${String(i + 1).padStart(2, "0")}`]));
    return (id: string) => map.get(id) ?? "T??";
  }, [teams]);

  const teamIds = useMemo(() => teams.map((tm) => tm.id), [teams]);
  const leagueMatches = useMemo(() => matches.filter((m) => m.stage === "league"), [matches]);
  const rows = useMemo(
    () => standings(teamIds, mode === "league" ? leagueMatches : matches),
    [teamIds, mode, leagueMatches, matches]
  );
  const champ = useMemo(
    () => (phase === "battle" ? champion(teamIds, matches, round, mode) : null),
    [phase, teamIds, matches, round, mode]
  );
  const consChamp = useMemo(
    () => (phase === "battle" && mode === "league" ? consolationChampion(matches) : null),
    [phase, mode, matches]
  );
  const undrawn = useMemo(() => players.filter((p) => !draw.includes(p.id)), [players, draw]);
  const drawnTeams = useMemo(() => {
    const out: Team[] = [];
    for (let i = 0; i < draw.length; i += 2) {
      out.push({ id: `preview-${i}`, members: draw.slice(i, i + 2) });
    }
    return out;
  }, [draw]);

  // ---- roster ----
  const addPlayer = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setPlayers((prev) => [...prev, { id: uid("p"), name: clean }]);
  };
  const removePlayer = (id: string) => setPlayers((prev) => prev.filter((p) => p.id !== id));
  const loadLineup = () => setPlayers(seedNames.map((name) => ({ id: uid("p"), name })));
  const clearAll = () => setPlayers([]);
  const startDraw = () => {
    setDraw([]);
    setTeams([]);
    setMatches([]);
    setRound(1);
    setPhase("draw");
  };

  // ---- draw ----
  const onWheelResult = (id: string) => setDraw((prev) => [...prev, id]);
  const autoLastTwo = () => setDraw((prev) => [...prev, ...undrawn.map((p) => p.id)]);
  const redraw = () => {
    setDraw([]);
    setTeams([]);
  };
  const startBattle = () => {
    const formed = teamsFromDraw(draw);
    setTeams(formed);
    setMatches(firstRound(formed.map((tm) => tm.id), mode));
    setRound(1);
    setPhase("battle");
  };

  // ---- battle ----
  const report = (matchId: string, scores: Record<string, number>) => {
    setMatches((prev) => {
      const match = prev.find((m) => m.id === matchId);
      const winnerId = match ? scoreWinner(match.teams, scores) : null;
      if (!match || winnerId === null) return prev;
      const next = prev.map((m) => (m.id === matchId ? { ...m, winner: winnerId, scores } : m));
      if (next.some((m) => m.round > match.round)) return next;
      const current = next.filter((m) => m.round === match.round);
      if (current.every((m) => m.winner !== null)) {
        const upcoming = nextRound(teamIds, next, match.round, mode);
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
    setPlayers(seedNames.map((name) => ({ id: uid("p"), name })));
  };

  const odd = players.length % 2 === 1;
  const statusLabel = champ ? t.completed : phase === "battle" ? t.inProgress : "";

  // Renders one match card (score form or result), shared across all sections.
  const matchCard = (m: TeamMatch, showTitle = false) => (
    <div key={m.id} className="rounded-md border border-edge bg-panel p-3">
      {showTitle && m.title && (
        <div className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-accent-2">
          {t.titles[m.title] ?? m.title}
        </div>
      )}
      {m.teams.length === 1 ? (
        <p className="text-sm text-ink-dim">
          <span className="mr-2 font-display text-xs font-bold text-accent-2">{teamCode(m.teams[0])}</span>
          {teamLabel(m.teams[0])} — <span className="text-accent-2">{t.bye}</span>
        </p>
      ) : m.winner !== null && editingId !== m.id ? (
        <div>
          <div className="grid gap-1">
            {m.teams.map((tid) => (
              <div
                key={tid}
                className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                  m.winner === tid ? "bg-accent/20 font-bold text-accent" : "text-ink-dim/60"
                }`}
              >
                <span className={m.winner === tid ? "" : "line-through"}>
                  <span className="mr-2 font-display text-[10px] font-bold text-accent-2">{teamCode(tid)}</span>
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
          teamCode={teamCode}
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
  );

  // Swiss round list (swiss + final), league round list, and playoff brackets.
  const maxRound = matches.reduce((m, x) => Math.max(m, x.round), 1);
  const swissRounds = Array.from({ length: maxRound }, (_, i) => i + 1);
  const leagueRoundNos = useMemo(
    () => [...new Set(leagueMatches.map((m) => m.round))].sort((a, b) => a - b),
    [leagueMatches]
  );
  const champMatches = matches.filter((m) => m.stage === "playoff" && m.bracket === "championship");
  const consMatches = matches.filter((m) => m.stage === "playoff" && m.bracket === "consolation");

  if (!loaded) return null;

  if (!canManage) {
    return (
      <div className="panel p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold tracking-wide">{t.heading}</h2>
          {statusLabel && (
            <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">
              {statusLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-dim">{t.intro}</p>
        <p className="mt-3 rounded-md border border-accent-2/30 bg-accent-2/5 px-3 py-2 text-xs text-accent-2">
          {t.viewerNote}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold tracking-wide">{t.heading}</h2>
            <p className="mt-1 text-sm text-ink-dim">{t.intro}</p>
          </div>
          <div className="flex items-center gap-2">
            {statusLabel && (
              <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">
                {statusLabel}
              </span>
            )}
            {phase !== "roster" && (
              <button
                onClick={reset}
                className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
              >
                {t.reset}
              </button>
            )}
          </div>
        </div>
      </div>

      {phase === "roster" && (
        <div className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold tracking-wider">{t.rosterTitle}</h3>
              <p className="mt-1 text-sm text-ink-dim">{t.rosterHint}</p>
            </div>
            <div className="flex gap-2">
              {seedNames.length > 0 && (
                <button
                  onClick={loadLineup}
                  className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60"
                >
                  {t.loadLineup}
                </button>
              )}
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addPlayer(newName);
              setNewName("");
            }}
            className="mt-4 flex gap-2"
          >
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
            {odd && players.length >= 4 && <span className="text-xs text-bal">{t.oddNote}</span>}
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

          <div className="mt-6">
            <div className="font-display text-sm font-bold tracking-wider">{t.modeTitle}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {([
                { key: "swiss" as const, label: t.modeSwiss, desc: t.modeSwissDesc },
                { key: "league" as const, label: t.modeLeague, desc: t.modeLeagueDesc },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMode(opt.key)}
                  className={`rounded-md border p-3 text-left transition ${
                    mode === opt.key
                      ? "border-accent bg-accent/10"
                      : "border-edge bg-panel hover:border-accent/50"
                  }`}
                >
                  <div className={`text-sm font-semibold ${mode === opt.key ? "text-accent" : "text-ink"}`}>
                    {opt.label}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-ink-dim">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <button
              onClick={startDraw}
              disabled={players.length < 4}
              className="clip-x bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
            >
              {t.startDraw}
            </button>
            {players.length < 4 && <p className="mt-2 text-xs text-ink-dim">{t.needFour}</p>}
          </div>
        </div>
      )}

      {phase === "draw" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="panel p-5">
            <h3 className="font-display text-sm font-bold tracking-wider">{t.drawTitle}</h3>
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
                      T{String(i + 1).padStart(2, "0")}
                    </span>{" "}
                    <span className="text-ink">
                      {tm.members.map(nameOf).join(" & ")}
                      {forming && <span className="ml-2 text-xs text-ink-dim">({t.forming}…)</span>}
                    </span>
                  </li>
                );
              })}
              {drawnTeams.length === 0 && <li className="text-sm text-ink-dim">—</li>}
            </ol>
          </div>
        </div>
      )}

      {phase === "battle" && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <div className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold tracking-wider">{t.battleTitle}</h3>
                <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
                  {mode === "league"
                    ? t.leagueOf
                    : t.swissOf.replace("{n}", String(swissRoundCount(teamIds.length)))}
                </span>
              </div>
              {(champ || consChamp) && (
                <div className="mt-4 space-y-2">
                  {champ && (
                    <div className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 font-display text-sm font-bold tracking-wider text-accent">
                      {t.champion}: {teamCode(champ)} {teamLabel(champ)}
                    </div>
                  )}
                  {consChamp && (
                    <div className="rounded-md border border-accent-2/40 bg-accent-2/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2">
                      {t.consChampion}: {teamCode(consChamp)} {teamLabel(consChamp)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Swiss mode: rounds + grand final */}
            {mode === "swiss" &&
              swissRounds.map((r) => {
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
                      {roundMatches.map((m) => matchCard(m))}
                    </div>
                  </div>
                );
              })}

            {/* League mode: round-robin then knockout brackets */}
            {mode === "league" && (
              <>
                {leagueRoundNos.map((r) => (
                  <div key={`lg-${r}`} className="panel mt-4 p-5">
                    <div className="font-display text-sm font-bold tracking-wider">
                      {t.leagueRound.replace("{n}", String(r))}
                    </div>
                    <div className="mt-1 text-xs text-ink-dim">
                      {t.firstTo.replace("{n}", String(PARTNER_WIN_SCORE))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {leagueMatches.filter((m) => m.round === r).map((m) => matchCard(m))}
                    </div>
                  </div>
                ))}
                {champMatches.length > 0 && (
                  <div className="panel mt-4 p-5">
                    <div className="font-display text-sm font-bold tracking-wider text-accent">
                      {t.championship}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {champMatches.map((m) => matchCard(m, true))}
                    </div>
                  </div>
                )}
                {consMatches.length > 0 && (
                  <div className="panel mt-4 p-5">
                    <div className="font-display text-sm font-bold tracking-wider text-accent-2">
                      {t.consolation}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {consMatches.map((m) => matchCard(m, true))}
                    </div>
                  </div>
                )}
              </>
            )}
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
                    <th className="py-1 pr-1 text-left font-medium">{t.tableId}</th>
                    <th className="py-1 pr-1 text-left font-medium">{t.tableTeam}</th>
                    <th className="py-1 pr-1 text-right font-medium">{t.tableRecord}</th>
                    <th className="py-1 pr-1 text-right font-medium">{t.tableDiff}</th>
                    <th className="py-1 text-right font-medium">{t.tablePts}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const half = Math.ceil(rows.length / 2);
                    const highlight = mode === "league" ? i < half : i < 2;
                    return (
                      <tr key={row.id} className="border-t border-edge/60">
                        <td className="py-1.5 pr-1">
                          {highlight ? (
                            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                              {i + 1}
                            </span>
                          ) : (
                            <span className="text-ink-dim">{i + 1}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-1 font-display text-[10px] font-bold text-accent-2">
                          {teamCode(row.id)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] font-semibold text-accent">
              ◆ {mode === "league" ? t.leagueSplit : t.top2}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchScoreForm({
  match,
  teamCode,
  teamLabel,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  tieError,
  vs,
}: {
  match: TeamMatch;
  teamCode: (id: string) => string;
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
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                <span className="mr-2 font-display text-[10px] font-bold text-accent-2">{teamCode(tid)}</span>
                {teamLabel(tid)}
              </span>
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
