import {
  BeyliveMatch,
  BeyliveMatchPlayer,
  BeyliveTeam,
  CommunityTournament,
  Finish,
  Profile,
  TournamentPlayer,
} from "./supabase";
import { profileDisplayName } from "./profileName";

/** The four scorable finish types, shared by every inline/standalone BEYLIVE scorer. */
export const BEYLIVE_FINISHES: { key: Finish; label: string; color: string }[] = [
  { key: "spin", label: "Spin +1", color: "var(--color-sta)" },
  { key: "over", label: "Over +2", color: "var(--color-def)" },
  { key: "burst", label: "Burst +2", color: "var(--color-spc)" },
  { key: "xtreme", label: "Xtreme +3", color: "var(--color-atk)" },
];

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

function cleanStreamToken(value: string | null | undefined) {
  if (!value) return null;
  const token = value.trim();
  return /^[a-zA-Z0-9_-]{3,128}$/.test(token) ? token : null;
}

function youtubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") return cleanStreamToken(url.pathname.split("/").filter(Boolean)[0]);
  if (!["youtube.com", "youtube-nocookie.com"].includes(host)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/watch") return cleanStreamToken(url.searchParams.get("v"));
  if (["embed", "live", "shorts", "v"].includes(parts[0])) return cleanStreamToken(parts[1]);
  return cleanStreamToken(url.searchParams.get("v"));
}

export function beyliveStreamEmbedUrl(raw: string | null | undefined, parentHost = "localhost") {
  const value = raw?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    const youtubeId = youtubeVideoId(url);
    if (youtubeId) return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1`;

    if (host === "twitch.tv") {
      const parts = url.pathname.split("/").filter(Boolean);
      const parent = encodeURIComponent(parentHost || "localhost");
      if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "")) {
        return `https://player.twitch.tv/?video=${parts[1]}&parent=${parent}&autoplay=true&muted=true`;
      }
      const channel = cleanStreamToken(parts[0]);
      if (channel) return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=true&muted=true`;
    }

    if (host === "player.twitch.tv") {
      if (!url.searchParams.has("parent")) url.searchParams.set("parent", parentHost || "localhost");
      if (!url.searchParams.has("autoplay")) url.searchParams.set("autoplay", "true");
      if (!url.searchParams.has("muted")) url.searchParams.set("muted", "true");
      return url.toString();
    }

    if (host === "facebook.com" || host === "fb.watch") {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}&show_text=false&width=1280`;
    }

    if (host === "player.vimeo.com") return url.toString();
    if (host === "vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
      if (videoId) return `https://player.vimeo.com/video/${videoId}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function isBeyliveTeamTournament(tournament: CommunityTournament | null | undefined) {
  return tournament?.format === "partner";
}

export function isBeyliveGroupStageTournament(tournament: CommunityTournament | null | undefined) {
  return tournament?.format === "group_stage";
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
  if (format === "partner") return "Partner League";

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

export interface BeyliveGroupPool {
  poolNo: number;
  standings: BeyliveStanding[];
}

/**
 * Per-pool standings for a group_stage tournament, computed only from that
 * pool's own bracket ("pool_1".."pool_8") — the top 2 rows of each pool are
 * the players advancing to the knockout bracket.
 */
export function beyliveGroupPools(
  tournament: CommunityTournament | null,
  matches: BeyliveMatch[],
): BeyliveGroupPool[] {
  const players = (tournament?.players ?? []).filter(
    (player) => player.status === "joined" && player.pool_no != null,
  );
  if (players.length === 0) return [];

  const playersByPool = new Map<number, TournamentPlayer[]>();
  for (const player of players) {
    const poolNo = player.pool_no as number;
    const list = playersByPool.get(poolNo);
    if (list) list.push(player);
    else playersByPool.set(poolNo, [player]);
  }

  const matchesByPool = new Map<number, BeyliveMatch[]>();
  for (const match of matches) {
    const found = /^pool_(\d+)$/.exec(match.bracket);
    if (!found) continue;
    const poolNo = Number(found[1]);
    const list = matchesByPool.get(poolNo);
    if (list) list.push(match);
    else matchesByPool.set(poolNo, [match]);
  }

  return [...playersByPool.entries()]
    .sort(([a], [b]) => a - b)
    .map(([poolNo, poolPlayers]) => {
      const sortedPlayers = [...poolPlayers].sort(
        (a, b) => (a.seed ?? 999999) - (b.seed ?? 999999),
      );
      const rows = new Map<string, BeyliveStanding>();
      sortedPlayers.forEach((player, index) => {
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

      for (const match of matchesByPool.get(poolNo) ?? []) {
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

      const standings = [...rows.values()].sort(
        (a, b) =>
          b.wins - a.wins ||
          b.diff - a.diff ||
          b.points - a.points ||
          a.losses - b.losses ||
          a.event_id.localeCompare(b.event_id),
      );
      return { poolNo, standings };
    });
}

/** Knockout round name from how many matches are in it: 8 -> "Round of 16", 1 -> "Final". */
export function beyliveKnockoutRoundLabel(matchCountInRound: number) {
  if (matchCountInRound <= 1) return "Final";
  if (matchCountInRound === 2) return "Semifinal";
  if (matchCountInRound === 4) return "Quarterfinal";
  return `Round of ${matchCountInRound * 2}`;
}

export interface BeylivePodiumEntry {
  place: "1st" | "2nd" | "3rd-4th";
  name: string;
  playerCode: string;
  profile?: Profile;
}

/**
 * 1st/2nd/3rd-4th from the 'main' knockout bracket's Final and Semifinal —
 * null until the tournament has actually crowned a champion. Semifinal
 * losers tie for 3rd since there is no separate bronze match.
 */
export function beylivePodium(
  tournament: CommunityTournament | null,
  matches: BeyliveMatch[],
): BeylivePodiumEntry[] | null {
  if (!tournament || tournament.status !== "completed") return null;

  const mainMatches = matches.filter((m) => m.bracket === "main" && m.status === "completed");
  if (mainMatches.length === 0) return null;

  const roundNos = [...new Set(mainMatches.map((m) => m.round_no))].sort((a, b) => b - a);
  const finalMatches = mainMatches.filter((m) => m.round_no === roundNos[0]);
  if (finalMatches.length !== 1) return null;

  const final = finalMatches[0];
  const winner = final.players?.find((p) => p.user_id === final.winner_id);
  const runnerUp = final.players?.find((p) => p.user_id !== final.winner_id);
  if (!winner || !runnerUp) return null;

  const entries: BeylivePodiumEntry[] = [
    { place: "1st", name: profileDisplayName(winner.profile), playerCode: beylivePlayerCode(winner.profile), profile: winner.profile },
    { place: "2nd", name: profileDisplayName(runnerUp.profile), playerCode: beylivePlayerCode(runnerUp.profile), profile: runnerUp.profile },
  ];

  const semiMatches = mainMatches.filter((m) => m.round_no === roundNos[1]);
  if (semiMatches.length === 2) {
    const losers = semiMatches
      .map((m) => m.players?.find((p) => p.user_id !== m.winner_id))
      .filter((p): p is BeyliveMatchPlayer => !!p);
    if (losers.length === 2) {
      for (const p of losers) {
        entries.push({ place: "3rd-4th", name: profileDisplayName(p.profile), playerCode: beylivePlayerCode(p.profile), profile: p.profile });
      }
    }
  }

  return entries;
}

export function findBeyliveTeamByScan(teams: BeyliveTeam[], raw: string): BeyliveTeam | null {
  const value = raw
    .trim()
    .replace(/^beylive:team:/i, "")
    .replace(/^spindex:team:/i, "")
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/^to(?=\d)/, "t0");

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
