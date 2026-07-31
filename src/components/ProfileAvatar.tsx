import Image from "next/image";
import type { Profile } from "@/lib/supabase";

type AvatarProfile = Pick<Profile, "avatar_url" | "display_name" | "handle">;

/** Only our own bucket is whitelisted for the optimiser; anything else stays a plain img. */
const OPTIMISABLE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/avatars/`;

/** Round profile picture with an initial fallback. */
export default function ProfileAvatar({
  profile,
  size = 28,
  className = "",
}: {
  profile: AvatarProfile | null | undefined;
  size?: number;
  className?: string;
}) {
  const label = profile?.display_name?.trim() || profile?.handle || "?";
  const url = profile?.avatar_url;
  const optimisable =
    !!url && process.env.NEXT_PUBLIC_SUPABASE_URL && url.startsWith(OPTIMISABLE_PREFIX);
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-panel font-display font-black text-accent ${className}`}
    >
      {url && optimisable ? (
        <Image
          src={url}
          alt=""
          // Ask for 2x so it stays sharp on phones without shipping the original photo.
          width={size * 2}
          height={size * 2}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : url ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        label.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
