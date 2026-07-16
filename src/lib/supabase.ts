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

export interface Challenge {
  id: string;
  host: string;
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
  created_at: string;
  host_profile?: Profile;
  opponent_profile?: Profile | null;
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
