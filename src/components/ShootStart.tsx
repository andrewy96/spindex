"use client";

import { useEffect, useRef, useState } from "react";
import { Dict } from "@/i18n";
import {
  CountdownStep,
  VOICE_PACKS,
  getVoicePack,
  loadVoicePackId,
  saveVoicePackId,
  warmVoices,
} from "@/lib/shootVoice";

const SEQUENCE: CountdownStep[] = ["3", "2", "1", "go"];
const STEP_MS = 1000;
const GO_HOLD_MS = 1400;

export default function ShootStart({ dict, disabled }: { dict: Dict; disabled: boolean }) {
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const [step, setStep] = useState<CountdownStep | null>(null);
  const [packId, setPackId] = useState(VOICE_PACKS[0].id);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setPackId(loadVoicePackId());
    warmVoices();
    return () => {
      timers.current.forEach(clearTimeout);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const running = step !== null;

  const runCountdown = () => {
    const pack = getVoicePack(packId);
    SEQUENCE.forEach((s, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStep(s);
          pack.play(s);
        }, i * STEP_MS)
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setStep(null);
        setReady([false, false]);
      }, (SEQUENCE.length - 1) * STEP_MS + GO_HOLD_MS)
    );
  };

  const press = (side: 0 | 1) => {
    if (running || disabled) return;
    const next: [boolean, boolean] = [...ready];
    next[side] = !next[side];
    setReady(next);
    if (next[0] && next[1]) runCountdown();
  };

  return (
    <>
      {/* Start buttons — one per player column */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {([0, 1] as const).map((side) => (
          <button
            key={side}
            onClick={() => press(side)}
            disabled={running || disabled}
            className={`clip-x border px-2 py-3 font-display text-sm font-bold tracking-[0.2em] transition disabled:opacity-40 ${
              ready[side]
                ? "border-accent bg-accent/15 text-accent"
                : "border-edge bg-panel text-ink enabled:hover:border-accent/60 enabled:hover:text-accent"
            }`}
          >
            {ready[side] ? `✓ ${dict.battle.ready}` : `▶ ${dict.battle.start}`}
          </button>
        ))}
      </div>

      {/* Voice pack selector */}
      <div className="mb-4 flex items-center justify-center gap-2 text-xs text-ink-dim">
        <span>🔊 {dict.battle.voicePack}</span>
        <select
          value={packId}
          onChange={(e) => {
            setPackId(e.target.value);
            saveVoicePackId(e.target.value);
            getVoicePack(e.target.value).play("go");
          }}
          className="rounded-md border border-edge bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        >
          {VOICE_PACKS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label(dict)}
            </option>
          ))}
        </select>
      </div>

      {/* Countdown overlay */}
      {running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-sm">
          <div
            key={step}
            className={`animate-countdown-pop text-center font-display font-black ${
              step === "go" ? "text-glow text-6xl text-accent sm:text-8xl" : "text-9xl text-ink"
            }`}
          >
            {step === "go" ? dict.battle.goShoot : step}
          </div>
        </div>
      )}
    </>
  );
}
