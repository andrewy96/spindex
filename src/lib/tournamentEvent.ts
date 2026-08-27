import type { CommunityTournament, TournamentEventType, TournamentFormat } from "./supabase";
import {
  normalizeTournamentRegistrationConfig,
  type TournamentRegistrationConfig,
} from "./tournamentRegistration";

type TournamentEventSource =
  | Pick<CommunityTournament, "event_type" | "format" | "registration_config">
  | null
  | undefined;

export function normalizeTournamentEventType(value: unknown): TournamentEventType {
  return value === "team" ? "team" : "player";
}

export function inferTournamentEventType(tournament: TournamentEventSource): TournamentEventType {
  if (tournament?.event_type === "team" || tournament?.event_type === "player") {
    return tournament.event_type;
  }
  if (tournament?.format === "partner") return "team";
  if (
    tournament?.registration_config &&
    normalizeTournamentRegistrationConfig(tournament.registration_config).teamNameEnabled
  ) {
    return "team";
  }
  return "player";
}

export function tournamentUsesTeamEntrants(
  eventType: TournamentEventType,
  format: TournamentFormat,
) {
  return eventType === "team" || format === "partner";
}

export function registrationConfigForEventType(
  config: TournamentRegistrationConfig,
  eventType: TournamentEventType,
): TournamentRegistrationConfig {
  const normalized = normalizeTournamentRegistrationConfig(config);
  if (eventType === "team") {
    return {
      ...normalized,
      teamNameEnabled: true,
      teamNameRequired: true,
    };
  }
  return {
    ...normalized,
    teamNameEnabled: false,
    teamNameRequired: false,
  };
}
