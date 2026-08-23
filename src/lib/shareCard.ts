import { Dict, Locale } from "@/i18n";
import { Finish, Match, Round } from "./supabase";
import { profileDisplayName } from "./profileName";

/** Canvas renderer for the shareable battle-result card (1080×1350, IG 4:5). */

export const CARD_W = 1080;
export const CARD_H = 1350;

/* Keep in sync with the @theme block in src/app/globals.css */
const THEME = {
  bg: "#06080b",
  panel: "#0c1117",
  edge: "#1d2733",
  ink: "#e8eef4",
  inkDim: "#8b98a8",
  accent: "#00e58f",
  accent2: "#38d9ff",
  atk: "#ff5252",
  def: "#4a90ff",
  sta: "#2fd575",
  bal: "#ffb020",
  spc: "#b06bff",
};

const FINISH_COLOR: Record<Finish, string> = {
  spin: THEME.sta,
  over: THEME.def,
  burst: THEME.spc,
  xtreme: THEME.atk,
};

export type ShareOutcome = "victory" | "defeat" | "neutral";

export interface ShareCardData {
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winnerSide: 1 | 2;
  outcome: ShareOutcome;
  rounds: Round[];
  dateLabel: string;
  formatLabel: string;
  stars: number;
  firstToLabel: string;
  locale: Locale;
  labels: {
    header: string;
    winner: string;
    finish: Record<Finish, string>;
    url: string;
  };
}

/* ---------- small utilities ---------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* next/font obfuscates family names — read the real ones off the <html> vars. */
function fontVar(name: string): string {
  if (typeof document === "undefined") return "sans-serif";
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || "sans-serif";
}

function displayFamily(): string {
  return `${fontVar("--font-orbitron")}, ${fontVar("--font-noto-sc")}, sans-serif`;
}

function bodyFamily(): string {
  return `${fontVar("--font-noto-sc")}, sans-serif`;
}

/** Everything the card will draw — passed to document.fonts.load so the right CJK slices arrive. */
export function shareSampleText(d: ShareCardData): string {
  return [
    d.labels.header,
    d.labels.winner,
    d.p1Name,
    d.p2Name,
    d.dateLabel,
    d.formatLabel,
    d.firstToLabel,
    Object.values(d.labels.finish).join(""),
    d.labels.url,
    "0123456789:pts+…spindex",
  ].join(" ");
}

export async function ensureFonts(sampleText: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const display = displayFamily();
  const body = bodyFamily();
  try {
    await Promise.all([
      document.fonts.load(`700 100px ${display}`, sampleText),
      document.fonts.load(`900 100px ${display}`, sampleText),
      document.fonts.load(`400 100px ${body}`, sampleText),
      document.fonts.load(`700 100px ${body}`, sampleText),
    ]);
  } catch {
    /* draw with whatever is available */
  }
}

let logoImage: HTMLImageElement | null | undefined;

/** Preloads the wordmark PNG so the sync canvas render can draw it directly. */
export async function ensureLogoImage(): Promise<void> {
  if (typeof window === "undefined" || logoImage !== undefined) return;
  try {
    const img = new window.Image();
    img.src = "/brand/spindex-wordmark.png";
    await img.decode();
    logoImage = img;
  } catch {
    logoImage = null; /* fall back to the drawn wordmark */
  }
}

function measureTracked(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return Math.max(0, w - track);
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  track: number,
): void {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - measureTracked(ctx, text, track) / 2;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + track;
  }
  ctx.textAlign = prevAlign;
}

/** Largest font size (stepping down from start) whose tracked width fits maxWidth. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  family: string,
  start: number,
  maxWidth: number,
  trackEm = 0,
): number {
  let size = start;
  while (size > 14) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (measureTracked(ctx, text, size * trackEm) <= maxWidth) break;
    size -= 4;
  }
  return size;
}

function truncate(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/* ---------- design variants ---------- */

interface DesignVariant {
  id: string;
  accent: string;
  paint: (ctx: CanvasRenderingContext2D, rng: () => number) => void;
}

function paintGlow(ctx: CanvasRenderingContext2D, color: string, alpha: number) {
  const g = ctx.createRadialGradient(CARD_W / 2, 470, 0, CARD_W / 2, 470, 640);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

export const VARIANTS: DesignVariant[] = [
  {
    id: "grid",
    accent: THEME.accent,
    paint(ctx, rng) {
      const cell = 60;
      const off = Math.floor(rng() * cell);
      ctx.strokeStyle = rgba(THEME.accent2, 0.07);
      ctx.lineWidth = 1;
      for (let x = -off; x <= CARD_W; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CARD_H);
        ctx.stroke();
      }
      for (let y = -off; y <= CARD_H; y += cell) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CARD_W, y);
        ctx.stroke();
      }
      paintGlow(ctx, THEME.accent, 0.1);
    },
  },
  {
    id: "speed",
    accent: THEME.accent2,
    paint(ctx, rng) {
      ctx.lineCap = "round";
      const n = 26 + Math.floor(rng() * 10);
      for (let i = 0; i < n; i++) {
        const x = rng() * (CARD_W + 600) - 300;
        const y = rng() * CARD_H;
        const len = 200 + rng() * 520;
        const grad = ctx.createLinearGradient(x, y, x + len, y - len);
        grad.addColorStop(0, rgba(THEME.accent2, 0));
        grad.addColorStop(0.5, rgba(THEME.accent2, 0.05 + rng() * 0.16));
        grad.addColorStop(1, rgba(THEME.accent2, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2 + rng() * 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y - len);
        ctx.stroke();
      }
      paintGlow(ctx, THEME.accent2, 0.08);
    },
  },
  {
    id: "burst",
    accent: THEME.spc,
    paint(ctx, rng) {
      const cx = CARD_W / 2;
      const cy = 460;
      const rays = 22 + Math.floor(rng() * 10);
      const base = rng() * Math.PI;
      for (let i = 0; i < rays; i++) {
        const ang = base + (i / rays) * Math.PI * 2;
        const half = 0.012 + rng() * 0.02;
        const r = 1700;
        ctx.fillStyle = rgba(THEME.spc, 0.03 + rng() * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang - half) * r, cy + Math.sin(ang - half) * r);
        ctx.lineTo(cx + Math.cos(ang + half) * r, cy + Math.sin(ang + half) * r);
        ctx.closePath();
        ctx.fill();
      }
      paintGlow(ctx, THEME.spc, 0.1);
    },
  },
  {
    id: "hex",
    accent: THEME.atk,
    paint(ctx, rng) {
      const r = 56;
      const offX = rng() * r;
      const offY = rng() * r;
      ctx.strokeStyle = rgba(THEME.atk, 0.09);
      ctx.lineWidth = 1.5;
      const h = Math.sin(Math.PI / 3) * r;
      for (let row = -1; row * h * 2 < CARD_H + r * 2; row++) {
        for (let col = -1; col * r * 3 < CARD_W + r * 3; col++) {
          const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0) - offX;
          const cy = row * h - offY;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i + Math.PI / 6;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      paintGlow(ctx, THEME.atk, 0.08);
    },
  },
  {
    id: "scanline",
    accent: THEME.bal,
    paint(ctx, rng) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      for (let y = 0; y < CARD_H; y += 7) ctx.fillRect(0, y, CARD_W, 2);
      ctx.save();
      ctx.translate(CARD_W / 2 + (rng() - 0.5) * 260, 620 + (rng() - 0.5) * 200);
      ctx.rotate((rng() - 0.5) * 0.3);
      ctx.font = `900 980px ${displayFamily()}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(THEME.bal, 0.07);
      ctx.fillText("X", 0, 0);
      ctx.restore();
      paintGlow(ctx, THEME.bal, 0.06);
    },
  },
];

/* ---------- shared chrome (background / frame / footer) ---------- */

/** Background, vignette, and notched frame shared by every card variant. */
function drawCardChrome(ctx: CanvasRenderingContext2D, seed: number) {
  const rng = mulberry32(seed);
  const variant = VARIANTS[Math.floor(rng() * VARIANTS.length)];
  const display = displayFamily();
  const body = bodyFamily();

  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  variant.paint(ctx, rng);

  const vg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  vg.addColorStop(0, "rgba(0,0,0,0.34)");
  vg.addColorStop(0.22, "rgba(0,0,0,0)");
  vg.addColorStop(0.78, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  /* frame with clip-x notched corner (mirrors .clip-x in globals.css) */
  const inset = 28;
  const notch = 46;
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(CARD_W - inset, inset);
  ctx.lineTo(CARD_W - inset, CARD_H - inset - notch);
  ctx.lineTo(CARD_W - inset - notch, CARD_H - inset);
  ctx.lineTo(inset, CARD_H - inset);
  ctx.closePath();
  ctx.strokeStyle = rgba(variant.accent, 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  return { rng, variant, display, body };
}

/** Watermark footer (wordmark + site URL) shared by every card variant. */
function drawCardFooter(ctx: CanvasRenderingContext2D, url: string, display: string, body: string) {
  ctx.strokeStyle = THEME.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 1196);
  ctx.lineTo(CARD_W - 72, 1196);
  ctx.stroke();

  if (logoImage) {
    const logoH = 110;
    const logoW = logoH * (logoImage.width / logoImage.height);
    ctx.drawImage(logoImage, CARD_W / 2 - logoW / 2, 1218, logoW, logoH);
  } else {
    ctx.font = `900 72px ${display}`;
    const track = 2;
    const word = "spindex";
    let cursor = CARD_W / 2 - measureTracked(ctx, word, track) / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    for (const ch of word) {
      ctx.fillStyle = ch === "p" ? THEME.accent : THEME.ink;
      ctx.shadowColor = ch === "p" ? THEME.accent : "transparent";
      ctx.shadowBlur = ch === "p" ? 16 : 0;
      ctx.fillText(ch, cursor, 1278);
      cursor += ctx.measureText(ch).width + track;
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = prevAlign;
  }

  ctx.font = `400 27px ${body}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText(url, CARD_W / 2, 1322);
}

/* ---------- main renderer ---------- */

export function renderShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  seed: number,
): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { display, body } = drawCardChrome(ctx, seed);
  const outcomeColor =
    data.outcome === "victory"
      ? THEME.accent
      : data.outcome === "defeat"
        ? THEME.atk
        : THEME.accent2;

  /* header — outcome word with neon glow */
  const headerSize = fitFontSize(ctx, data.labels.header, 900, display, 92, 880, 0.16);
  ctx.font = `900 ${headerSize}px ${display}`;
  ctx.fillStyle = outcomeColor;
  ctx.shadowColor = outcomeColor;
  ctx.shadowBlur = 44;
  drawTracked(ctx, data.labels.header, CARD_W / 2, 172, headerSize * 0.16);
  drawTracked(ctx, data.labels.header, CARD_W / 2, 172, headerSize * 0.16);
  ctx.shadowBlur = 0;

  ctx.font = `400 30px ${body}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText(data.dateLabel, CARD_W / 2, 232);

  /* score block — two columns */
  const cols: { x: number; name: string; score: number; side: 1 | 2 }[] = [
    { x: 300, name: data.p1Name, score: data.p1Score, side: 1 },
    { x: 780, name: data.p2Name, score: data.p2Score, side: 2 },
  ];
  ctx.font = `900 150px ${display}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText(":", CARD_W / 2, 520);
  for (const c of cols) {
    const won = c.side === data.winnerSide;
    ctx.font = `900 230px ${display}`;
    ctx.fillStyle = won ? THEME.accent : THEME.ink;
    if (won) {
      ctx.shadowColor = THEME.accent;
      ctx.shadowBlur = 60;
    }
    ctx.fillText(String(c.score), c.x, 560);
    ctx.shadowBlur = 0;

    const nameSize = fitFontSize(ctx, c.name, 700, display, 46, 400);
    ctx.font = `700 ${nameSize}px ${display}`;
    ctx.fillStyle = won ? THEME.accent : THEME.ink;
    ctx.fillText(c.name, c.x, 660);

    if (won) {
      ctx.font = `700 26px ${display}`;
      ctx.fillStyle = THEME.accent;
      drawTracked(ctx, `🏆 ${data.labels.winner}`, c.x, 712, 6);
    }
  }

  /* chips row — format / points / first-to */
  const chips: { text: string; color: string }[] = [
    { text: data.formatLabel, color: THEME.accent2 },
    { text: `${data.stars} pts`, color: THEME.bal },
    { text: data.firstToLabel, color: THEME.inkDim },
  ];
  drawChipRow(ctx, chips, 790, 30, display);

  /* round-by-round breakdown */
  if (data.rounds.length > 0) {
    const MAX_CHIPS = 16;
    const shown = data.rounds.slice(0, MAX_CHIPS);
    const roundChips = shown.map((r) => ({
      text: `${truncate(r.side === 1 ? data.p1Name : data.p2Name, 10)} ${data.labels.finish[r.finish]} +${r.pts}`,
      color: FINISH_COLOR[r.finish],
    }));
    if (data.rounds.length > MAX_CHIPS) {
      roundChips.push({ text: `+${data.rounds.length - MAX_CHIPS}`, color: THEME.inkDim });
    }
    drawChipWrap(ctx, roundChips, 880, 1150, 25, display);
  }

  drawCardFooter(ctx, data.labels.url, display, body);
}

/* ---------- podium card ---------- */

export interface PodiumCardEntry {
  place: "1st" | "2nd" | "3rd" | "4th" | "5th" | "3rd-4th";
  name: string;
  playerCode: string;
}

export interface PodiumCardData {
  tournamentName: string;
  dateLabel: string;
  venueLabel?: string;
  participantsLabel?: string;
  entries: PodiumCardEntry[];
  url: string;
}

export function podiumSampleText(d: PodiumCardData): string {
  return [
    "PODIUM",
    d.tournamentName,
    d.dateLabel,
    d.venueLabel ?? "",
    d.participantsLabel ?? "",
    d.url,
    "SHARE YOUR VICTORY PODIUM RESULTS SPIN BATTLE RISE ONE PLATFORM ALL BLADERS",
    ...d.entries.flatMap((e) => [e.place, e.name, e.playerCode]),
  ].join(" ");
}

const PODIUM_THEME = {
  green: "#00ff7a",
  gold: "#ffd34d",
  silver: "#cfe9ff",
  bronze: "#f4a45d",
  white: "#f5f7f4",
};

function drawPodiumNotchedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  n = 22,
): void {
  ctx.beginPath();
  ctx.moveTo(x + n, y);
  ctx.lineTo(x + w - n, y);
  ctx.lineTo(x + w, y + n);
  ctx.lineTo(x + w, y + h - n);
  ctx.lineTo(x + w - n, y + h);
  ctx.lineTo(x + n, y + h);
  ctx.lineTo(x, y + h - n);
  ctx.lineTo(x, y + n);
  ctx.closePath();
}

function drawPodiumHexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (Math.PI * 2 * i) / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function podiumPlaceLabel(place: PodiumCardEntry["place"]): string {
  if (place === "3rd-4th") return "3RD-4TH PLACE";
  return `${place.toUpperCase()} PLACE`;
}

function drawPodiumStreaks(ctx: CanvasRenderingContext2D, rng: () => number): void {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = side > 0 ? CARD_W - 40 - rng() * 240 : 40 + rng() * 240;
    const y = 120 + rng() * 1000;
    const len = 28 + rng() * 130;
    ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.06 + rng() * 0.16);
    ctx.lineWidth = 1 + rng() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * len, y - 40 - rng() * 80);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPodiumFrame(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.7);
  ctx.lineWidth = 2;
  drawPodiumNotchedPath(ctx, 18, 18, CARD_W - 36, CARD_H - 36, 34);
  ctx.stroke();

  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.32);
  ctx.lineWidth = 1;
  drawPodiumNotchedPath(ctx, 34, 34, CARD_W - 68, CARD_H - 68, 28);
  ctx.stroke();

  for (const [x, y, w] of [
    [190, 18, 185],
    [CARD_W - 372, 18, 185],
    [76, CARD_H - 42, 262],
    [CARD_W - 338, CARD_H - 42, 262],
  ]) {
    ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.48);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPodiumChrome(ctx: CanvasRenderingContext2D, seed: number) {
  const rng = mulberry32(seed);
  const display = displayFamily();
  const body = bodyFamily();

  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#020504");
  bg.addColorStop(0.45, "#06100d");
  bg.addColorStop(1, "#020303");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const centerGlow = ctx.createRadialGradient(CARD_W / 2, 560, 0, CARD_W / 2, 560, 720);
  centerGlow.addColorStop(0, rgba(PODIUM_THEME.green, 0.11));
  centerGlow.addColorStop(0.55, rgba(PODIUM_THEME.green, 0.03));
  centerGlow.addColorStop(1, rgba(PODIUM_THEME.green, 0));
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const floorGlow = ctx.createRadialGradient(835, 1118, 0, 835, 1118, 420);
  floorGlow.addColorStop(0, rgba(PODIUM_THEME.green, 0.28));
  floorGlow.addColorStop(0.34, rgba(PODIUM_THEME.green, 0.1));
  floorGlow.addColorStop(1, rgba(PODIUM_THEME.green, 0));
  ctx.fillStyle = floorGlow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawPodiumStreaks(ctx, rng);

  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.07);
  ctx.lineWidth = 1;
  for (let x = 60; x < CARD_W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 90);
    ctx.lineTo(x - 260, CARD_H - 60);
    ctx.stroke();
  }

  drawPodiumFrame(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  return { rng, display, body };
}

function drawPodiumLogo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, display: string): void {
  drawPodiumNotchedPath(ctx, x, y, w, h, 24);
  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.fill();
  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();

  if (logoImage) {
    const logoH = h * 0.72;
    const logoW = Math.min(w * 0.78, logoH * (logoImage.width / logoImage.height));
    ctx.drawImage(logoImage, x + w / 2 - logoW / 2, y + h / 2 - logoH / 2, logoW, logoH);
    return;
  }

  ctx.font = `900 44px ${display}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText("SPINDEX", x + w / 2, y + h / 2 + 14);
  ctx.fillStyle = PODIUM_THEME.green;
  ctx.fillText("X", x + w / 2 + 112, y + h / 2 + 14);
}

function drawPodiumTitle(ctx: CanvasRenderingContext2D, display: string): void {
  ctx.font = `700 22px ${display}`;
  ctx.fillStyle = THEME.ink;
  drawTrackedFrom(ctx, "SHARE YOUR", 56, 66, 5);
  drawTrackedFrom(ctx, "VICTORY", 56, 100, 7);

  ctx.textAlign = "right";
  ctx.font = `900 24px ${display}`;
  ctx.fillStyle = PODIUM_THEME.green;
  ctx.fillText("#SPINDEX", CARD_W - 56, 70);
  ctx.font = `700 21px ${display}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText("SPIN.", CARD_W - 56, 112);
  ctx.fillText("BATTLE.", CARD_W - 56, 150);
  ctx.fillText("RISE.", CARD_W - 56, 188);
  ctx.textAlign = "center";

  drawPodiumLogo(ctx, 386, 24, 308, 78, display);

  const title = "PODIUM";
  const titleSize = fitFontSize(ctx, title, 900, display, 112, 700, 0.02);
  ctx.font = `italic 900 ${titleSize}px ${display}`;
  const titleFill = ctx.createLinearGradient(0, 130, 0, 250);
  titleFill.addColorStop(0, "#ffffff");
  titleFill.addColorStop(0.52, "#eef1ed");
  titleFill.addColorStop(1, "#9da3a7");
  ctx.shadowColor = rgba(PODIUM_THEME.green, 0.46);
  ctx.shadowBlur = 18;
  ctx.fillStyle = titleFill;
  ctx.fillText(title, CARD_W / 2, 224);
  ctx.shadowBlur = 0;

  ctx.font = `900 36px ${display}`;
  ctx.fillStyle = PODIUM_THEME.green;
  drawTracked(ctx, "RESULTS", CARD_W / 2, 284, 16);

  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.62);
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const y = 300 + i * 7;
    ctx.beginPath();
    ctx.moveTo(292 + i * 18, y);
    ctx.lineTo(430, y);
    ctx.moveTo(650, y);
    ctx.lineTo(788 - i * 18, y);
    ctx.stroke();
  }
}

function drawPodiumPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha = 0.28,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  drawPodiumNotchedPath(ctx, x, y, w, h, 22);
  const fill = ctx.createLinearGradient(x, y, x + w, y + h);
  fill.addColorStop(0, rgba(color, alpha));
  fill.addColorStop(0.52, "rgba(0,0,0,0.78)");
  fill.addColorStop(1, rgba(color, alpha * 0.42));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.86);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawPodiumNotchedPath(ctx, x + 14, y + 14, w - 28, h - 28, 16);
  ctx.strokeStyle = rgba(color, 0.22);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  drawPodiumNotchedPath(ctx, x + 12, y + 12, w - 24, h - 24, 18);
  ctx.clip();
  ctx.strokeStyle = rgba(color, 0.08);
  ctx.lineWidth = 1;
  for (let yy = y + 16; yy < y + h; yy += 42) {
    ctx.beginPath();
    ctx.moveTo(x + 12, yy);
    ctx.lineTo(x + w - 12, yy - 86);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawPodiumBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  text: string,
  display: string,
  crown = false,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;

  ctx.fillStyle = rgba(color, 0.42);
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.1, cy + 4);
  ctx.lineTo(cx - r * 2.2, cy + r * 0.45);
  ctx.lineTo(cx - r * 1.55, cy - r * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + r * 1.1, cy + 4);
  ctx.lineTo(cx + r * 2.2, cy + r * 0.45);
  ctx.lineTo(cx + r * 1.55, cy - r * 0.26);
  ctx.closePath();
  ctx.fill();

  drawPodiumHexPath(ctx, cx, cy, r);
  const fill = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.4, 0, cx, cy, r * 1.35);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(0.18, color);
  fill.addColorStop(1, "#2b2110");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = `900 ${r * 1.02}px ${display}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, cx, cy + r * 0.35);

  if (crown) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy - r - 18);
    ctx.lineTo(cx - 20, cy - r - 52);
    ctx.lineTo(cx, cy - r - 27);
    ctx.lineTo(cx + 20, cy - r - 52);
    ctx.lineTo(cx + 32, cy - r - 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawAvatar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = rgba(color, 0.9);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.34);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 13, 0.1, Math.PI * 1.75);
  ctx.stroke();

  const face = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  face.addColorStop(0, "#ffffff");
  face.addColorStop(1, "#7e858b");
  ctx.fillStyle = face;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.22, r * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.39, r * 0.48, r * 0.31, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPodiumCardSlot(
  ctx: CanvasRenderingContext2D,
  entry: PodiumCardEntry,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  badgeText: string,
  display: string,
  body: string,
  primary = false,
): void {
  drawPodiumPanel(ctx, x, y, w, h, color, primary ? 0.3 : 0.2);
  drawPodiumBadge(ctx, x + w / 2, y - (primary ? 6 : 8), primary ? 62 : 54, color, badgeText, display, primary);

  ctx.font = `900 ${primary ? 23 : 20}px ${display}`;
  ctx.fillStyle = PODIUM_THEME.green;
  drawTracked(ctx, podiumPlaceLabel(entry.place), x + w / 2, y + (primary ? 104 : 94), primary ? 4 : 3);

  const name = entry.name.toUpperCase();
  const nameSize = fitFontSize(ctx, name, 900, display, primary ? 44 : 36, w - 54);
  ctx.font = `900 ${nameSize}px ${display}`;
  ctx.fillStyle = PODIUM_THEME.white;
  ctx.shadowColor = "rgba(255,255,255,0.28)";
  ctx.shadowBlur = 8;
  ctx.fillText(name, x + w / 2, y + (primary ? 152 : 136), w - 42);
  ctx.shadowBlur = 0;

  ctx.font = `700 ${primary ? 24 : 21}px ${body}`;
  ctx.fillStyle = "rgba(224,230,235,0.82)";
  ctx.fillText(entry.playerCode.toUpperCase(), x + w / 2, y + (primary ? 190 : 172), w - 42);

  drawAvatar(ctx, x + w / 2, y + h - (primary ? 110 : 88), primary ? 88 : 70, color);
}

function drawLowerPodiumCard(
  ctx: CanvasRenderingContext2D,
  entry: PodiumCardEntry,
  x: number,
  y: number,
  w: number,
  display: string,
  body: string,
): void {
  drawPodiumPanel(ctx, x, y, w, 118, PODIUM_THEME.green, 0.13);
  drawAvatar(ctx, x + 78, y + 59, 38, PODIUM_THEME.green);

  ctx.textAlign = "left";
  ctx.font = `900 19px ${display}`;
  ctx.fillStyle = PODIUM_THEME.green;
  ctx.fillText(podiumPlaceLabel(entry.place), x + 150, y + 43);

  const name = entry.name.toUpperCase();
  const nameSize = fitFontSize(ctx, name, 900, display, 30, w - 190);
  ctx.font = `900 ${nameSize}px ${display}`;
  ctx.fillStyle = PODIUM_THEME.white;
  ctx.fillText(name, x + 150, y + 78, w - 170);

  ctx.font = `700 19px ${body}`;
  ctx.fillStyle = "rgba(224,230,235,0.68)";
  ctx.fillText(entry.playerCode.toUpperCase(), x + 150, y + 105, w - 170);
  ctx.textAlign = "center";
}

function drawInfoIcon(ctx: CanvasRenderingContext2D, kind: "event" | "venue" | "date" | "participants", x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = PODIUM_THEME.green;
  ctx.fillStyle = PODIUM_THEME.green;
  ctx.lineWidth = 4;
  if (kind === "event") {
    ctx.strokeRect(x, y + 8, 30, 30);
    ctx.beginPath();
    ctx.moveTo(x, y + 18);
    ctx.lineTo(x + 30, y + 18);
    ctx.stroke();
    ctx.fillRect(x + 6, y, 5, 12);
    ctx.fillRect(x + 20, y, 5, 12);
  } else if (kind === "venue") {
    ctx.beginPath();
    ctx.arc(x + 15, y + 15, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 15, y + 15, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 32);
    ctx.lineTo(x + 4, y + 50);
    ctx.lineTo(x + 26, y + 50);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "date") {
    ctx.beginPath();
    ctx.arc(x + 18, y + 24, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 24);
    ctx.lineTo(x + 18, y + 12);
    ctx.moveTo(x + 18, y + 24);
    ctx.lineTo(x + 30, y + 24);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x + 12, y + 18, 9, 0, Math.PI * 2);
    ctx.arc(x + 28, y + 18, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 30, 36, 18, 8);
    ctx.fill();
  }
  ctx.restore();
}

function drawInfoItem(
  ctx: CanvasRenderingContext2D,
  kind: "event" | "venue" | "date" | "participants",
  label: string,
  value: string,
  x: number,
  y: number,
  display: string,
  body: string,
  maxWidth: number,
): void {
  drawInfoIcon(ctx, kind, x, y - 20);
  ctx.textAlign = "left";
  ctx.font = `900 18px ${display}`;
  ctx.fillStyle = PODIUM_THEME.green;
  ctx.fillText(label, x + 58, y);
  const upperValue = value.toUpperCase();
  const size = fitFontSize(ctx, upperValue, 700, display, 24, maxWidth);
  ctx.font = `700 ${size}px ${body}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText(upperValue, x + 58, y + 28, maxWidth);
  ctx.textAlign = "center";
}

function drawBeybladeDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.28);
  ctx.shadowColor = PODIUM_THEME.green;
  ctx.shadowBlur = 28;
  const disc = ctx.createRadialGradient(0, 0, 8, 0, 0, 86);
  disc.addColorStop(0, "#d7ffe8");
  disc.addColorStop(0.14, PODIUM_THEME.green);
  disc.addColorStop(0.32, "#17271d");
  disc.addColorStop(0.58, "#0b0f0d");
  disc.addColorStop(1, PODIUM_THEME.green);
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.ellipse(0, 0, 112, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, 72, 25, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.95);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 42, 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPodiumInfoPanel(ctx: CanvasRenderingContext2D, data: PodiumCardData, display: string, body: string): void {
  const x = 76;
  const y = 1044;
  const w = CARD_W - 152;
  const h = 170;
  drawPodiumPanel(ctx, x, y, w, h, PODIUM_THEME.green, 0.12);

  const venue = data.venueLabel?.trim() || "Venue TBA";
  const participants = data.participantsLabel?.trim() || `${data.entries.length} players`;
  drawInfoItem(ctx, "event", "EVENT", data.tournamentName, x + 42, y + 52, display, body, 342);
  drawInfoItem(ctx, "venue", "VENUE", venue, x + 42, y + 122, display, body, 342);

  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 446, y + 30);
  ctx.lineTo(x + 446, y + h - 30);
  ctx.stroke();

  drawInfoItem(ctx, "date", "DATE", data.dateLabel, x + 502, y + 52, display, body, 300);
  drawInfoItem(ctx, "participants", "PARTICIPANTS", participants, x + 502, y + 122, display, body, 300);
}

function drawPodiumFooter(ctx: CanvasRenderingContext2D, data: PodiumCardData, display: string): void {
  const y = 1270;
  drawPodiumNotchedPath(ctx, 34, y - 36, CARD_W - 68, 78, 26);
  ctx.fillStyle = "rgba(0,0,0,0.46)";
  ctx.fill();
  ctx.strokeStyle = rgba(PODIUM_THEME.green, 0.42);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = `700 14px ${display}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText("VISIT", 60, y - 2);
  ctx.font = `900 15px ${display}`;
  ctx.fillStyle = PODIUM_THEME.green;
  ctx.fillText(data.url.toUpperCase(), 60, y + 26, 300);

  ctx.textAlign = "center";
  ctx.font = `900 21px ${display}`;
  ctx.fillStyle = THEME.ink;
  drawTracked(ctx, "ONE PLATFORM.", CARD_W / 2, y + 2, 7);
  ctx.fillStyle = PODIUM_THEME.green;
  drawTracked(ctx, "ALL BLADERS.", CARD_W / 2, y + 32, 8);

  ctx.textAlign = "left";
  ctx.font = `700 14px ${display}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText("FOLLOW US", CARD_W - 300, y - 2);
  ctx.strokeStyle = PODIUM_THEME.green;
  ctx.fillStyle = PODIUM_THEME.green;
  ["IG", "TT", "YT"].forEach((label, index) => {
    const sx = CARD_W - 300 + index * 44;
    ctx.beginPath();
    ctx.roundRect(sx, y + 8, 30, 30, 7);
    ctx.stroke();
    ctx.font = `900 10px ${display}`;
    ctx.fillText(label, sx + 7, y + 28);
  });
  ctx.font = `700 14px ${display}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText("@SPINDEX_MY", CARD_W - 156, y + 29);
  ctx.textAlign = "center";
}

function drawPodiumPlace(
  ctx: CanvasRenderingContext2D,
  entry: PodiumCardEntry,
  medal: string,
  y: number,
  medalSize: number,
  labelColor: string,
  nameSize: number,
  display: string,
  body: string,
) {
  void ctx;
  void entry;
  void medal;
  void y;
  void medalSize;
  void labelColor;
  void nameSize;
  void display;
  void body;
}

export function renderPodiumCard(
  canvas: HTMLCanvasElement,
  data: PodiumCardData,
  seed: number,
): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { display, body } = drawPodiumChrome(ctx, seed);
  drawPodiumTitle(ctx, display);

  const first = data.entries.find((e) => e.place === "1st");
  const second = data.entries.find((e) => e.place === "2nd");
  const resolvedThird = data.entries.find((e) => e.place === "3rd");
  const sharedThird = data.entries.filter((e) => e.place === "3rd-4th");
  const third = resolvedThird ?? sharedThird[0];
  const usedEntries = new Set<PodiumCardEntry>();
  const thirdFourth: PodiumCardEntry[] = [];

  if (first) {
    usedEntries.add(first);
    drawPodiumCardSlot(ctx, first, 370, 428, 340, 452, PODIUM_THEME.gold, "1", display, body, true);
    drawPodiumPlace(ctx, first, "🥇", 380, 140, THEME.accent, 90, display, body);
  }
  if (second) {
    usedEntries.add(second);
    drawPodiumCardSlot(ctx, second, 70, 522, 300, 358, PODIUM_THEME.silver, "2", display, body);
    drawPodiumPlace(ctx, second, "🥈", 660, 100, THEME.accent2, 66, display, body);
  }
  if (third) {
    usedEntries.add(third);
    drawPodiumCardSlot(ctx, third, 710, 522, 300, 358, PODIUM_THEME.bronze, "3", display, body);
  }
  if (thirdFourth.length > 0) {
    ctx.font = `88px sans-serif`;
    ctx.fillText("🥉", CARD_W / 2, 900);
    ctx.font = `700 24px ${display}`;
    ctx.fillStyle = THEME.bal;
    const sharedLabel = thirdFourth.some((entry) => entry.place === "3rd-4th");
    drawTracked(ctx, sharedLabel ? "3RD-4TH PLACE" : "PLACINGS", CARD_W / 2, 940, 5);

    const cols = thirdFourth.length === 2 ? [300, 780] : [CARD_W / 2];
    thirdFourth.forEach((entry, i) => {
      const x = cols[i] ?? CARD_W / 2;
      if (entry.place !== "3rd-4th") {
        ctx.font = `700 20px ${display}`;
        ctx.fillStyle = THEME.bal;
        drawTracked(ctx, `${entry.place.toUpperCase()} PLACE`, x, 980, 3);
      }
      const size = fitFontSize(ctx, entry.name, 700, display, 46, 400);
      ctx.font = `700 ${size}px ${display}`;
      ctx.fillStyle = THEME.ink;
      ctx.fillText(entry.name, x, entry.place === "3rd-4th" ? 1000 : 1020);

      ctx.font = `400 24px ${body}`;
      ctx.fillStyle = THEME.inkDim;
      ctx.fillText(entry.playerCode, x, entry.place === "3rd-4th" ? 1032 : 1052);
    });
  }

  const lowerEntries = data.entries.filter((entry) => !usedEntries.has(entry)).slice(0, 2);
  if (lowerEntries.length === 1) {
    drawLowerPodiumCard(ctx, lowerEntries[0], 286, 906, 508, display, body);
  } else {
    lowerEntries.forEach((entry, index) => {
      drawLowerPodiumCard(ctx, entry, index === 0 ? 76 : 548, 906, 456, display, body);
    });
  }

  drawPodiumInfoPanel(ctx, data, display, body);
  drawPodiumFooter(ctx, data, display);
}

function drawTrackedFrom(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  track: number,
): void {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
  ctx.textAlign = prevAlign;
}

/** One centered row of pill chips (12%-tint fill + full-color text, like RecordRow). */
function drawChipRow(
  ctx: CanvasRenderingContext2D,
  chips: { text: string; color: string }[],
  y: number,
  fontSize: number,
  family: string,
): void {
  const padX = 26;
  const h = fontSize * 2;
  const gap = 16;
  ctx.font = `700 ${fontSize}px ${family}`;
  const widths = chips.map((c) => ctx.measureText(c.text).width + padX * 2);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let x = CARD_W / 2 - total / 2;
  chips.forEach((c, i) => {
    ctx.fillStyle = rgba(c.color, 0.12);
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, widths[i], h, 12);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.textAlign = "center";
    ctx.fillText(c.text, x + widths[i] / 2, y + fontSize * 0.36);
    x += widths[i] + gap;
  });
}

/** Flow-wrapped chips, rows centered, stops at maxY. */
function drawChipWrap(
  ctx: CanvasRenderingContext2D,
  chips: { text: string; color: string }[],
  startY: number,
  maxY: number,
  fontSize: number,
  family: string,
): void {
  const padX = 20;
  const h = fontSize * 1.9;
  const gap = 12;
  const maxRowW = CARD_W - 120;
  ctx.font = `700 ${fontSize}px ${family}`;
  const widths = chips.map((c) => Math.min(ctx.measureText(c.text).width + padX * 2, maxRowW));

  /* group into rows */
  const rows: number[][] = [];
  let row: number[] = [];
  let rowW = 0;
  chips.forEach((_, i) => {
    const w = widths[i] + (row.length ? gap : 0);
    if (rowW + w > maxRowW && row.length) {
      rows.push(row);
      row = [i];
      rowW = widths[i];
    } else {
      row.push(i);
      rowW += w;
    }
  });
  if (row.length) rows.push(row);

  let y = startY;
  for (const r of rows) {
    if (y + h / 2 > maxY) break;
    const total = r.reduce((a, i) => a + widths[i], 0) + gap * (r.length - 1);
    let x = CARD_W / 2 - total / 2;
    for (const i of r) {
      ctx.fillStyle = rgba(chips[i].color, 0.12);
      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, widths[i], h, 10);
      ctx.fill();
      ctx.fillStyle = chips[i].color;
      ctx.textAlign = "center";
      ctx.fillText(chips[i].text, x + widths[i] / 2, y + fontSize * 0.36, widths[i] - padX);
      x += widths[i] + gap;
    }
    y += h + gap;
  }
}

/* ---------- data plumbing ---------- */

export function canvasToPngFile(
  canvas: HTMLCanvasElement,
  fileId: string,
  prefix = "spindex-battle",
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas.toBlob returned null"));
        return;
      }
      resolve(
        new File([blob], `${prefix}-${fileId.slice(0, 8)}.png`, { type: "image/png" }),
      );
    }, "image/png");
  });
}

export function shareDateLabel(date: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function finishShareLabels(dict: Dict): Record<Finish, string> {
  return {
    spin: dict.battle.finishShortSpin,
    over: dict.battle.finishShortOver,
    burst: dict.battle.finishShortBurst,
    xtreme: dict.battle.finishShortXtreme,
  };
}

export function outcomeHeader(outcome: ShareOutcome, dict: Dict): string {
  return outcome === "victory"
    ? dict.battle.victory
    : outcome === "defeat"
      ? dict.battle.defeat
      : dict.battle.battleResult;
}

export function shareSiteLabel(): string {
  return typeof window !== "undefined" ? window.location.host : "SPINDEX";
}

export function matchToShareData(
  m: Match,
  viewerId: string | null,
  locale: Locale,
  dict: Dict,
): ShareCardData {
  const outcome: ShareOutcome =
    !viewerId || (viewerId !== m.p1 && viewerId !== m.p2)
      ? "neutral"
      : viewerId === m.winner
        ? "victory"
        : "defeat";
  const format = m.format ?? "single";
  return {
    p1Name: profileDisplayName(m.p1_profile, dict.battle.player1),
    p2Name: profileDisplayName(m.p2_profile, dict.battle.player2),
    p1Score: m.p1_score,
    p2Score: m.p2_score,
    winnerSide: m.winner === m.p1 ? 1 : 2,
    outcome,
    rounds: (m.rounds ?? []) as Round[],
    dateLabel: shareDateLabel(m.created_at, locale),
    formatLabel:
      format === "team"
        ? dict.battle.teamFormat.replace(/\{count\}/g, String(m.team_size ?? 1))
        : dict.battle.singleBattle,
    stars: m.stars_moved ?? m.wager,
    firstToLabel: dict.battle.firstToPoints.replace("{points}", String(m.target_score ?? 4)),
    locale,
    labels: {
      header: outcomeHeader(outcome, dict),
      winner: dict.battle.winner,
      finish: finishShareLabels(dict),
      url: shareSiteLabel(),
    },
  };
}
