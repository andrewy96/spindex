"use client";

import { useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export default function BeyliveScanner({
  onScan,
}: {
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "scanning" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStatus("idle");
  };

  const start = async () => {
    if (!videoRef.current) return;
    setStatus("loading");
    setMessage(null);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (!result) return;
          const value = result.getText();
          onScan(value);
          setManual(value);
          setMessage("Scanned");
          stop();
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch {
      setStatus("error");
      setMessage("Camera scanning needs HTTPS or localhost, and camera permission. Use manual ID if it is blocked.");
    }
  };

  const submitManual = () => {
    const value = manual.trim();
    if (!value) return;
    onScan(value);
  };

  return (
    <div className="rounded-md border border-edge bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-display text-xs font-bold tracking-wider text-ink">Phone camera scan</div>
          <p className="mt-0.5 text-[11px] text-ink-dim">Scan a BEYLIVE QR or type the player/team ID.</p>
        </div>
        {status === "scanning" ? (
          <button
            type="button"
            onClick={stop}
            className="rounded border border-edge px-2 py-1 text-xs text-ink-dim transition hover:text-ink"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={status === "loading"}
            className="rounded bg-accent px-2 py-1 text-xs font-bold text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {status === "loading" ? "Opening..." : "Scan"}
          </button>
        )}
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        className={`mb-2 aspect-video w-full rounded bg-bg object-cover ${status === "scanning" ? "block" : "hidden"}`}
      />

      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder="T01, SPX-0001, or @handle"
          className="min-w-0 flex-1 rounded-md border border-edge bg-bg px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent"
        />
        <button
          type="button"
          onClick={submitManual}
          className="rounded-md border border-edge bg-panel-2 px-3 py-2 text-xs font-bold text-accent transition hover:border-accent/60"
        >
          Find
        </button>
      </div>

      {message && <p className={`mt-2 text-[11px] ${status === "error" ? "text-atk" : "text-accent"}`}>{message}</p>}
    </div>
  );
}
