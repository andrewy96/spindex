import type { CommunityTournament } from "./supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TournamentRouteSource = Pick<CommunityTournament, "id" | "slug"> | null | undefined;

export function isTournamentUuid(value: string) {
  return UUID_RE.test(value);
}

export function tournamentLookupColumn(value: string) {
  return isTournamentUuid(value) ? "id" : "slug";
}

export function tournamentRouteParam(tournament: TournamentRouteSource, fallback?: string) {
  return tournament?.slug || tournament?.id || fallback || "";
}

export function tournamentPath(
  locale: string,
  tournament: TournamentRouteSource,
  suffix = "",
  fallback?: string,
) {
  const param = encodeURIComponent(tournamentRouteParam(tournament, fallback));
  return `/${locale}/tournaments/${param}${suffix}`;
}
