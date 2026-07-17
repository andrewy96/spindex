"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  CommunityTournament,
  MY_CITIES,
  supabase,
  TournamentFormat,
} from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const TOURNAMENT_SELECT =
  "*, host_profile:profiles!tournaments_host_fkey(*), players:tournament_players(*, profile:profiles!tournament_players_user_id_fkey(*))";

function fmtWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TournamentHostClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { enabled, profile } = useAuth();
  const t = dict.tournaments;
  const [items, setItems] = useState<CommunityTournament[]>([]);
  const [showPost, setShowPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("Kuala Lumpur");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single_elimination");
  const [maxPlayers, setMaxPlayers] = useState("16");
  const [note, setNote] = useState("");

  const formats = useMemo(
    () =>
      [
        { key: "single_elimination", label: t.hostFormatSingle, desc: t.hostFormatSingleDesc },
        { key: "double_elimination", label: t.hostFormatDouble, desc: t.hostFormatDoubleDesc },
        { key: "round_robin", label: t.hostFormatRoundRobin, desc: t.hostFormatRoundRobinDesc },
        { key: "swiss", label: t.hostFormatSwiss, desc: t.hostFormatSwissDesc },
        { key: "free_for_all", label: t.hostFormatFreeForAll, desc: t.hostFormatFreeForAllDesc },
        { key: "leaderboard", label: t.hostFormatLeaderboard, desc: t.hostFormatLeaderboardDesc },
      ] as const,
    [t]
  );

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("status", "open")
      .order("starts_at", { ascending: true })
      .limit(80);
    if (!err) setItems((data as unknown as CommunityTournament[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        {dict.auth.notConfigured}
      </div>
    );
  }

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("tournaments").insert({
      host: profile.id,
      name: name.trim(),
      city,
      venue: venue.trim(),
      starts_at: new Date(startsAt).toISOString(),
      format,
      max_players: Number(maxPlayers) || 16,
      note: note.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(t.hostError);
      return;
    }
    setShowPost(false);
    setName("");
    setVenue("");
    setStartsAt("");
    setFormat("single_elimination");
    setMaxPlayers("16");
    setNote("");
    load();
  };

  const join = async (item: CommunityTournament) => {
    if (!supabase || !profile) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("join_tournament", { tid: item.id });
    setBusy(false);
    if (err) setError(t.hostError);
    else load();
  };

  const leave = async (item: CommunityTournament) => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.rpc("leave_tournament", { tid: item.id });
    setBusy(false);
    load();
  };

  const cancel = async (item: CommunityTournament) => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.from("tournaments").update({ status: "cancelled" }).eq("id", item.id);
    setBusy(false);
    load();
  };

  const formatLabel = (key: TournamentFormat) =>
    formats.find((f) => f.key === key)?.label ?? key;

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide">{t.hostTitle}</h2>
          <p className="mt-1 text-sm text-ink-dim">{t.hostIntro}</p>
        </div>
        <div className="ml-auto">
          {profile ? (
            <button
              onClick={() => setShowPost(!showPost)}
              className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
            >
              + {t.hostCta}
            </button>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent"
            >
              {t.loginToHost}
            </Link>
          )}
        </div>
      </div>

      {showPost && profile && (
        <form onSubmit={post} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 font-display text-sm font-bold tracking-wider">
            {t.hostFormTitle}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostName}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={100} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostCity}</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} required>
              {MY_CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostVenue}</label>
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputCls} maxLength={160} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostStartsAt}</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostMaxPlayers}</label>
            <input type="number" min={2} max={256} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} className={inputCls} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostFormat}</label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {formats.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormat(f.key)}
                  className={`rounded-md border p-3 text-left transition ${
                    format === f.key
                      ? "border-accent bg-accent/10"
                      : "border-edge bg-panel hover:border-accent/50"
                  }`}
                >
                  <div className={`text-sm font-semibold ${format === f.key ? "text-accent" : "text-ink"}`}>
                    {f.label}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-ink-dim">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostNote}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={280} className={inputCls} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={busy} className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50">
              {t.hostCta}
            </button>
            {error && <span className="text-xs font-semibold text-atk">{error}</span>}
          </div>
        </form>
      )}

      {error && !showPost && <p className="mb-4 text-xs font-semibold text-atk">{error}</p>}

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-dim">{t.hostEmpty}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const players = item.players ?? [];
            const joined = players
              .filter((p) => p.status === "joined")
              .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999));
            const waitlisted = players.filter((p) => p.status === "waitlisted");
            const mine = profile ? players.find((p) => p.user_id === profile.id) : null;
            const isHost = profile?.id === item.host;
            return (
              <div key={item.id} className="panel flex flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{item.name}</div>
                    <div className="mt-0.5 text-xs text-ink-dim">
                      {item.city} · {item.venue} · {fmtWhen(item.starts_at, locale)}
                    </div>
                    <div className="mt-1 text-xs text-ink-dim">
                      {t.hostedBy}: {profileDisplayName(item.host_profile)}
                    </div>
                  </div>
                  <span className="rounded-full bg-accent-2/10 px-2 py-0.5 text-[10px] font-semibold text-accent-2">
                    {formatLabel(item.format)}
                  </span>
                </div>
                {item.note && <p className="text-sm leading-relaxed text-ink-dim">{item.note}</p>}
                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded bg-panel px-2 py-0.5 text-accent">
                    {t.hostJoined}: {joined.length}/{item.max_players}
                  </span>
                  <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">
                    {t.hostWaitlisted}: {waitlisted.length}
                  </span>
                  {mine && (
                    <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">
                      {mine.status === "joined" ? t.hostYouJoined : t.hostYouWaitlisted}
                    </span>
                  )}
                </div>
                <div>
                  <div className="mb-2 font-display text-xs font-bold tracking-wider text-ink-dim">
                    {t.lineup}
                  </div>
                  {joined.length === 0 ? (
                    <p className="text-xs text-ink-dim">{t.noPlayers}</p>
                  ) : (
                    <ol className="grid gap-1 text-xs text-ink-dim sm:grid-cols-2">
                      {joined.slice(0, 12).map((p, i) => (
                        <li key={p.user_id} className="rounded bg-panel px-2 py-1">
                          #{p.seed ?? i + 1} {profileDisplayName(p.profile)}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {!profile ? null : mine ? (
                    <button onClick={() => leave(item)} disabled={busy} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                      {t.leave}
                    </button>
                  ) : isHost ? (
                    <button onClick={() => cancel(item)} disabled={busy || item.status !== "open"} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                      {t.cancel}
                    </button>
                  ) : item.status === "open" ? (
                    <button onClick={() => join(item)} disabled={busy} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110 disabled:opacity-50">
                      {t.joinTournament}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
