"use client";

import { useEffect, useRef, useState } from "react";
import { Dict } from "@/i18n";
import { AvatarImage, encodeAvatarCrop, shrinkAvatar } from "@/lib/avatar";

/**
 * Side of the round preview, in CSS pixels. Fits a 320px-wide phone.
 * The mask is `box-content` so this is the exact area the crop maths uses.
 */
const VIEW = 248;
const MAX_ZOOM = 3;

type Offset = { x: number; y: number };

/**
 * Lets the blader drag and zoom the picture inside the round mask before it is
 * stored, so the automatic centre crop never decides the framing for them.
 */
export default function AvatarCropper({
  file,
  dict,
  onCancel,
  onDone,
}: {
  file: File;
  dict: Dict;
  onCancel: () => void;
  onDone: (image: AvatarImage) => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ startX: number; startY: number; from: Offset } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    let stale = false;
    let loaded: ImageBitmap | null = null;

    (async () => {
      if (typeof createImageBitmap !== "function") {
        // No canvas pipeline — fall straight through to the centre crop.
        onDone(await shrinkAvatar(file));
        return;
      }
      try {
        loaded = await createImageBitmap(file);
      } catch {
        onDone(await shrinkAvatar(file));
        return;
      }
      if (stale) {
        loaded.close();
        return;
      }
      const scale = VIEW / Math.min(loaded.width, loaded.height);
      setBitmap(loaded);
      setOffset({
        x: (VIEW - loaded.width * scale) / 2,
        y: (VIEW - loaded.height * scale) / 2,
      });
    })();

    return () => {
      stale = true;
      loaded?.close();
      URL.revokeObjectURL(objectUrl);
    };
    // The cropper is mounted per picked file; re-running on a new onDone would
    // reload the bitmap and throw away the framing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const scale = bitmap ? (VIEW / Math.min(bitmap.width, bitmap.height)) * zoom : 1;
  const width = bitmap ? bitmap.width * scale : 0;
  const height = bitmap ? bitmap.height * scale : 0;

  /** Keep the picture covering the mask — no empty corners. */
  const clamp = (next: Offset, w = width, h = height): Offset => ({
    x: Math.min(0, Math.max(VIEW - w, next.x)),
    y: Math.min(0, Math.max(VIEW - h, next.y)),
  });

  const changeZoom = (next: number) => {
    if (!bitmap) return;
    const base = VIEW / Math.min(bitmap.width, bitmap.height);
    const after = base * next;
    // Hold whatever sits at the centre of the mask still while zooming.
    const centreX = (VIEW / 2 - offset.x) / scale;
    const centreY = (VIEW / 2 - offset.y) / scale;
    setZoom(next);
    setOffset(
      clamp(
        { x: VIEW / 2 - centreX * after, y: VIEW / 2 - centreY * after },
        bitmap.width * after,
        bitmap.height * after
      )
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!bitmap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, from: offset };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOffset(
      clamp({ x: d.from.x + (e.clientX - d.startX), y: d.from.y + (e.clientY - d.startY) })
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  const apply = async () => {
    if (!bitmap) return;
    setBusy(true);
    const image = await encodeAvatarCrop(
      bitmap,
      -offset.x / scale,
      -offset.y / scale,
      VIEW / scale
    );
    setBusy(false);
    onDone(image ?? (await shrinkAvatar(file)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4">
      <div className="panel w-full max-w-sm p-5">
        <h3 className="font-display text-base font-bold tracking-wide">
          {dict.profile.repositionTitle}
        </h3>
        <p className="mt-1 text-xs text-ink-dim">{dict.profile.repositionHint}</p>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ width: VIEW, height: VIEW }}
          className="relative mx-auto mt-4 box-content touch-none overflow-hidden rounded-full border border-accent/40 bg-panel"
        >
          {url && bitmap && (
            <img
              src={url}
              alt=""
              draggable={false}
              style={{
                width,
                height,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
              className="max-w-none cursor-grab select-none active:cursor-grabbing"
            />
          )}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold text-ink-dim">
            {dict.profile.zoom}
          </span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            disabled={!bitmap}
            className="w-full accent-[var(--color-accent)]"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={!bitmap || busy}
            className="clip-x flex-1 bg-accent px-4 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {dict.profile.repositionApply}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="clip-x border border-edge bg-panel px-4 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition enabled:hover:text-accent disabled:opacity-50"
          >
            {dict.profile.repositionCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
