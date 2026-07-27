"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Locale } from "@/i18n";
import { CommunityTournament, supabase, TOURNAMENT_SELECT } from "@/lib/supabase";
import { beyliveFormatLabel, beyliveStatusLabel, beyliveTeamCode, beyliveTeamName } from "@/lib/beylive";
import { profileDisplayName } from "@/lib/profileName";

function fmtWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BeyliveHubClient({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<CommunityTournament[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .in("status", ["open", "started", "completed"])
      .order("starts_at", { ascending: true })
      .limit(80);
    setItems(((data as unknown as CommunityTournament[]) ?? []).filter((item) => item.live_enabled || item.status !== "open"));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("beylive-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, load)
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [load]);

  if (!supabase) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">Supabase is not configured.</div>;
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">Loading BEYLIVE...</p>;

  return (
    <section className="mt-6">
      {items.length === 0 ? (
        <div className="panel p-8 text-center">
          <div className="font-display text-sm font-bold tracking-wider text-ink">No BEYLIVE tournaments yet</div>
          <p className="mt-1 text-sm text-ink-dim">Start BEYLIVE from any tournament control page.</p>
          <Link href={`/${locale}/tournaments`} className="clip-x mt-4 inline-block bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
            Open tournaments
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="panel flex flex-col gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{item.name}</div>
                  <div className="mt-0.5 text-xs text-ink-dim">
                    {item.city} · {item.venue} · {fmtWhen(item.starts_at, locale)}
                  </div>
                  <div className="mt-1 text-xs text-ink-dim">
                    Host: {profileDisplayName(item.host_profile)}
                  </div>
                </div>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {beyliveStatusLabel(item.status)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <span className="rounded bg-panel px-2 py-0.5 text-accent-2">{beyliveFormatLabel(item.format)}</span>
                <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">Round {item.current_round ?? "-"}</span>
                <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">First to {item.target_score}</span>
                {item.stream_enabled && item.stream_url && (
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">Stream</span>
                )}
              </div>
              {(item.winner_team || item.winner_profile) && (
                <div className="rounded bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
                  Champion: {item.winner_team ? `${beyliveTeamCode(item.winner_team)} ${beyliveTeamName(item.winner_team)}` : profileDisplayName(item.winner_profile)}
                </div>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/${locale}/tournaments/${item.id}/live`} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
                  Watch BEYLIVE
                </Link>
                <Link href={`/${locale}/tournaments/${item.id}/control`} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60">
                  Control
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
