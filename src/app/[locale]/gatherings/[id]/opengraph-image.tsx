import { ImageResponse } from "next/og";
import { getDict, isLocale, Locale } from "@/i18n";
import { loadGatheringPreview, previewFee, previewWhen } from "@/lib/gatheringPreview";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SPINDEX gathering";

const BG = "#06080b";
const PANEL = "#0c1117";
const ACCENT = "#00e58f";
const INK = "#e8eef4";
const INK_DIM = "#8b98a8";

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const dict = getDict(locale);
  const gathering = await loadGatheringPreview(id);

  const title = gathering?.title ?? dict.gatherings.title;
  const when = gathering ? previewWhen(gathering.gather_at, locale) : "";
  const where = gathering ? `${gathering.venue} · ${gathering.city}` : "";
  const fee = gathering ? previewFee(gathering, dict.gatherings.free) : "";
  const cancelled = gathering?.status === "cancelled";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: ACCENT,
              color: BG,
              fontSize: 38,
              fontWeight: 900,
            }}
          >
            X
          </div>
          <div style={{ color: INK, fontSize: 34, fontWeight: 800, letterSpacing: 2 }}>
            {dict.site.name}
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              padding: "10px 22px",
              borderRadius: 999,
              background: cancelled ? "#2a1116" : "rgba(0,229,143,0.12)",
              color: cancelled ? "#ff5252" : ACCENT,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {cancelled ? dict.gatherings.cancel : dict.gatherings.title}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              color: INK,
              fontSize: title.length > 42 ? 62 : 76,
              fontWeight: 900,
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          {when && (
            <div style={{ display: "flex", color: ACCENT, fontSize: 34, fontWeight: 700 }}>
              {when}
            </div>
          )}
          {where && (
            <div style={{ display: "flex", color: INK_DIM, fontSize: 32 }}>{where}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {fee && (
            <div
              style={{
                display: "flex",
                padding: "14px 26px",
                borderRadius: 10,
                background: PANEL,
                color: INK,
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {fee}
            </div>
          )}
          {gathering?.capacity && (
            <div
              style={{
                display: "flex",
                padding: "14px 26px",
                borderRadius: 10,
                background: PANEL,
                color: INK_DIM,
                fontSize: 28,
              }}
            >
              {dict.gatherings.capacity}: {gathering.capacity}
            </div>
          )}
        </div>
      </div>
    ),
    size
  );
}
