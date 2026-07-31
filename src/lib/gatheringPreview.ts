import { Gathering, supabase } from "./supabase";
import { Locale } from "@/i18n";

/** The columns a share preview needs — no member rows, no profile joins. */
const PREVIEW_SELECT =
  "id, title, city, venue, gather_at, fee_type, fee_amount, capacity, status";

export type GatheringPreview = Pick<
  Gathering,
  "id" | "title" | "city" | "venue" | "gather_at" | "fee_type" | "fee_amount" | "capacity" | "status"
>;

export async function loadGatheringPreview(id: string): Promise<GatheringPreview | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("gatherings")
    .select(PREVIEW_SELECT)
    .eq("id", id)
    .maybeSingle();
  return (data as GatheringPreview | null) ?? null;
}

export function previewWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export function previewFee(g: GatheringPreview, freeLabel: string) {
  return g.fee_type === "free" ? freeLabel : `RM ${Number(g.fee_amount ?? 0).toFixed(2)}`;
}
