import type { BeyliveMatch, BeyliveMatchPlayer } from "./supabase";

export function beyliveKnockoutRoundLabel(matchCountInRound: number) {
  if (matchCountInRound <= 1) return "Final";
  if (matchCountInRound === 2) return "Semifinal";
  if (matchCountInRound === 4) return "Quarterfinal";
  return `Round of ${matchCountInRound * 2}`;
}

function isBye(match: BeyliveMatch) {
  return match.status === "bye" || match.players?.length === 1;
}

export function beyliveKnockoutRoundLabels(matches: BeyliveMatch[]) {
  const groups = new Map<number, BeyliveMatch[]>();
  for (const match of matches) {
    if (match.bracket !== "main") continue;
    groups.set(match.round_no, [...(groups.get(match.round_no) ?? []), match]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a - b).map(([roundNo, round], index) => [
    roundNo,
    index === 0 && round.length > 1 && round.some(isBye)
      ? "Preliminary"
      : beyliveKnockoutRoundLabel(round.length),
  ]));
}

export interface BracketSlot {
  player?: BeyliveMatchPlayer;
  source: string;
}

export interface BracketNode {
  id: string;
  title: string;
  roundNo: number;
  matchNo: number;
  actual?: BeyliveMatch;
  bye: boolean;
  slots: BracketSlot[];
  next?: { id: string; title: string };
}

export interface BracketRound {
  roundNo: number;
  label: string;
  nodes: BracketNode[];
}

function node(roundNo: number, matchNo: number, label: string, actual?: BeyliveMatch): BracketNode {
  return {
    id: `bracket-${roundNo}-${matchNo}`,
    title: label === "Final" ? label : `${label} #${matchNo}`,
    roundNo,
    matchNo,
    actual,
    bye: actual ? isBye(actual) : false,
    slots: [...(actual?.players ?? [])].sort((a, b) => a.slot_no - b.slot_no)
      .map((player) => ({ player, source: "" })),
  };
}

function advancingSlot(source: BracketNode | undefined): BracketSlot {
  if (!source) return { source: "Bye" };
  const actual = source.actual;
  const winner = actual?.status === "completed" || source.bye
    ? actual?.players?.find((p) =>
        actual.winner_team_id ? p.team_id === actual.winner_team_id : p.user_id === actual.winner_id,
      ) ?? (source.bye ? actual?.players?.[0] : undefined)
    : undefined;
  return { player: winner, source: source.bye ? "Advanced by bye" : `Winner of ${source.title}` };
}

/** Read-only projection: future cards describe advancement without creating matches. */
export function buildBeyliveBracket(matches: BeyliveMatch[]): BracketRound[] {
  const main = matches.filter((m) => m.bracket === "main");
  const roundNos = [...new Set(main.map((m) => m.round_no))].sort((a, b) => a - b);
  if (!roundNos.length) return [];
  const labels = beyliveKnockoutRoundLabels(main);
  const firstNo = roundNos[0];
  const first = main.filter((m) => m.round_no === firstNo).sort((a, b) => a.match_no - b.match_no);
  const firstLabel = labels.get(firstNo)!;
  const rounds: BracketRound[] = [{
    roundNo: firstNo, label: firstLabel,
    nodes: first.map((m) => node(firstNo, m.match_no, firstLabel, m)),
  }];
  // The execution engine advances winners in match-number order, two at a time.
  // Preserve every first-round slot, including byes, when projecting that route.
  while (rounds[rounds.length - 1].nodes.length > 1) {
    const previous = rounds[rounds.length - 1];
    const roundNo = roundNos[rounds.length] ?? previous.roundNo + 1;
    const count = Math.ceil(previous.nodes.length / 2);
    const label = beyliveKnockoutRoundLabel(count);
    const actualMatches = main.filter((m) => m.round_no === roundNo);
    const nodes = Array.from({ length: count }, (_, index) => {
      const actual = actualMatches.find((m) => m.match_no === index + 1);
      const target = node(roundNo, index + 1, label, actual);
      const sources = previous.nodes.slice(index * 2, index * 2 + 2);
      if (!actual) target.slots = sources.map(advancingSlot);
      for (const source of sources) source.next = { id: target.id, title: target.title };
      return target;
    });
    rounds.push({ roundNo, label, nodes });
  }
  return rounds;
}

export function layoutBeyliveBracket(rounds: BracketRound[]) {
  const cardWidth = 280;
  const columnGap = 88;
  const rowGap = 24;
  const headerHeight = 48;
  const positions = new Map<string, { node: BracketNode; x: number; y: number; height: number; centerY: number }>();
  rounds.forEach((round, column) => {
    let bottom = headerHeight - rowGap;
    round.nodes.forEach((node) => {
      const height = node.bye ? 96 : 196;
      const sources = column === 0 ? [] : rounds[column - 1].nodes
        .filter(source => source.next?.id === node.id)
        .map(source => positions.get(source.id)!.centerY);
      const desired = sources.length ? sources.reduce((a,b)=>a+b,0) / sources.length - height / 2 : bottom + rowGap;
      const y = Math.max(bottom + rowGap, desired);
      positions.set(node.id, { node, x: column * (cardWidth + columnGap), y, height, centerY: y + height / 2 });
      bottom = y + height;
    });
  });
  const cards = [...positions.values()];
  const connections = cards.flatMap(source => {
    const target = source.node.next ? positions.get(source.node.next.id) : undefined;
    if (!target) return [];
    const startX = source.x + cardWidth;
    const middleX = startX + columnGap / 2;
    return [{
      sourceId: source.node.id, targetId: target.node.id,
      d: `M ${startX} ${source.centerY} H ${middleX} V ${target.centerY} H ${target.x - 5}`,
      advanced: source.node.bye || source.node.actual?.status === "completed",
    }];
  });
  return {
    cardWidth, columnGap, cards, connections,
    width: Math.max(cardWidth, rounds.length * (cardWidth + columnGap) - columnGap),
    height: Math.max(headerHeight, ...cards.map(card=>card.y + card.height)) + rowGap,
  };
}
