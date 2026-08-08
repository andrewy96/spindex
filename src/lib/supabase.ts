import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null when the backend isn't configured yet — battle features show a setup notice. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  player_code: string | null;
  stars: number;
  wins: number;
  losses: number;
  created_at: string;
}

/** Demographics live in profile_private — RLS lets only the owner read/write them. */
export interface ProfilePrivate {
  id: string;
  gender: "male" | "female" | null;
  birthday: string | null;
  age: number | null;
}

export interface Challenge {
  id: string;
  host: string;
  play_mode: "player" | "judge";
  city: string;
  venue: string | null;
  battle_at: string | null;
  wager: number;
  format: "single" | "team";
  team_size: number;
  target_score: number;
  note: string | null;
  status: "open" | "accepted" | "completed" | "cancelled";
  opponent: string | null;
  player1: string | null;
  player2: string | null;
  created_at: string;
  host_profile?: Profile;
  opponent_profile?: Profile | null;
  player1_profile?: Profile | null;
  player2_profile?: Profile | null;
}

export type Finish = "spin" | "over" | "burst" | "xtreme";

export interface Round {
  side: 1 | 2;
  finish: Finish;
  pts: number;
}

export interface Match {
  id: string;
  challenge_id: string | null;
  p1: string;
  p2: string;
  p1_score: number;
  p2_score: number;
  rounds: Round[];
  winner: string;
  wager: number;
  format: "single" | "team";
  team_size: number;
  target_score: number;
  stars_moved: number | null;
  status: "pending" | "confirmed" | "rejected";
  reported_by: string;
  created_at: string;
  confirmed_at: string | null;
  p1_profile?: Profile;
  p2_profile?: Profile;
}

export interface GatheringMember {
  gathering_id: string;
  user_id: string;
  status: "joined" | "waitlisted";
  created_at: string;
  profile?: Profile;
}

export interface Gathering {
  id: string;
  host: string;
  title: string;
  city: string;
  venue: string;
  gather_at: string;
  fee_type: "free" | "paid";
  fee_amount: number | null;
  capacity: number | null;
  join_mode: "open" | "waitlist";
  note: string | null;
  status: "open" | "cancelled";
  created_at: string;
  host_profile?: Profile;
  members?: GatheringMember[];
}

export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "swiss"
  | "free_for_all"
  | "leaderboard"
  | "partner"
  | "group_stage";

export interface TournamentPlayer {
  tournament_id: string;
  user_id: string;
  status: "joined" | "waitlisted";
  seed: number | null;
  /** Group-stage pool (1-8) once assign_group_stage_pools runs; null for every other format. */
  pool_no: number | null;
  created_at: string;
  profile?: Profile;
}

export interface BeyliveTeamMember {
  tournament_id: string;
  team_id: string;
  user_id: string;
  slot_no: number;
  created_at: string;
  profile?: Profile;
}

export interface BeyliveTeam {
  id: string;
  tournament_id: string;
  team_no: number;
  team_code: string;
  name: string;
  seed: number | null;
  created_at: string;
  members?: BeyliveTeamMember[];
}

export interface CommunityTournament {
  id: string;
  host: string;
  name: string;
  city: string;
  venue: string;
  starts_at: string;
  format: TournamentFormat;
  max_players: number;
  live_enabled: boolean;
  stream_url: string | null;
  stream_title: string | null;
  stream_enabled: boolean;
  stadium1_stream_url: string | null;
  stadium1_stream_title: string | null;
  stadium1_stream_enabled: boolean;
  stadium2_stream_url: string | null;
  stadium2_stream_title: string | null;
  stadium2_stream_enabled: boolean;
  current_round: number | null;
  target_score: number;
  winner_id: string | null;
  winner_team_id: string | null;
  note: string | null;
  status: "open" | "started" | "completed" | "cancelled";
  created_at: string;
  host_profile?: Profile;
  winner_profile?: Profile | null;
  winner_team?: BeyliveTeam | null;
  players?: TournamentPlayer[];
  teams?: BeyliveTeam[];
}

export type BeyliveBracket = "main" | "losers" | "grand" | "leaderboard" | `pool_${number}`;
export type BeyliveMatchStatus = "scheduled" | "live" | "completed" | "cancelled" | "bye";
export type BeylivePlayerResult = "pending" | "win" | "loss";

export interface BeyliveJudge {
  tournament_id: string;
  user_id: string;
  role: "host" | "judge" | "scorer";
  created_at: string;
  profile?: Profile;
}

export interface BeyliveMatchPlayer {
  match_id: string;
  user_id: string;
  team_id: string | null;
  slot_no: number;
  score: number;
  result: BeylivePlayerResult;
  placement: number | null;
  profile?: Profile;
  team?: BeyliveTeam | null;
}

export interface BeyliveMatchRound {
  id: number;
  match_id: string;
  user_id: string;
  team_id: string | null;
  finish: Finish;
  pts: number;
  created_by: string;
  created_at: string;
  profile?: Profile;
}

export interface BeyliveMatch {
  id: string;
  tournament_id: string;
  round_no: number;
  bracket: BeyliveBracket;
  match_no: number;
  table_no: number | null;
  target_score: number;
  status: BeyliveMatchStatus;
  winner_id: string | null;
  winner_team_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  players?: BeyliveMatchPlayer[];
  rounds?: BeyliveMatchRound[];
}

/** Select for matches with both player profiles joined. */
export const MATCH_SELECT =
  "*, p1_profile:profiles!matches_p1_fkey(*), p2_profile:profiles!matches_p2_fkey(*)";

export const TOURNAMENT_SELECT =
  "*, host_profile:profiles!tournaments_host_fkey(*), winner_profile:profiles!tournaments_winner_id_fkey(*), winner_team:beylive_teams!tournaments_winner_team_id_fkey(*, members:beylive_team_members!beylive_team_members_team_id_fkey(*, profile:profiles!beylive_team_members_user_id_fkey(*))), players:tournament_players(*, profile:profiles!tournament_players_user_id_fkey(*)), teams:beylive_teams!beylive_teams_tournament_id_fkey(*, members:beylive_team_members!beylive_team_members_team_id_fkey(*, profile:profiles!beylive_team_members_user_id_fkey(*)))";

export const BEYLIVE_MATCH_SELECT =
  "*, players:beylive_match_players(*, profile:profiles!beylive_match_players_user_id_fkey(*), team:beylive_teams!beylive_match_players_team_id_fkey(*, members:beylive_team_members!beylive_team_members_team_id_fkey(*, profile:profiles!beylive_team_members_user_id_fkey(*)))), rounds:beylive_match_rounds(*, profile:profiles!beylive_match_rounds_user_id_fkey(*), team:beylive_teams!beylive_match_rounds_team_id_fkey(*))";

export const FINISH_POINTS: Record<Finish, number> = {
  spin: 1,
  over: 2,
  burst: 2,
  xtreme: 3,
};

export const DEFAULT_WIN_SCORE = 4;

export const MY_CITIES = [
  "Kuala Lumpur",
  "Selangor",
  "Penang",
  "Johor",
  "Perak",
  "Negeri Sembilan",
  "Melaka",
  "Pahang",
  "Kedah",
  "Kelantan",
  "Terengganu",
  "Perlis",
  "Sabah",
  "Sarawak",
  "Putrajaya",
  "Labuan",
] as const;
