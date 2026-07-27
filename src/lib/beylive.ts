import {
  BeyliveMatch,
  BeyliveMatchPlayer,
  BeyliveTeam,
  CommunityTournament,
  Profile,
  TournamentPlayer,
} from "./supabase";
import { profileDisplayName } from "./profileName";

export interface BeyliveStanding {
  id: string;
  user_id: string;
  team_id?: string | null;
  is_team: boolean;
  event_id: string;
  player_code: string;
  name: string;
  members?: string[];
  wins: number;
  losses: number;
  points: number;
  against: number;
  diff: number;
  profile?: Profile;
  team?: BeyliveTeam;
}

export function beylivePlayerCode(profile: Profile | null | undefined) {
  return profile?.player_code || (profile?.handle ? `@${profile.handle}` : "SPX-????");
}

export function beyliveEventId(player: Pick<TournamentPlayer, "seed" | "created_at"> | null | undefined, index = 0) {
  return `#${String(player?.seed ?? index + 1).padStart(2, "0")}`;
}

export function beyliveQrValue(profile: Profile | null | undefined) {
  return profile?.player_code || profile?.handle || profile?.id || "";
}

export function isBeyliveTeamTournament(tournament: CommunityTournament | null | undefined) {
  return tournament?.format === "partner";
}

export function beyliveTeamCode(team: BeyliveTeam | null | undefined) {
  if (!team) return "T??";
  return team.team_code || `T${String(team.team_no).padStart(2, "0")}`;
}

export function beyliveTeamMembers(team: BeyliveTeam | null | undefined) {
  return [...(team?.members ?? [])]
    .sort((a, b) => a.slot_no - b.slot_no)
    .map((member) => profileDisplayName(member.profile));
}

export function beyliveTeamName(team: BeyliveTeam | null | undefined) {
  if (!team) return "Team";
  const members = beyliveTeamMembers(team);
  return members.length > 0 ? members.join(" / ") : team.name || beyliveTeamCode(team);
}

export function beyliveTeamQrValue(team: BeyliveTeam | null | undefined) {
  return team?.team_code || team?.id || "";
}

export function beyliveParticipantId(player: BeyliveMatchPlayer) {
  return player.team_id ?? player.user_id;
}

export function beyliveParticipantCode(player: BeyliveMatchPlayer) {
  return player.team ? beyliveTeamCode(player.team) : beylivePlayerCode(player.profile);
}

export function beyliveParticipantName(player: BeyliveMatchPlayer) {
  return player.team ? beyliveTeamName(player.team) : profileDisplayName(player.profile);
}

export function beyliveParticipantQrValue(player: BeyliveMatchPlayer) {
  return player.team ? beyliveTeamQrValue(player.team) : beyliveQrValue(player.profile);
}

export function beyliveParticipantWon(match: BeyliveMatch, player: BeyliveMatchPlayer) {
  if (player.team_id) return match.winner_team_id === player.team_id || player.result === "win";
  return match.winner_id === player.user_id || player.result === "win";
}

export function beyliveFormatLabel(format: CommunityTournament["format"]) {
  return format
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function beyliveStatusLabel(status: CommunityTournament["status"] | BeyliveMatch["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function beyliveStandings(
  tournament: CommunityTournament | null,
  matches: BeyliveMatch[],
): BeyliveStanding[] {
  if (isBeyliveTeamTournament(tournament) && (tournament?.teams?.length ?? 0) > 0) {
    const teams = [...(tournament?.teams ?? [])].sort(
      (a, b) => (a.seed ?? a.team_no) - (b.seed ?? b.team_no) || a.team_no - b.team_no,
    );
    const rows = new Map<string, BeyliveStanding>();

    teams.forEach((team) => {
      const members = beyliveTeamMembers(team);
      rows.set(team.id, {
        id: team.id,
        user_id: team.id,
        team_id: team.id,
        is_team: true,
        event_id: beyliveTeamCode(team),
        player_code: beyliveTeamCode(team),
        name: beyliveTeamName(team),
        members,
        wins: 0,
        losses: 0,
        points: 0,
        against: 0,
        diff: 0,
        team,
      });
    });

    for (const match of matches) {
      if (match.status !== "completed" || !match.players || match.players.length < 2) continue;
      const total = match.players.reduce((sum, player) => sum + player.score, 0);
      for (const player of match.players) {
        if (!player.team_id) continue;
        const row = rows.get(player.team_id);
        if (!row) continue;
        if (match.winner_team_id === player.team_id || player.result === "win") row.wins += 1;
        else row.losses += 1;
        row.points += player.score;
        row.against += total - player.score;
        row.diff = row.points - row.against;
      }
    }

    return [...rows.values()].sort(
      (a, b) =>
        b.wins - a.wins ||
        b.diff - a.diff ||
        b.points - a.points ||
        a.losses - b.losses ||
        a.event_id.localeCompare(b.event_id),
    );
  }

  const players = [...(tournament?.players ?? [])]
    .filter((player) => player.status === "joined")
    .sort((a, b) => (a.seed ?? 999999) - (b.seed ?? 999999));

  const rows = new Map<string, BeyliveStanding>();
  players.forEach((player, index) => {
    rows.set(player.user_id, {
      id: player.user_id,
      user_id: player.user_id,
      team_id: null,
      is_team: false,
      event_id: beyliveEventId(player, index),
      player_code: beylivePlayerCode(player.profile),
      name: profileDisplayName(player.profile),
      wins: 0,
      losses: 0,
      points: 0,
      against: 0,
      diff: 0,
      profile: player.profile,
    });
  });

  for (const match of matches) {
    if (match.status !== "completed" || !match.players || match.players.length < 2) continue;
    const total = match.players.reduce((sum, player) => sum + player.score, 0);
    for (const player of match.players) {
      const row = rows.get(player.user_id);
      if (!row) continue;
      if (match.winner_id === player.user_id || player.result === "win") row.wins += 1;
      else row.losses += 1;
      row.points += player.score;
      row.against += total - player.score;
      row.diff = row.points - row.against;
    }
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.diff - a.diff ||
      b.points - a.points ||
      a.losses - b.losses ||
      a.event_id.localeCompare(b.event_id),
  );
}

export function findBeyliveTeamByScan(teams: BeyliveTeam[], raw: string): BeyliveTeam | null {
  const value = raw
    .trim()
    .replace(/^beylive:team:/i, "")
    .replace(/^spindex:team:/i, "")
    .replace(/^#/, "")
    .toLowerCase();

  if (!value) return null;

  return (
    teams.find((team) => {
      const code = beyliveTeamCode(team).toLowerCase();
      const numeric = String(team.team_no).padStart(2, "0").toLowerCase();
      return (
        team.id.toLowerCase() === value ||
        code === value ||
        code.replace(/^t/, "") === value ||
        numeric === value ||
        `t${numeric}` === value
      );
    }) ?? null
  );
}

export function findTournamentPlayerByScan(
  players: TournamentPlayer[],
  raw: string,
): TournamentPlayer | null {
  const value = raw
    .trim()
    .replace(/^beylive:player:/i, "")
    .replace(/^spindex:player:/i, "")
    .replace(/^@/, "")
    .toLowerCase();

  if (!value) return null;

  return (
    players.find((player, index) => {
      const profile = player.profile;
      const seed = String(player.seed ?? index + 1).padStart(2, "0").toLowerCase();
      return (
        profile?.id.toLowerCase() === value ||
        profile?.handle.toLowerCase() === value ||
        profile?.player_code?.toLowerCase() === value ||
        seed === value ||
        `#${seed}` === value
      );
    }) ?? null
  );
}
