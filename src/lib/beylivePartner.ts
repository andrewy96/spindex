import {
  BattleMode,
  champion,
  consolationChampion,
  nextRound,
  PARTNER_WIN_SCORE,
  Player,
  scoreWinner,
  standings,
  Team,
  TeamMatch,
} from "./partnerBattle";

export type LocalPartnerPhase = "roster" | "draw" | "battle";

export interface LocalPartnerState {
  phase?: LocalPartnerPhase;
  mode?: BattleMode;
  players?: Player[];
  draw?: string[];
  teams?: Team[];
  matches?: TeamMatch[];
  round?: number;
}

export interface LocalDisplayTeam {
  id: string;
  code: string;
  name: string;
  members: string[];
}

export interface LocalPartnerStanding {
  id: string;
  code: string;
  name: string;
  members: string[];
  wins: number;
  losses: number;
  pts: number;
  against: number;
  diff: number;
}

export function isLocalPartnerLive(state: LocalPartnerState | null | undefined) {
  return state?.phase === "battle" && (state.teams?.length ?? 0) > 0 && (state.matches?.length ?? 0) > 0;
}

export function localPartnerMode(state: LocalPartnerState | null | undefined): BattleMode {
  return state?.mode ?? "league";
}

export function localPartnerTeams(state: LocalPartnerState | null | undefined): LocalDisplayTeam[] {
  if (!state?.teams?.length) return [];

  const names = new Map((state.players ?? []).map((player) => [player.id, player.name]));
  return state.teams.map((team, index) => {
    const members = team.members.map((memberId) => names.get(memberId) ?? memberId);
    const code = `T${String(index + 1).padStart(2, "0")}`;
    return {
      id: team.id,
      code,
      name: members.join(" / ") || `Team ${String(index + 1).padStart(2, "0")}`,
      members,
    };
  });
}

export function localPartnerTeamMap(state: LocalPartnerState | null | undefined) {
  return new Map(localPartnerTeams(state).map((team) => [team.id, team]));
}

export function localPartnerTeamCode(state: LocalPartnerState | null | undefined, teamId: string) {
  return localPartnerTeamMap(state).get(teamId)?.code ?? "T??";
}

export function localPartnerTeamName(state: LocalPartnerState | null | undefined, teamId: string) {
  return localPartnerTeamMap(state).get(teamId)?.name ?? "Team";
}

function normalizeTeamScan(raw: string) {
  return raw
    .trim()
    .replace(/^beylive:team:/i, "")
    .replace(/^spindex:team:/i, "")
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/^to(?=\d)/, "t0");
}

export function findLocalPartnerTeamByScan(
  teams: LocalDisplayTeam[],
  raw: string,
): LocalDisplayTeam | null {
  const value = normalizeTeamScan(raw);
  if (!value) return null;

  return (
    teams.find((team) => {
      const code = team.code.toLowerCase();
      const numeric = code.replace(/^t/, "");
      return (
        team.id.toLowerCase() === value ||
        code === value ||
        numeric === value ||
        `t${numeric}` === value
      );
    }) ?? null
  );
}

export function localPartnerDisplayMatches(state: LocalPartnerState | null | undefined) {
  return [...(state?.matches ?? [])].sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
}

export function localPartnerGroupedRounds(state: LocalPartnerState | null | undefined) {
  const map = new Map<number, TeamMatch[]>();
  for (const match of localPartnerDisplayMatches(state)) {
    const list = map.get(match.round) ?? [];
    list.push(match);
    map.set(match.round, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function localPartnerTableLabel(matches: TeamMatch[], match: TeamMatch, stadiumCount = 2) {
  const sameRound = matches.filter((item) => item.round === match.round);
  const index = Math.max(0, sameRound.findIndex((item) => item.id === match.id));
  const stadium = (index % stadiumCount) + 1;
  const wave = Math.floor(index / stadiumCount) + 1;
  return wave > 1 ? `Stadium ${stadium} / Wave ${wave}` : `Stadium ${stadium}`;
}

export function localPartnerStageLabel(match: TeamMatch, mode: BattleMode) {
  if (match.stage === "final") return "Grand Final";
  if (match.stage === "playoff") {
    if (match.bracket === "consolation") return match.title ? `Consolation ${match.title}` : "Consolation";
    return match.title ? `Championship ${match.title}` : "Championship";
  }
  return mode === "league" ? `League Round ${match.round}` : `Swiss Round ${match.round}`;
}

export function localPartnerStandings(state: LocalPartnerState | null | undefined): LocalPartnerStanding[] {
  const teams = localPartnerTeams(state);
  const teamIds = teams.map((team) => team.id);
  const mode = localPartnerMode(state);
  const matches = state?.matches ?? [];
  const countedMatches = mode === "league" ? matches.filter((match) => match.stage === "league") : matches;
  const teamMap = new Map(teams.map((team) => [team.id, team]));

  return standings(teamIds, countedMatches).map((row) => {
    const team = teamMap.get(row.id);
    return {
      ...row,
      code: team?.code ?? "T??",
      name: team?.name ?? "Team",
      members: team?.members ?? [],
    };
  });
}

export function localPartnerChampion(state: LocalPartnerState | null | undefined) {
  if (!state || !isLocalPartnerLive(state)) return null;
  return champion(
    state.teams?.map((team) => team.id) ?? [],
    state.matches ?? [],
    state.round ?? 1,
    localPartnerMode(state),
  );
}

export function localPartnerConsolationChampion(state: LocalPartnerState | null | undefined) {
  if (!state || !isLocalPartnerLive(state) || localPartnerMode(state) !== "league") return null;
  return consolationChampion(state.matches ?? []);
}

export function scoreLocalPartnerMatch(
  state: LocalPartnerState | null | undefined,
  matchId: string,
  scores: Record<string, number>,
): LocalPartnerState | null {
  if (!state?.teams?.length || !state.matches?.length) return null;

  const mode = localPartnerMode(state);
  const teamIds = state.teams.map((team) => team.id);
  const match = state.matches.find((item) => item.id === matchId);
  const winnerId = match ? scoreWinner(match.teams, scores) : null;
  if (!match || winnerId === null) return null;

  const nextMatches = state.matches.map((item) =>
    item.id === matchId ? { ...item, winner: winnerId, scores } : item,
  );
  if (nextMatches.some((item) => item.round > match.round)) {
    return { ...state, phase: "battle", matches: nextMatches };
  }

  const current = nextMatches.filter((item) => item.round === match.round);
  if (current.every((item) => item.winner !== null)) {
    const upcoming = nextRound(teamIds, nextMatches, match.round, mode);
    if (upcoming.length > 0) {
      return {
        ...state,
        phase: "battle",
        matches: [...nextMatches, ...upcoming],
        round: match.round + 1,
      };
    }
  }

  return { ...state, phase: "battle", matches: nextMatches };
}

export { PARTNER_WIN_SCORE };
export type { TeamMatch };
