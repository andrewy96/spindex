/**
 * Pairing + scoring engine for partner (2-blader team) battles.
 *
 * Players are randomly drawn into teams, then teams play a Swiss bracket.
 * The top 2 teams on the standings meet in a single final. Everything works
 * on plain string ids so it survives localStorage round-trips and never needs
 * a registered account — walk-in bladers can be added by name alone.
 */

/** First team to 7 points wins a partner match (event rule). */
export const PARTNER_WIN_SCORE = 7;

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
  /** "swiss" for the pairing rounds, "final" for the top-2 decider. */
  stage: "swiss" | "final";
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
  /** Sum of this team's own match scores. */
  pts: number;
  /** Sum of opponents' scores across those same matches. */
  against: number;
  /** pts - against, the tiebreaker shown as "score difference". */
  diff: number;
}

let seq = 0;
/** Short unique id — good enough for client-only tournament state. */
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${(seq).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function mk(round: number, stage: TeamMatch["stage"], idx: number, teams: string[]): TeamMatch {
  return {
    id: `r${round}-${stage}-${idx}`,
    round,
    stage,
    teams,
    winner: teams.length === 1 ? teams[0] : null,
    scores: null,
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
  // Odd count: the trailing 1-player "team" folds into the previous one.
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

/** Number of Swiss rounds for n teams — enough to separate the field. */
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

/**
 * The next round once every match of `round` is decided:
 * more Swiss rounds while they remain, then the top-2 final, then [] (done).
 */
export function nextRound(teamIds: string[], matches: TeamMatch[], round: number): TeamMatch[] {
  const current = matches.filter((m) => m.round === round);
  if (current.length === 0 || current.some((m) => m.winner === null)) return [];

  // Already in / past the final → tournament over.
  if (current.some((m) => m.stage === "final")) return [];

  if (round < swissRoundCount(teamIds.length)) {
    return swissPair(teamIds, matches, round + 1);
  }

  // Swiss complete → top 2 meet in the final.
  const top = standings(teamIds, matches).slice(0, 2).map((r) => r.id);
  if (top.length < 2) return [];
  return [mk(round + 1, "final", 0, top)];
}

/** Champion team id once the whole event is finished, else null. */
export function champion(teamIds: string[], matches: TeamMatch[], round: number): string | null {
  const current = matches.filter((m) => m.round === round);
  if (current.length === 0 || current.some((m) => m.winner === null)) return null;
  if (nextRound(teamIds, matches, round).length > 0) return null;
  const finalMatch = current.find((m) => m.stage === "final");
  return finalMatch ? finalMatch.winner : null;
}
