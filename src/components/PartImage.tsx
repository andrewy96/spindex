import Image from "next/image";

export default function PartImage({
  src,
  alt,
  fallbackLabel,
  color = "var(--color-accent)",
  className = "",
  sizes = "(max-width: 640px) 45vw, 240px",
  priority = false,
}: {
  src: string | null;
  alt: string;
  fallbackLabel: string;
  color?: string;
  className?: string;
  /** Rendered width per breakpoint — keep it close to reality or the CDN ships too many pixels. */
  sizes?: string;
  priority?: boolean;
}) {
  if (src) {
    return (
      <span className="relative block h-full w-full">
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={`object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] ${className}`}
        />
      </span>
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center ${className}`}>
      <span
        className="font-display text-3xl font-bold opacity-60"
        style={{ color }}
      >
        {fallbackLabel}
      </span>
    </div>
  );
}
