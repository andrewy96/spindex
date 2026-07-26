"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dict } from "@/i18n";
import {
  CARD_H,
  CARD_W,
  ShareCardData,
  canvasToPngFile,
  ensureFonts,
  ensureLogoImage,
  renderShareCard,
  shareSampleText,
} from "@/lib/shareCard";

export default function ShareMatchModal({
  data,
  fileId,
  dict,
  onClose,
}: {
  data: ShareCardData;
  fileId: string;
  dict: Dict;
  onClose: () => void;
}) {
  /* snapshot the card data at mount — the modal renders one result */
  const [card] = useState(data);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [file, setFile] = useState<File | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFile(null);
    (async () => {
      await Promise.all([ensureFonts(shareSampleText(card)), ensureLogoImage()]);
      if (cancelled) return;
      renderShareCard(canvas, card, seed);
      try {
        const f = await canvasToPngFile(canvas, fileId);
        if (cancelled) return;
        setFile(f);
        setCanShare(
          typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [f] }),
        );
      } catch {
        /* leave buttons disabled; preview still visible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card, seed, fileId]);

  const download = useCallback(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast(dict.battle.imageSaved);
  }, [file, dict, showToast]);

  /* file is pre-generated so navigator.share fires synchronously inside the tap
     (iOS Safari drops the share sheet if the user gesture has to await work) */
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: "SPINDEX",
        text: `${card.labels.header} · ${card.p1Name} ${card.p1Score}:${card.p2Score} ${card.p2Name}`,
      });
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      download();
      showToast(dict.battle.shareFailed);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel thin-scroll max-h-[92vh] w-full max-w-sm overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold tracking-wider">
            {dict.battle.shareTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-xs text-ink-dim transition hover:text-ink"
          >
            ✕ {dict.battle.close}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-edge">
          <canvas
            ref={canvasRef}
            width={CARD_W}
            height={CARD_H}
            className="block h-auto w-full"
          />
          {!file && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60 text-xs text-ink-dim">
              {dict.battle.generating}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setSeed(Math.floor(Math.random() * 0x7fffffff))}
            className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider transition hover:border-accent-2/60 hover:text-accent-2"
          >
            🎲 {dict.battle.shuffleDesign}
          </button>
          <button
            onClick={download}
            disabled={!file}
            className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider transition enabled:hover:border-accent/60 enabled:hover:text-accent disabled:opacity-40"
          >
            ⬇ {dict.battle.download}
          </button>
          {canShare && (
            <button
              onClick={share}
              disabled={!file}
              className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
            >
              ⤴ {dict.battle.shareImage}
            </button>
          )}
        </div>

        {toast && (
          <p className="mt-2 text-center text-xs font-semibold text-accent">{toast}</p>
        )}
      </div>
    </div>
  );
}
