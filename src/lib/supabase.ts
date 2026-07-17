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
  | "leaderboard";

export interface TournamentPlayer {
  tournament_id: string;
  user_id: string;
  status: "joined" | "waitlisted";
  seed: number | null;
  created_at: string;
  profile?: Profile;
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
  note: string | null;
  status: "open" | "started" | "completed" | "cancelled";
  created_at: string;
  host_profile?: Profile;
  players?: TournamentPlayer[];
}

/** Select for matches with both player profiles joined. */
export const MATCH_SELECT =
  "*, p1_profile:profiles!matches_p1_fkey(*), p2_profile:profiles!matches_p2_fkey(*)";

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
