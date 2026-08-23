"use client";

import { useEffect, useState } from "react";

export default function QrCodeBadge({
  value,
  label,
  size = 116,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!value) {
      setSrc(null);
      return;
    }
    // Loaded on demand — the encoder is dead weight on pages that never draw a code.
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(value, {
        width: size,
        margin: 1,
        color: {
          dark: "#e8eef4",
          light: "#06080b",
        },
        errorCorrectionLevel: "M",
      }).then((next) => {
        if (active) setSrc(next);
      })
    );
    return () => {
      active = false;
    };
  }, [size, value]);

  return (
    <div className="inline-flex shrink-0 flex-col items-center gap-1 rounded-md border border-accent/30 bg-bg p-1.5 shadow-[0_0_16px_rgba(0,229,143,0.08)]">
      {src ? (
        <img
          src={src}
          alt={label ?? value}
          width={size}
          height={size}
          className="block rounded border border-edge/80"
        />
      ) : (
        <div
          className="grid place-items-center rounded border border-edge bg-panel text-[10px] text-ink-dim"
          style={{ width: size, height: size }}
        >
          QR
        </div>
      )}
      {label && <span className="font-display text-[9px] font-bold tracking-wider text-accent">{label}</span>}
    </div>
  );
}
