import type { SupabaseClient } from "@supabase/supabase-js";

export async function deleteAdminManagedUser(admin: SupabaseClient, targetId: string) {
  const { data: profile } = await admin
    .from("profiles")
    .select("id,is_walkin,admin_deleted_at")
    .eq("id", targetId)
    .maybeSingle();

  if (profile?.admin_deleted_at) {
    return { deleted: true, mode: "archived" as const };
  }

  if (profile?.is_walkin) {
    const { error } = await admin.rpc("admin_delete_walkin", { p_target: targetId });
    if (!error) return { deleted: true, mode: "walkin" as const };

    return {
      deleted: false,
      error: error.message || "walkin_delete_failed",
    };
  }

  const hardDelete = await admin.auth.admin.deleteUser(targetId);
  if (!hardDelete.error) {
    return { deleted: true, mode: "hard" as const };
  }

  const softDelete = await admin.auth.admin.deleteUser(targetId, true);
  if (softDelete.error) {
    return {
      deleted: false,
      error: softDelete.error.message || hardDelete.error.message || "delete_failed",
    };
  }

  await admin.from("profile_private").delete().eq("id", targetId);
  const { error: archiveError } = await admin
    .from("profiles")
    .update({
      handle: `deleted_${targetId.replace(/-/g, "").slice(0, 12)}`,
      display_name: "Deleted user",
      avatar_url: null,
      city: null,
      stars: 0,
      approved_host: false,
      beylive_judge: false,
      admin_deleted_at: new Date().toISOString(),
    })
    .eq("id", targetId);
  if (archiveError) {
    return { deleted: false, error: archiveError.message || "archive_failed" };
  }

  return { deleted: true, mode: "soft" as const };
}
