"use client";

import { Dict } from "@/i18n";

/** Steps of the launch countdown, played in order. */
export type CountdownStep = "3" | "2" | "1" | "go";

export type VoicePack = {
  id: string;
  label: (d: Dict) => string;
  /** Play the sound for one countdown step. */
  play: (step: CountdownStep) => void;
};

const STORAGE_KEY = "beylab-shoot-voice";

/* ---------- Web Audio beeps (electronic pack + accent under voices) ---------- */

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function tone(freq: number, duration: number, type: OscillatorType = "square", volume = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function beepStep(step: CountdownStep) {
  if (step === "go") {
    tone(660, 0.12, "square", 0.2);
    setTimeout(() => tone(880, 0.5, "square", 0.22), 110);
  } else {
    tone(520, 0.18);
  }
}

/* ---------- Speech synthesis voices ---------- */

function speak(text: string, lang: string, rate = 1.1, pitch = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  u.pitch = pitch;
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.toLowerCase()));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

const ZH_STEPS: Record<CountdownStep, string> = { "3": "三", "2": "二", "1": "一", go: "Go Shoot!" };
const EN_STEPS: Record<CountdownStep, string> = {
  "3": "Three",
  "2": "Two",
  "1": "One",
  go: "Go Shoot!",
};

/**
 * Build a voice pack backed by audio files, e.g. filePack("anime", d => "动漫语音", "/sounds/anime")
 * expects /public/sounds/anime/3.mp3, 2.mp3, 1.mp3, go.mp3. Add the result to VOICE_PACKS below
 * to make it selectable — no other changes needed.
 */
export function filePack(id: string, label: (d: Dict) => string, basePath: string): VoicePack {
  return {
    id,
    label,
    play: (step) => {
      const a = new Audio(`${basePath}/${step}.mp3`);
      a.play().catch(() => beepStep(step)); // fall back to beeps if the file is missing
    },
  };
}

export const VOICE_PACKS: VoicePack[] = [
  {
    id: "voice-zh",
    label: (d) => d.battle.voiceZh,
    play: (step) => {
      beepStep(step);
      speak(ZH_STEPS[step], step === "go" ? "en-US" : "zh-CN", 1.15);
    },
  },
  {
    id: "voice-en",
    label: (d) => d.battle.voiceEn,
    play: (step) => {
      beepStep(step);
      speak(EN_STEPS[step], "en-US", 1.15);
    },
  },
  { id: "beep", label: (d) => d.battle.voiceBeep, play: beepStep },
  { id: "mute", label: (d) => d.battle.voiceMute, play: () => {} },
];

export function loadVoicePackId(): string {
  if (typeof window === "undefined") return VOICE_PACKS[0].id;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return VOICE_PACKS.some((p) => p.id === saved) ? (saved as string) : VOICE_PACKS[0].id;
}

export function saveVoicePackId(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
}

export function getVoicePack(id: string): VoicePack {
  return VOICE_PACKS.find((p) => p.id === id) ?? VOICE_PACKS[0];
}

/** Warm up speech synthesis voice list (some browsers load it async). */
export function warmVoices() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
  }
}
