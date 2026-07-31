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
    <div className="inline-flex flex-col items-center gap-1 rounded-md border border-edge bg-bg p-2">
      {src ? (
        <img src={src} alt={label ?? value} width={size} height={size} className="block" />
      ) : (
        <div
          className="grid place-items-center rounded bg-panel text-[10px] text-ink-dim"
          style={{ width: size, height: size }}
        >
          QR
        </div>
      )}
      {label && <span className="font-display text-[10px] font-bold tracking-wider text-ink-dim">{label}</span>}
    </div>
  );
}
