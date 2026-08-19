"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

function streamCount(item: CommunityTournament) {
  return [
    item.stadium1_stream_enabled && item.stadium1_stream_url,
    item.stadium2_stream_enabled && item.stadium2_stream_url,
  ].filter(Boolean).length || (item.stream_enabled && item.stream_url ? 1 : 0);
}

type EventScope = "all" | "live" | "upcoming" | "past";
type EventBucket = Exclude<EventScope, "all">;

function eventBucket(item: CommunityTournament, now: number): EventBucket {
  if (item.status === "started") return "live";
  if (item.status === "completed") return "past";
  return new Date(item.starts_at).getTime() >= now ? "upcoming" : "past";
}

function eventState(item: CommunityTournament, now: number) {
  const bucket = eventBucket(item, now);
  if (bucket === "live") return { label: "Live event", className: "bg-atk/10 text-atk" };
  if (bucket === "upcoming") return { label: "Upcoming", className: "bg-accent-2/10 text-accent-2" };
  return {
    label: item.status === "completed" ? "Past event" : "Past date",
    className: "bg-panel-2 text-ink-dim",
  };
}

export default function BeyliveHubClient({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<CommunityTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<EventScope>("all");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .in("status", ["open", "started", "completed"])
      .order("starts_at", { ascending: false })
      .limit(200);
    setItems((data as unknown as CommunityTournament[]) ?? []);
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

  const grouped = useMemo(() => {
    const now = Date.now();
    const next: Record<EventBucket, CommunityTournament[]> = { live: [], upcoming: [], past: [] };

    for (const item of items) {
      next[eventBucket(item, now)].push(item);
    }

    next.live.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    next.upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    next.past.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    return next;
  }, [items]);

  const visible = scope === "all" ? [...grouped.live, ...grouped.upcoming, ...grouped.past] : grouped[scope];
  const filters: { key: EventScope; label: string; hint: string; count: number }[] = [
    { key: "all", label: "All events", hint: "Live, upcoming, and past", count: items.length },
    { key: "live", label: "Live events", hint: "Currently running", count: grouped.live.length },
    { key: "upcoming", label: "Upcoming", hint: "Scheduled tournaments", count: grouped.upcoming.length },
    { key: "past", label: "Past events", hint: "Completed or past date", count: grouped.past.length },
  ];

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
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <aside className="h-fit rounded-md border border-edge bg-panel/40 p-3">
            <div className="mb-2 font-display text-xs font-bold tracking-wider text-accent-2">Filter events</div>
            <div className="grid gap-2">
              {filters.map((filter) => {
                const active = scope === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setScope(filter.key)}
                    className={`rounded border px-3 py-2 text-left transition ${
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-edge bg-panel text-ink-dim hover:border-accent-2/60 hover:text-ink"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-display text-xs font-bold tracking-wider">{filter.label}</span>
                      <span className="rounded bg-bg px-2 py-0.5 text-[10px] font-semibold">{filter.count}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-dim">{filter.hint}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {visible.length === 0 ? (
            <div className="panel p-8 text-center">
              <div className="font-display text-sm font-bold tracking-wider text-ink">No events in this filter</div>
              <p className="mt-1 text-sm text-ink-dim">Choose another event status.</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visible.map((item) => {
                const state = eventState(item, Date.now());
                const hasLivePage = item.live_enabled || item.status !== "open";
                const streams = streamCount(item);
                return (
                  <div key={item.id} className="panel flex flex-col gap-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{item.name}</div>
                        <div className="mt-0.5 text-xs text-ink-dim">
                          {item.city} / {item.venue} / {fmtWhen(item.starts_at, locale)}
                        </div>
                        <div className="mt-1 text-xs text-ink-dim">
                          Host: {profileDisplayName(item.host_profile)}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.className}`}>
                        {state.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                      <span className="rounded bg-panel px-2 py-0.5 text-accent-2">{beyliveFormatLabel(item.format)}</span>
                      <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">Round {item.current_round ?? "-"}</span>
                      <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">First to {item.target_score}</span>
                      <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">{beyliveStatusLabel(item.status)}</span>
                      {streams > 0 && (
                        <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">
                          {streams > 1 ? `${streams} streams` : "Stream"}
                        </span>
                      )}
                    </div>
                    {(item.winner_team || item.winner_profile) && (
                      <div className="rounded bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
                        Champion: {item.winner_team ? `${beyliveTeamCode(item.winner_team)} ${beyliveTeamName(item.winner_team)}` : profileDisplayName(item.winner_profile)}
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Link href={hasLivePage ? `/${locale}/tournaments/${item.id}/live` : `/${locale}/tournaments/${item.id}`} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
                        {hasLivePage ? "Watch BEYLIVE" : "View event"}
                      </Link>
                      <Link href={`/${locale}/tournaments/${item.id}/control`} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60">
                        Control
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
