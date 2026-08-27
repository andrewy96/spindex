import type { CommunityTournament, Profile } from "./supabase";

type AccessProfile = Pick<
  Profile,
  "id" | "approved_host" | "beylive_judge" | "is_walkin" | "admin_deleted_at"
> | null | undefined;

type AccessTournament = Pick<CommunityTournament, "host"> | null | undefined;

function activeRegisteredProfile(profile: AccessProfile): profile is NonNullable<AccessProfile> {
  return !!profile && !profile.is_walkin && !profile.admin_deleted_at;
}

export function hasBeyliveHostControlAccess(profile: AccessProfile, tournament: AccessTournament) {
  if (!activeRegisteredProfile(profile) || !tournament) return false;
  return profile.id === tournament.host && profile.approved_host;
}

export function hasGlobalBeyliveJudgeAccess(profile: AccessProfile) {
  if (!activeRegisteredProfile(profile)) return false;
  return profile.beylive_judge;
}

export function canAccessBeyliveControl(
  profile: AccessProfile,
  tournament: AccessTournament,
  judgeRole?: string | null,
) {
  return (
    hasBeyliveHostControlAccess(profile, tournament) ||
    hasGlobalBeyliveJudgeAccess(profile) ||
    (activeRegisteredProfile(profile) && !!judgeRole)
  );
}
