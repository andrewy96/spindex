"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { MY_CITIES, Profile, supabase } from "@/lib/supabase";
import ProfileAvatar from "./ProfileAvatar";

function winRate(profile: Profile) {
  const total = profile.wins + profile.losses;
  return total > 0 ? Math.round((profile.wins / total) * 100) : 0;
}

export default function PlayerRankingsClient({
  locale,
  dict,
  limit = 10,
}: {
  locale: Locale;
  dict: Dict;
  limit?: number;
}) {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("all");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("profiles")
      .select("*")
      .eq("is_walkin", false)
      .order("wins", { ascending: false })
      .order("stars", { ascending: false })
      .limit(limit);
    if (city !== "all") q = q.eq("city", city);
    q.then(({ data }) => {
      setPlayers((data as Profile[]) ?? []);
      setLoading(false);
    });
  }, [limit, city]);

  const ranked = useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          b.wins - a.wins ||
          b.stars - a.stars ||
          winRate(b) - winRate(a) ||
          a.handle.localeCompare(b.handle)
      ),
    [players]
  );

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide">
            {dict.rankings.publicPlayers}
          </h2>
          <p className="mt-1 text-xs text-ink-dim">{dict.rankings.publicPlayersSub}</p>
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-md border border-edge bg-panel px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
          aria-label={dict.battle.cityFilter}
        >
          <option value="all">
            {dict.battle.cityFilter}: {dict.battle.all}
          </option>
          {MY_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {!supabase ? (
        <p className="py-8 text-center text-sm text-ink-dim">{dict.auth.notConfigured}</p>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-ink-dim">{dict.admin.loading}</p>
      ) : ranked.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-dim">{dict.admin.noUsers}</p>
      ) : (
        <div className="space-y-2">
          {ranked.map((player, index) => (
            <Link
              key={player.id}
              href={`/${locale}/players/${player.handle}`}
              className="flex items-center gap-3 rounded-md border border-edge bg-bg/35 p-3 transition hover:border-accent/50"
            >
              <div className="w-7 text-center font-display text-sm font-bold text-ink-dim">
                #{index + 1}
              </div>
              <ProfileAvatar profile={player} size={44} className="text-sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {player.display_name || player.handle}
                </div>
                <div className="truncate text-[10px] text-ink-dim">
                  @{player.handle}
                  {player.city ? ` / ${player.city}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-sm font-bold text-accent">{player.wins}W</div>
                <div className="text-[10px] text-ink-dim">
                  {winRate(player)}% / <span className="text-bal">{player.stars} pts</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
