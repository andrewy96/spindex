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
    "0123456789:★+…spindex",
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

  /* chips row — format / stars / first-to */
  const chips: { text: string; color: string }[] = [
    { text: data.formatLabel, color: THEME.accent2 },
    { text: `★${data.stars}`, color: THEME.bal },
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
  place: "1st" | "2nd" | "3rd-4th";
  name: string;
  playerCode: string;
}

export interface PodiumCardData {
  tournamentName: string;
  dateLabel: string;
  entries: PodiumCardEntry[];
  url: string;
}

export function podiumSampleText(d: PodiumCardData): string {
  return [
    "PODIUM",
    d.tournamentName,
    d.dateLabel,
    d.url,
    ...d.entries.flatMap((e) => [e.place, e.name, e.playerCode]),
  ].join(" ");
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
  ctx.font = `${medalSize}px sans-serif`;
  ctx.fillText(medal, CARD_W / 2, y);

  ctx.font = `700 26px ${display}`;
  ctx.fillStyle = labelColor;
  drawTracked(ctx, entry.place.toUpperCase() + " PLACE", CARD_W / 2, y + 44, 5);

  const fitSize = fitFontSize(ctx, entry.name, 900, display, nameSize, 900);
  ctx.font = `900 ${fitSize}px ${display}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText(entry.name, CARD_W / 2, y + 44 + fitSize * 0.86);

  ctx.font = `400 26px ${body}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText(entry.playerCode, CARD_W / 2, y + 44 + fitSize * 0.86 + 38);
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

  const { display, body } = drawCardChrome(ctx, seed);

  /* header */
  const headerSize = fitFontSize(ctx, "PODIUM", 900, display, 92, 880, 0.16);
  ctx.font = `900 ${headerSize}px ${display}`;
  ctx.fillStyle = THEME.accent;
  ctx.shadowColor = THEME.accent;
  ctx.shadowBlur = 44;
  drawTracked(ctx, "PODIUM", CARD_W / 2, 172, headerSize * 0.16);
  drawTracked(ctx, "PODIUM", CARD_W / 2, 172, headerSize * 0.16);
  ctx.shadowBlur = 0;

  const nameSize = fitFontSize(ctx, data.tournamentName, 700, display, 40, 880);
  ctx.font = `700 ${nameSize}px ${display}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText(data.tournamentName, CARD_W / 2, 224);

  ctx.font = `400 27px ${body}`;
  ctx.fillStyle = THEME.inkDim;
  ctx.fillText(data.dateLabel, CARD_W / 2, 264);

  const first = data.entries.find((e) => e.place === "1st");
  const second = data.entries.find((e) => e.place === "2nd");
  const thirdFourth = data.entries.filter((e) => e.place === "3rd-4th");

  if (first) {
    drawPodiumPlace(ctx, first, "🥇", 380, 140, THEME.accent, 90, display, body);
  }
  if (second) {
    drawPodiumPlace(ctx, second, "🥈", 660, 100, THEME.accent2, 66, display, body);
  }
  if (thirdFourth.length > 0) {
    ctx.font = `88px sans-serif`;
    ctx.fillText("🥉", CARD_W / 2, 900);
    ctx.font = `700 24px ${display}`;
    ctx.fillStyle = THEME.bal;
    drawTracked(ctx, "3RD-4TH PLACE", CARD_W / 2, 940, 5);

    const cols = thirdFourth.length === 2 ? [300, 780] : [CARD_W / 2];
    thirdFourth.forEach((entry, i) => {
      const x = cols[i] ?? CARD_W / 2;
      const size = fitFontSize(ctx, entry.name, 700, display, 46, 400);
      ctx.font = `700 ${size}px ${display}`;
      ctx.fillStyle = THEME.ink;
      ctx.fillText(entry.name, x, 1000);

      ctx.font = `400 24px ${body}`;
      ctx.fillStyle = THEME.inkDim;
      ctx.fillText(entry.playerCode, x, 1032);
    });
  }

  drawCardFooter(ctx, data.url, display, body);
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

export function canvasToPngFile(canvas: HTMLCanvasElement, fileId: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas.toBlob returned null"));
        return;
      }
      resolve(
        new File([blob], `spindex-battle-${fileId.slice(0, 8)}.png`, { type: "image/png" }),
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
