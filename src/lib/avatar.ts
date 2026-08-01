import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

/** A picture that is ready to be stored, square-cropped and encoded. */
export type AvatarImage = { blob: Blob; ext: string; type: string };

export function avatarExtension(file: Blob) {
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

/** Avatars never render larger than this, so nothing bigger is worth storing. */
export const AVATAR_MAX_PX = 512;

/**
 * Cut a square out of the picture and encode it as WebP.
 * `size` is the side of the square in source pixels; it is never upscaled.
 * Returns null when the browser cannot do the conversion.
 */
export async function encodeAvatarCrop(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  size: number
): Promise<AvatarImage | null> {
  const side = Math.round(Math.min(size, AVATAR_MAX_PX));
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, side, side);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85)
  );
  return blob ? { blob, ext: "webp", type: "image/webp" } : null;
}

/**
 * Square-crop and shrink to AVATAR_MAX_PX as WebP.
 * A phone photo is a couple of megabytes; every scoreboard row pays for that
 * otherwise. Returns the original if the browser cannot do the conversion.
 */
export async function shrinkAvatar(file: Blob): Promise<AvatarImage> {
  const fallback = { blob: file, ext: avatarExtension(file), type: file.type };
  if (typeof createImageBitmap !== "function") return fallback;
  try {
    const bitmap = await createImageBitmap(file);
    // Centre crop to a square so the round mask never lops off half a face.
    const crop = Math.min(bitmap.width, bitmap.height);
    const image = await encodeAvatarCrop(
      bitmap,
      (bitmap.width - crop) / 2,
      (bitmap.height - crop) / 2,
      crop
    );
    bitmap.close();
    if (!image || image.blob.size >= file.size) return fallback;
    return image;
  } catch {
    return fallback;
  }
}

/**
 * Store the picture and point the profile at it.
 * Requires a signed-in session — the storage and profile policies are owner-scoped.
 */
export async function uploadAvatar(
  client: SupabaseClient,
  userId: string,
  image: AvatarImage
): Promise<"upload" | "update" | null> {
  const { blob, ext, type } = image;
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await client.storage.from("avatars").upload(path, blob, {
    cacheControl: "31536000",
    contentType: type,
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
