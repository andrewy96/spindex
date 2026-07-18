/**
 * Pure pairing engine for the tournament demo page.
 * Works on plain player-id arrays so it can later be reused against real
 * tournament_players rows without changes.
 */

export type DemoFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "swiss"
  | "free_for_all"
  | "leaderboard";

export type BracketSide = "main" | "losers" | "grand";

/** Mirrors DEFAULT_WIN_SCORE in lib/supabase.ts — real matches are first-to-4. */
export const MIN_WIN_SCORE = 4;

export interface DemoMatch {
  id: string;
  round: number;
  bracket: BracketSide;
  /** Player ids. Length 1 = bye (winner auto-set). FFA groups hold 3–4. */
  players: number[];
  winner: number | null;
  /** Host-entered score per player id, set once the match is reported. */
  scores: Record<number, number> | null;
}

export interface StandingRow {
  id: number;
  wins: number;
  losses: number;
  /** Sum of this player's own match scores. */
  pts: number;
  /** Sum of opponents' scores across those same matches. */
  against: number;
  /** pts - against, the tiebreaker shown as "score difference". */
  diff: number;
}

function mk(round: number, bracket: BracketSide, idx: number, players: number[]): DemoMatch {
  return {
    id: `r${round}-${bracket}-${idx}`,
    round,
    bracket,
    players,
    winner: players.length === 1 ? players[0] : null,
    scores: null,
  };
}

/**
 * Winner of a reported score: the player with the strictly highest score.
 * Returns null on a tie — callers must reject ties and ask the host to
 * re-enter a decisive score, since every format here needs a winner to advance.
 */
export function scoreWinner(players: number[], scores: Record<number, number>): number | null {
  let best: number | null = null;
  let bestVal = -Infinity;
  let tie = false;
  for (const p of players) {
    const v = scores[p] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = p;
      tie = false;
    } else if (v === bestVal) {
      tie = true;
    }
  }
  return tie ? null : best;
}

/** Pair sequentially: [1,2],[3,4]… odd player out gets a bye. */
function pairSeq(ids: number[], round: number, bracket: BracketSide): DemoMatch[] {
  const out: DemoMatch[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    out.push(mk(round, bracket, out.length, ids.slice(i, i + 2)));
  }
  return out;
}

export function swissRoundCount(n: number): number {
  return Math.ceil(Math.log2(Math.max(2, n)));
}

export function standings(ids: number[], matches: DemoMatch[]): StandingRow[] {
  const map = new Map<number, StandingRow>(
    ids.map((id) => [id, { id, wins: 0, losses: 0, pts: 0, against: 0, diff: 0 }])
  );
  for (const m of matches) {
    if (m.winner === null || m.players.length < 2) continue;
    for (const p of m.players) {
      const row = map.get(p);
      if (!row) continue;
      if (p === m.winner) row.wins += 1;
      else row.losses += 1;
      const own = m.scores?.[p] ?? 0;
      const opponents = m.players
        .filter((x) => x !== p)
        .reduce((sum, x) => sum + (m.scores?.[x] ?? 0), 0);
      row.pts += own;
      row.against += opponents;
      row.diff = row.pts - row.against;
    }
  }
  return [...map.values()].sort((a, b) => b.wins - a.wins || b.diff - a.diff || a.losses - b.losses);
}

/** All round-robin rounds up front (circle method). */
function roundRobinAll(ids: number[]): DemoMatch[] {
  const ring: (number | null)[] = [...ids];
  if (ring.length % 2 === 1) ring.push(null);
  const n = ring.length;
  const out: DemoMatch[] = [];
  for (let r = 0; r < n - 1; r++) {
    let idx = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a !== null && b !== null) out.push(mk(r + 1, "main", idx++, [a, b]));
    }
    // rotate all but the first seat
    ring.splice(1, 0, ring.pop() as number | null);
  }
  return out;
}

/** Greedy swiss pairing by points, avoiding rematches when possible. */
function swissPair(ids: number[], matches: DemoMatch[], round: number): DemoMatch[] {
  const rows = standings(ids, matches);
  const played = new Set<string>();
  for (const m of matches) {
    if (m.players.length === 2) {
      played.add(`${m.players[0]}-${m.players[1]}`);
      played.add(`${m.players[1]}-${m.players[0]}`);
    }
  }
  const pool = rows.map((r) => r.id);
  const out: DemoMatch[] = [];
  while (pool.length > 1) {
    const a = pool.shift() as number;
    let j = pool.findIndex((b) => !played.has(`${a}-${b}`));
    if (j === -1) j = 0;
    const b = pool.splice(j, 1)[0];
    out.push(mk(round, "main", out.length, [a, b]));
  }
  if (pool.length === 1) out.push(mk(round, "main", out.length, [pool[0]]));
  return out;
}

/** FFA: groups of up to 4, one winner per group advances. */
function ffaGroups(ids: number[], round: number): DemoMatch[] {
  const out: DemoMatch[] = [];
  let i = 0;
  while (i < ids.length) {
    let size = Math.min(4, ids.length - i);
    // never leave a lone player in the last group
    if (ids.length - i - size === 1) size -= 1;
    out.push(mk(round, "main", out.length, ids.slice(i, i + size)));
    i += size;
  }
  return out;
}

/** Round 1 for every format. Leaderboard has no matches. */
export function firstRound(format: DemoFormat, ids: number[]): DemoMatch[] {
  switch (format) {
    case "round_robin":
      return roundRobinAll(ids);
    case "swiss":
      return swissPair(ids, [], 1);
    case "free_for_all":
      return ffaGroups(ids, 1);
    case "leaderboard":
      return [];
    default:
      return pairSeq(ids, 1, "main");
  }
}

/**
 * Next round once every match of `round` is decided.
 * Returns [] when the tournament is over.
 * Double elimination is a simplified queue version: main bracket for
 * unbeaten players, losers pool pairs off, grand final at the end
 * (no bracket reset).
 */
export function nextRound(
  format: DemoFormat,
  ids: number[],
  matches: DemoMatch[],
  round: number
): DemoMatch[] {
  const next = round + 1;
  const prev = matches.filter((m) => m.round === round);
  const winnersOf = (side: BracketSide) =>
    prev.filter((m) => m.bracket === side && m.winner !== null).map((m) => m.winner as number);

  switch (format) {
    case "round_robin":
    case "leaderboard":
      return [];
    case "swiss": {
      if (round >= swissRoundCount(ids.length)) return [];
      return swissPair(ids, matches, next);
    }
    case "free_for_all": {
      const w = winnersOf("main");
      if (w.length <= 1) return [];
      return ffaGroups(w, next);
    }
    case "single_elimination": {
      const w = winnersOf("main");
      if (w.length <= 1) return [];
      return pairSeq(w, next, "main");
    }
    case "double_elimination": {
      if (prev.some((m) => m.bracket === "grand")) return [];
      const mainW = winnersOf("main");
      const mainL = prev
        .filter((m) => m.bracket === "main" && m.players.length === 2 && m.winner !== null)
        .map((m) => m.players.find((p) => p !== m.winner) as number);
      const lbW = winnersOf("losers");
      const pool = [...mainL, ...lbW];
      const out: DemoMatch[] = [];
      if (mainW.length > 1) {
        out.push(...pairSeq(mainW, next, "main"));
        if (pool.length > 0) out.push(...pairSeq(pool, next, "losers"));
      } else if (pool.length > 1) {
        out.push(...pairSeq(pool, next, "losers"));
      } else if (mainW.length === 1 && pool.length === 1) {
        out.push(mk(next, "grand", 0, [mainW[0], pool[0]]));
      }
      return out;
    }
  }
}

/** Champion id once the bracket is finished, else null. */
export function champion(
  format: DemoFormat,
  ids: number[],
  matches: DemoMatch[],
  round: number
): number | null {
  const current = matches.filter((m) => m.round === round);
  if (matches.length === 0 || current.some((m) => m.winner === null)) return null;
  if (nextRound(format, ids, matches, round).length > 0) return null;
  if (format === "round_robin" || format === "swiss") {
    if (matches.some((m) => m.winner === null)) return null;
    return standings(ids, matches)[0]?.id ?? null;
  }
  if (format === "leaderboard") return null;
  const last = current.filter((m) => m.winner !== null);
  return last.length > 0 ? (last[last.length - 1].winner as number) : null;
}
