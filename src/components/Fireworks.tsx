"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#00e58f", "#38d9ff", "#ffb020", "#ff5252", "#b06bff"];
/** Tuned so a shell reaches its apex in roughly a second at 60fps. */
const GRAVITY = 0.3;
const PARTICLE_GRAVITY = 0.09;

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Shell {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
}

/**
 * Full-screen firework burst for a match win. Purely decorative: the canvas
 * never takes pointer events, so the controls underneath stay usable.
 */
export default function Fireworks({ durationMs = 7000 }: { durationMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const shells: Shell[] = [];
    const particles: Particle[] = [];

    const launch = () => {
      const targetY = height * (0.12 + Math.random() * 0.32);
      const x = width * (0.1 + Math.random() * 0.8);
      shells.push({
        x,
        y: height + 8,
        px: x,
        py: height + 8,
        vx: (Math.random() - 0.5) * 1.6,
        // Just enough upward speed to stall out around targetY.
        vy: -Math.sqrt(2 * GRAVITY * (height - targetY)) * (0.96 + Math.random() * 0.08),
        targetY,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    };

    const burst = (x: number, y: number, color: string) => {
      const count = 52 + Math.floor(Math.random() * 34);
      const speed = 5.5 + Math.random() * 3.5;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.14;
        const s = speed * (0.45 + Math.random() * 0.75);
        particles.push({
          x,
          y,
          px: x,
          py: y,
          vx: Math.cos(angle) * s,
          vy: Math.sin(angle) * s,
          life: 0,
          max: 52 + Math.random() * 48,
          color: Math.random() < 0.18 ? "#ffffff" : color,
          size: 1.4 + Math.random() * 1.9,
        });
      }
    };

    const started = performance.now();
    let nextLaunch = 0;
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = now - started;

      // Fade the previous frame instead of clearing it — leaves comet trails
      // while keeping the canvas transparent over the page.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      if (elapsed < durationMs - 1200 && now >= nextLaunch) {
        launch();
        if (Math.random() < 0.4) launch();
        nextLaunch = now + 260 + Math.random() * 420;
      }

      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.px = s.x;
        s.py = s.y;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += GRAVITY;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        if (s.vy >= 0 || s.y <= s.targetY) {
          burst(s.x, s.y, s.color);
          shells.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += 1;
        if (p.life > p.max) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += PARTICLE_GRAVITY;
        p.vx *= 0.965;
        p.vy *= 0.965;
        p.px = p.x;
        p.py = p.y;
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (elapsed < durationMs || particles.length > 0 || shells.length > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [durationMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}
