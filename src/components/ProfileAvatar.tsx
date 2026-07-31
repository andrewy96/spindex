import type { Profile } from "@/lib/supabase";

type AvatarProfile = Pick<Profile, "avatar_url" | "display_name" | "handle">;

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
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-panel font-display font-black text-accent ${className}`}
    >
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
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
