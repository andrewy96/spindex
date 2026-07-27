/**
 * Pairing + scoring engine for partner (2-blader team) battles.
 *
 * Two modes:
 *   swiss  — Swiss rounds, then the top 2 teams meet in a final.
 *   league — a full round-robin, then the standings split into a top half
 *            (knockout for the title) and a bottom half (knockout for a
 *            consolation prize), each: seeded semis -> final + 3rd place.
 *
 * Everything works on plain string ids so it survives localStorage round-trips
 * and never needs a registered account — walk-in bladers are added by name.
 */

/** First team to 7 points wins a partner match (event rule). */
export const PARTNER_WIN_SCORE = 7;

export type BattleMode = "swiss" | "league";
export type MatchStage = "swiss" | "final" | "league" | "playoff";
export type PlayoffBracket = "championship" | "consolation";

export interface Player {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  /** Player ids, usually 2 — 3 when the roster is odd. */
  members: string[];
}

export interface TeamMatch {
  id: string;
  round: number;
  stage: MatchStage;
  /** Set for playoff matches — which half of the field it belongs to. */
  bracket?: PlayoffBracket;
  /** Human label for playoff matches: "Semifinal", "Final", "3rd place"… */
  title?: string;
  /** Team ids. Length 1 = bye (winner auto-set). */
  teams: string[];
  winner: string | null;
  /** Host-entered score per team id, set once the match is reported. */
  scores: Record<string, number> | null;
}

export interface TeamStanding {
  id: string;
  wins: number;
  losses: number;
  pts: number;
  against: number;
  diff: number;
}

let seq = 0;
/** Short unique id — good enough for client-only tournament state. */
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function mk(
  round: number,
  stage: MatchStage,
  key: string | number,
  teams: string[],
  extra?: Partial<Pick<TeamMatch, "bracket" | "title">>
): TeamMatch {
  return {
    id: `r${round}-${stage}-${key}`,
    round,
    stage,
    teams,
    winner: teams.length === 1 ? teams[0] : null,
    scores: null,
    ...extra,
  };
}

/** Fisher–Yates shuffle, returning a new array. */
export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Group an ordered list of player ids into teams of 2. An odd roster puts the
 * final blader into a trio rather than leaving anyone partnerless.
 */
export function teamsFromDraw(order: string[]): Team[] {
  const teams: Team[] = [];
  for (let i = 0; i < order.length; i += 2) {
    teams.push({ id: uid("team"), members: order.slice(i, i + 2) });
  }
  if (teams.length >= 2 && teams[teams.length - 1].members.length === 1) {
    const lone = teams.pop() as Team;
    teams[teams.length - 1].members.push(...lone.members);
  }
  return teams;
}

/** Winner of a reported score: the team with the strictly highest score, else null on a tie. */
export function scoreWinner(teams: string[], scores: Record<string, number>): string | null {
  let best: string | null = null;
  let bestVal = -Infinity;
  let tie = false;
  for (const t of teams) {
    const v = scores[t] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = t;
      tie = false;
    } else if (v === bestVal) {
      tie = true;
    }
  }
  return tie ? null : best;
}

export function swissRoundCount(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

export function standings(teamIds: string[], matches: TeamMatch[]): TeamStanding[] {
  const map = new Map<string, TeamStanding>(
    teamIds.map((id) => [id, { id, wins: 0, losses: 0, pts: 0, against: 0, diff: 0 }])
  );
  for (const m of matches) {
    if (m.winner === null || m.teams.length < 2) continue;
    for (const t of m.teams) {
      const row = map.get(t);
      if (!row) continue;
      if (t === m.winner) row.wins += 1;
      else row.losses += 1;
      const own = m.scores?.[t] ?? 0;
      const opp = m.teams.filter((x) => x !== t).reduce((s, x) => s + (m.scores?.[x] ?? 0), 0);
      row.pts += own;
      row.against += opp;
      row.diff = row.pts - row.against;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.wins - a.wins || b.diff - a.diff || a.losses - b.losses
  );
}

/* ----------------------------- Swiss mode ----------------------------- */

/** Greedy Swiss pairing by standing, avoiding rematches when possible. */
export function swissPair(teamIds: string[], matches: TeamMatch[], round: number): TeamMatch[] {
  const rows = standings(teamIds, matches);
  const played = new Set<string>();
  for (const m of matches) {
    if (m.teams.length === 2) {
      played.add(`${m.teams[0]}-${m.teams[1]}`);
      played.add(`${m.teams[1]}-${m.teams[0]}`);
    }
  }
  const pool = rows.map((r) => r.id);
  const out: TeamMatch[] = [];
  while (pool.length > 1) {
    const a = pool.shift() as string;
    let j = pool.findIndex((b) => !played.has(`${a}-${b}`));
    if (j === -1) j = 0;
    const b = pool.splice(j, 1)[0];
    out.push(mk(round, "swiss", out.length, [a, b]));
  }
  if (pool.length === 1) out.push(mk(round, "swiss", out.length, [pool[0]]));
  return out;
}

export function firstSwissRound(teamIds: string[]): TeamMatch[] {
  return swissPair(teamIds, [], 1);
}

/* ---------------------------- League mode ----------------------------- */

/** Full round-robin (circle method): every team plays every other once. */
export function roundRobin(teamIds: string[]): TeamMatch[] {
  const ring: (string | null)[] = [...teamIds];
  if (ring.length % 2 === 1) ring.push(null); // odd → one team rests each round
  const n = ring.length;
  const out: TeamMatch[] = [];
  for (let r = 0; r < n - 1; r++) {
    let idx = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a !== null && b !== null) out.push(mk(r + 1, "league", idx++, [a, b]));
    }
    ring.splice(1, 0, ring.pop() as string | null); // rotate all but the first seat
  }
  return out;
}

const SEED_SLOTS: Record<number, number[]> = {
  2: [1, 2],
  4: [1, 4, 2, 3],
  8: [1, 8, 4, 5, 2, 7, 3, 6],
  16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
};

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

function titleForMatches(k: number, bracket: PlayoffBracket): string {
  const finalTitle = bracket === "consolation" ? "Consolation Final" : "Final";
  if (k <= 1) return finalTitle;
  if (k === 2) return "Semifinal";
  if (k === 4) return "Quarterfinal";
  return `Round of ${k * 2}`;
}

/** Seeded first knockout round for a group (byes fill non-power-of-2 sizes). */
function seededFirstRound(seeds: string[], bracket: PlayoffBracket, round: number): TeamMatch[] {
  const size = nextPow2(seeds.length);
  const slots = SEED_SLOTS[size] ?? SEED_SLOTS[16];
  const bySlot = slots.map((pos) => seeds[pos - 1] ?? null);
  const title = titleForMatches(size / 2, bracket);
  const out: TeamMatch[] = [];
  let key = 0;
  for (let i = 0; i < bySlot.length; i += 2) {
    const pair = [bySlot[i], bySlot[i + 1]].filter((x): x is string => x !== null);
    if (pair.length === 0) continue;
    out.push(mk(round, "playoff", `${bracket}-s${key++}`, pair, { bracket, title }));
  }
  return out;
}

const isPlacementMatch = (m: TeamMatch) => (m.title ?? "").includes("place");
const isFinalMatch = (m: TeamMatch) => m.title === "Final" || m.title === "Consolation Final";

/** Advance one knockout bracket after its `completedRound` finishes. */
function advanceBracket(
  matches: TeamMatch[],
  bracket: PlayoffBracket,
  completedRound: number,
  nextRoundNo: number
): TeamMatch[] {
  const prev = matches.filter(
    (m) => m.stage === "playoff" && m.bracket === bracket && m.round === completedRound
  );
  const progression = prev.filter((m) => !isPlacementMatch(m));
  if (progression.length === 0 || progression.some(isFinalMatch)) return []; // bracket done
  const winners = progression.filter((m) => m.winner !== null).map((m) => m.winner as string);
  if (winners.length <= 1) return [];

  if (winners.length === 2) {
    const out: TeamMatch[] = [
      mk(nextRoundNo, "playoff", `${bracket}-final`, [winners[0], winners[1]], {
        bracket,
        title: bracket === "consolation" ? "Consolation Final" : "Final",
      }),
    ];
    // 3rd-place decider from the two semifinal losers (only when both were real matchups).
    const losers = progression
      .filter((m) => m.teams.length === 2 && m.winner !== null)
      .map((m) => m.teams.find((x) => x !== m.winner) as string);
    if (losers.length === 2) {
      out.push(
        mk(nextRoundNo, "playoff", `${bracket}-third`, [losers[0], losers[1]], {
          bracket,
          title: bracket === "consolation" ? "Consolation 3rd place" : "3rd place",
        })
      );
    }
    return out;
  }

  const title = titleForMatches(winners.length / 2, bracket);
  const out: TeamMatch[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    out.push(
      mk(nextRoundNo, "playoff", `${bracket}-${i / 2}-r${nextRoundNo}`, [winners[i], winners[i + 1]], {
        bracket,
        title,
      })
    );
  }
  return out;
}

/* --------------------------- Round control ---------------------------- */

export function firstRound(teamIds: string[], mode: BattleMode): TeamMatch[] {
  return mode === "league" ? roundRobin(teamIds) : firstSwissRound(teamIds);
}

/**
 * The next round once every match of `round` is decided; [] when the event is over.
 */
export function nextRound(
  teamIds: string[],
  matches: TeamMatch[],
  round: number,
  mode: BattleMode = "swiss"
): TeamMatch[] {
  const current = matches.filter((m) => m.round === round);
  if (current.length === 0 || current.some((m) => m.winner === null)) return [];

  if (mode === "swiss") {
    if (current.some((m) => m.stage === "final")) return [];
    if (round < swissRoundCount(teamIds.length)) return swissPair(teamIds, matches, round + 1);
    const top = standings(teamIds, matches).slice(0, 2).map((r) => r.id);
    return top.length < 2 ? [] : [mk(round + 1, "final", 0, top)];
  }

  // league
  if (current.some((m) => m.stage === "playoff")) {
    return [
      ...advanceBracket(matches, "championship", round, round + 1),
      ...advanceBracket(matches, "consolation", round, round + 1),
    ];
  }
  const leagueMatches = matches.filter((m) => m.stage === "league");
  const lastLeague = leagueMatches.reduce((mx, m) => Math.max(mx, m.round), 1);
  if (round < lastLeague) return []; // remaining league rounds already exist

  // League complete → split the table and open both knockout brackets.
  const table = standings(teamIds, leagueMatches);
  const topCount = Math.ceil(table.length / 2);
  const champSeeds = table.slice(0, topCount).map((r) => r.id);
  const consSeeds = table.slice(topCount).map((r) => r.id);
  const r = round + 1;
  const out = seededFirstRound(champSeeds, "championship", r);
  if (consSeeds.length >= 2) out.push(...seededFirstRound(consSeeds, "consolation", r));
  return out;
}

/** Championship winner once the event is finished, else null. */
export function champion(
  teamIds: string[],
  matches: TeamMatch[],
  round: number,
  mode: BattleMode = "swiss"
): string | null {
  const current = matches.filter((m) => m.round === round);
  if (current.length === 0 || current.some((m) => m.winner === null)) return null;
  if (nextRound(teamIds, matches, round, mode).length > 0) return null;

  if (mode === "swiss") {
    const finalMatch = current.find((m) => m.stage === "final");
    return finalMatch ? finalMatch.winner : null;
  }
  const finalMatch = matches.find(
    (m) => m.stage === "playoff" && m.bracket === "championship" && m.title === "Final"
  );
  return finalMatch ? finalMatch.winner : null;
}

/** Consolation-prize winner (league mode), else null. */
export function consolationChampion(matches: TeamMatch[]): string | null {
  const finalMatch = matches.find(
    (m) => m.stage === "playoff" && m.bracket === "consolation" && m.title === "Consolation Final"
  );
  return finalMatch && finalMatch.winner ? finalMatch.winner : null;
}
