import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

export function avatarExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/** null when the file is usable, otherwise which rule it broke. */
export function checkAvatarFile(file: File): "type" | "size" | null {
  if (!AVATAR_TYPES.has(file.type)) return "type";
  if (file.size > MAX_AVATAR_BYTES) return "size";
  return null;
}

/**
 * Store the picture and point the profile at it.
 * Requires a signed-in session — the storage and profile policies are owner-scoped.
 */
export async function uploadAvatar(
  client: SupabaseClient,
  userId: string,
  file: File
): Promise<"upload" | "update" | null> {
  const path = `${userId}/avatar-${Date.now()}.${avatarExtension(file)}`;
  const { error: uploadError } = await client.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return "upload";

  const { data } = client.storage.from("avatars").getPublicUrl(path);
  const { error: updateError } = await client
    .from("profiles")
    .update({ avatar_url: data.publicUrl })
    .eq("id", userId);
  return updateError ? "update" : null;
}
