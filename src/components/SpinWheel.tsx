"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface WheelItem {
  id: string;
  label: string;
}

/** Segment colours cycle through the SPINDEX palette. */
const SEGMENT_COLORS = [
  "#00e58f",
  "#38d9ff",
  "#4a90ff",
  "#ffb020",
  "#b06bff",
  "#ff5252",
  "#2fd575",
];

const TAU = Math.PI * 2;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A canvas prize wheel used to draw partners fairly. The parent controls the
 * item list; each completed spin reports the landed item's id via onResult.
 * The winner is chosen up front with Math.random so the visual is honest —
 * the wheel simply rotates to reveal an already-fair pick.
 */
export default function SpinWheel({
  items,
  onResult,
  disabled = false,
  spinLabel = "Spin",
  size = 320,
}: {
  items: WheelItem[];
  onResult: (id: string) => void;
  disabled?: boolean;
  spinLabel?: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [spinning, setSpinning] = useState(false);

  const draw = useCallback(
    (rotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - 6;
      const n = Math.max(1, items.length);
      const seg = TAU / n;

      for (let i = 0; i < n; i++) {
        const start = rotation + i * seg;
        const end = start + seg;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#06080b";
        ctx.lineWidth = 2;
        ctx.stroke();

        // label
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(start + seg / 2);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#06080b";
        ctx.font = `700 ${Math.max(11, Math.min(16, 190 / n + 8))}px var(--font-body, sans-serif)`;
        const label = items[i]?.label ?? "";
        const clipped = label.length > 12 ? `${label.slice(0, 11)}…` : label;
        ctx.fillText(clipped, r - 14, 0);
        ctx.restore();
      }

      // hub
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, TAU);
      ctx.fillStyle = "#0c1117";
      ctx.fill();
      ctx.strokeStyle = "#1d2733";
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [items, size]
  );

  useEffect(() => {
    draw(rotationRef.current);
  }, [draw]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const spin = () => {
    if (spinning || disabled || items.length === 0) return;
    const n = items.length;
    const seg = TAU / n;
    const winner = Math.floor(Math.random() * n);

    // Pointer sits at the top (−90°). Rotate so the winner segment's centre
    // ends up under the pointer, plus several full turns for the effect.
    const pointer = -Math.PI / 2;
    const targetCentre = pointer - (winner * seg + seg / 2);
    const base = rotationRef.current % TAU;
    const turns = 5 + Math.floor(Math.random() * 3);
    const from = base;
    const to = base + turns * TAU + ((targetCentre - base) % TAU + TAU) % TAU;

    const duration = 4200;
    const startedAt = performance.now();
    setSpinning(true);

    const frame = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const rot = from + (to - from) * easeOut(t);
      rotationRef.current = rot;
      draw(rot);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
        setSpinning(false);
        onResult(items[winner].id);
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* pointer */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: "20px solid #e8eef4",
            filter: "drop-shadow(0 0 6px rgba(0,229,143,0.6))",
          }}
        />
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="rounded-full"
          aria-label="Partner draw wheel"
        />
      </div>
      <button
        type="button"
        onClick={spin}
        disabled={spinning || disabled || items.length === 0}
        className="clip-x bg-accent px-8 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {spinning ? "…" : spinLabel}
      </button>
    </div>
  );
}
