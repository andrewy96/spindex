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

function toDateTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TournamentDetailClient({
  id,
  locale,
  dict,
}: {
  id: string;
  locale: Locale;
  dict: Dict;
}) {
  const { enabled, profile } = useAuth();
  const t = dict.tournaments;
  const [item, setItem] = useState<CommunityTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        { key: "single_elimination", label: t.hostFormatSingle },
        { key: "double_elimination", label: t.hostFormatDouble },
        { key: "round_robin", label: t.hostFormatRoundRobin },
        { key: "swiss", label: t.hostFormatSwiss },
        { key: "free_for_all", label: t.hostFormatFreeForAll },
        { key: "leaderboard", label: t.hostFormatLeaderboard },
      ] as const,
    [t]
  );

  const fillForm = (next: CommunityTournament) => {
    setName(next.name);
    setCity(next.city);
    setVenue(next.venue);
    setStartsAt(toDateTimeInput(next.starts_at));
    setFormat(next.format);
    setMaxPlayers(String(next.max_players));
    setNote(next.note ?? "");
  };

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("id", id)
      .maybeSingle();
    setLoading(false);
    if (err) {
      setError(t.hostError);
      return;
    }
    const next = (data as unknown as CommunityTournament | null) ?? null;
    setItem(next);
    if (next) fillForm(next);
  }, [id, t.hostError]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">{dict.auth.notConfigured}</div>;
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">{dict.admin.loading}</p>;
  if (!item) return <p className="py-16 text-center text-sm text-ink-dim">{t.notFound}</p>;

  const players = item.players ?? [];
  const joined = players
    .filter((p) => p.status === "joined")
    .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999));
  const waitlisted = players.filter((p) => p.status === "waitlisted");
  const mine = profile ? players.find((p) => p.user_id === profile.id) : null;
  const isHost = profile?.id === item.host;
  const formatLabel = formats.find((f) => f.key === item.format)?.label ?? item.format;

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const join = async () => {
    if (!supabase || !profile) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("join_tournament", { tid: item.id });
    setBusy(false);
    if (err) setError(t.hostError);
    else load();
  };

  const leave = async () => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.rpc("leave_tournament", { tid: item.id });
    setBusy(false);
    load();
  };

  const cancel = async () => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.from("tournaments").update({ status: "cancelled" }).eq("id", item.id);
    setBusy(false);
    load();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !isHost) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("tournaments")
      .update({
        name: name.trim(),
        city,
        venue: venue.trim(),
        starts_at: new Date(startsAt).toISOString(),
        format,
        max_players: Number(maxPlayers) || 16,
        note: note.trim() || null,
      })
      .eq("id", item.id);
    setBusy(false);
    if (err) {
      setError(t.hostError);
      return;
    }
    setEditing(false);
    load();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/${locale}/tournaments`} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          {t.back}
        </Link>
        <button onClick={copyShareLink} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60">
          {copied ? t.copied : t.shareLink}
        </button>
        {isHost && (
          <button onClick={() => setEditing(!editing)} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
            {editing ? t.cancel : t.edit}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-xs font-semibold text-atk">{error}</p>}

      {editing && isHost ? (
        <form onSubmit={save} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 font-display text-sm font-bold tracking-wider">{t.edit}</div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostName}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={100} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostCity}</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} required>
              {MY_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
            <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} className={inputCls}>
              {formats.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostNote}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={280} className={inputCls} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50">
              {t.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="clip-x border border-edge bg-panel-2 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
              {t.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-wide">{item.name}</h1>
                <p className="mt-1 text-sm text-ink-dim">
                  {item.city} · {item.venue} · {fmtWhen(item.starts_at, locale)}
                </p>
                <p className="mt-1 text-xs text-ink-dim">
                  {t.hostedBy}: {profileDisplayName(item.host_profile)}
                </p>
              </div>
              <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">{formatLabel}</span>
            </div>
            {item.note && <p className="mt-4 text-sm leading-relaxed text-ink-dim">{item.note}</p>}
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
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
            <div className="mt-5 flex flex-wrap gap-2">
              {!profile ? (
                <Link href={`/${locale}/login`} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent">
                  {t.loginToHost}
                </Link>
              ) : mine ? (
                <button onClick={leave} disabled={busy} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                  {t.leave}
                </button>
              ) : isHost ? (
                <button onClick={cancel} disabled={busy || item.status !== "open"} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                  {t.cancel}
                </button>
              ) : item.status === "open" ? (
                <button onClick={join} disabled={busy} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110 disabled:opacity-50">
                  {t.joinTournament}
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">{t.lineup}</div>
            {joined.length === 0 ? (
              <p className="text-sm text-ink-dim">{t.noPlayers}</p>
            ) : (
              <ol className="space-y-1 text-sm text-ink-dim">
                {joined.map((p, i) => (
                  <li key={p.user_id} className="rounded bg-panel px-2 py-1">
                    #{p.seed ?? i + 1} {profileDisplayName(p.profile)}
                  </li>
                ))}
              </ol>
            )}
            {waitlisted.length > 0 && (
              <>
                <div className="mb-2 mt-4 font-display text-xs font-bold tracking-wider text-ink-dim">{t.hostWaitlisted}</div>
                <ol className="space-y-1 text-xs text-ink-dim">
                  {waitlisted.map((p) => (
                    <li key={p.user_id} className="rounded bg-panel px-2 py-1">
                      {profileDisplayName(p.profile)}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
