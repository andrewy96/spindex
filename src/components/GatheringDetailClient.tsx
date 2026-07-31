"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { Gathering, MY_CITIES, supabase } from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";
import ProfileAvatar from "./ProfileAvatar";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const GATHERING_SELECT =
  "*, host_profile:profiles!gatherings_host_fkey(*), members:gathering_members(*, profile:profiles!gathering_members_user_id_fkey(*))";

function fmtWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtDay(iso: string, locale: Locale) {
  return new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtClock(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-MY", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Days from today, counted by calendar day so "tomorrow" means tomorrow. */
function daysAway(iso: string) {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(new Date(iso)) - midnight(new Date())) / 86400000);
}

function countdownLabel(iso: string, dict: Dict) {
  const days = daysAway(iso);
  if (new Date(iso) < new Date()) return dict.gatherings.ended;
  if (days <= 0) return dict.gatherings.today;
  if (days === 1) return dict.gatherings.tomorrow;
  return dict.gatherings.inDays.replace("{n}", String(days));
}

function mapsUrl(g: Gathering) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${g.venue}, ${g.city}, Malaysia`
  )}`;
}

/** Gatherings have no end time, so block out a sensible default. */
const ASSUMED_HOURS = 3;

function calendarUrl(g: Gathering, shareUrl: string) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const start = new Date(g.gather_at);
  const end = new Date(start.getTime() + ASSUMED_HOURS * 3600000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: g.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: `${g.venue}, ${g.city}, Malaysia`,
    details: shareUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function Detail({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: string;
  sub?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-edge bg-panel/50 px-3 py-2.5">
      <div className="font-display text-[10px] font-bold uppercase tracking-widest text-ink-dim">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-dim">{sub}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

function toDateTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function moneyLabel(g: Gathering, dict: Dict) {
  if (g.fee_type === "free") return dict.gatherings.free;
  return `RM ${Number(g.fee_amount ?? 0).toFixed(2)}`;
}

function MemberName({
  member,
  locale,
}: {
  member: NonNullable<Gathering["members"]>[number];
  locale: Locale;
}) {
  const label = profileDisplayName(member.profile);
  const avatar = <ProfileAvatar profile={member.profile} size={26} />;
  if (!member.profile?.handle) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        {avatar}
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <Link
      href={`/${locale}/players/${member.profile.handle}`}
      className="flex min-w-0 items-center gap-2 font-semibold text-ink hover:text-accent"
    >
      {avatar}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function GatheringDetailClient({
  id,
  locale,
  dict,
}: {
  id: string;
  locale: Locale;
  dict: Dict;
}) {
  const { enabled, profile } = useAuth();
  const [item, setItem] = useState<Gathering | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState("");
  const [city, setCity] = useState("Kuala Lumpur");
  const [venue, setVenue] = useState("");
  const [when, setWhen] = useState("");
  const [feeType, setFeeType] = useState<"free" | "paid">("free");
  const [feeAmount, setFeeAmount] = useState("");
  const [capacity, setCapacity] = useState("");
  const [joinMode, setJoinMode] = useState<"open" | "waitlist">("open");
  const [note, setNote] = useState("");

  const fillForm = (g: Gathering) => {
    setTitle(g.title);
    setCity(g.city);
    setVenue(g.venue);
    setWhen(toDateTimeInput(g.gather_at));
    setFeeType(g.fee_type);
    setFeeAmount(g.fee_amount == null ? "" : String(g.fee_amount));
    setCapacity(g.capacity == null ? "" : String(g.capacity));
    setJoinMode(g.join_mode);
    setNote(g.note ?? "");
  };

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("gatherings")
      .select(GATHERING_SELECT)
      .eq("id", id)
      .maybeSingle();
    setLoading(false);
    if (err) {
      setError(dict.gatherings.errorGeneric);
      return;
    }
    const next = (data as unknown as Gathering | null) ?? null;
    setItem(next);
    if (next) fillForm(next);
  }, [dict.gatherings.errorGeneric, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">{dict.auth.notConfigured}</div>;
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">{dict.admin.loading}</p>;
  if (!item) return <p className="py-16 text-center text-sm text-ink-dim">{dict.gatherings.notFound}</p>;

  const members = item.members ?? [];
  const joined = members
    .filter((m) => m.status === "joined")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const waitlisted = members
    .filter((m) => m.status === "waitlisted")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const mine = profile ? members.find((m) => m.user_id === profile.id) : null;
  const isHost = profile?.id === item.host;
  const isPast = new Date(item.gather_at) < new Date();
  // Only reached after the client-side load, so window is available.
  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/g/${item.id}`;

  const copyShareLink = async () => {
    // Short form — /g/ redirects and opens in the reader's own language.
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const join = async () => {
    if (!supabase || !profile) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("join_gathering", { gid: item.id });
    setBusy(false);
    if (err) setError(dict.gatherings.errorGeneric);
    else load();
  };

  const leave = async () => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.rpc("leave_gathering", { gid: item.id });
    setBusy(false);
    load();
  };

  /** Host-side shuffle: someone drops out, their spot opens for the waitlist. */
  const moveMember = async (userId: string, next: "joined" | "waitlisted") => {
    if (!supabase || !isHost) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("set_gathering_member_status", {
      gid: item.id,
      member: userId,
      new_status: next,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("gathering_full")
          ? dict.gatherings.gatheringFull
          : dict.gatherings.errorGeneric
      );
      return;
    }
    load();
  };

  const cancel = async () => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.from("gatherings").update({ status: "cancelled" }).eq("id", item.id);
    setBusy(false);
    load();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !isHost) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("gatherings")
      .update({
        title: title.trim(),
        city,
        venue: venue.trim(),
        gather_at: new Date(when).toISOString(),
        fee_type: feeType,
        fee_amount: feeType === "paid" ? Number(feeAmount || 0) : null,
        capacity: capacity ? Number(capacity) : null,
        join_mode: joinMode,
        note: note.trim() || null,
      })
      .eq("id", item.id);
    setBusy(false);
    if (err) {
      setError(dict.gatherings.errorGeneric);
      return;
    }
    setEditing(false);
    load();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/${locale}/gatherings`} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          {dict.gatherings.back}
        </Link>
        <button onClick={copyShareLink} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60">
          {copied ? dict.gatherings.copied : dict.gatherings.shareLink}
        </button>
        {isHost && (
          <button onClick={() => setEditing(!editing)} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
            {editing ? dict.gatherings.cancel : dict.gatherings.edit}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-xs font-semibold text-atk">{error}</p>}

      {editing && isHost ? (
        <form onSubmit={save} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 font-display text-sm font-bold tracking-wider">{dict.gatherings.edit}</div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.titleField}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={80} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.cityFilter}</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} required>
              {MY_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.venue}</label>
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputCls} maxLength={160} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.when}</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.capacity}</label>
            <input type="number" min={2} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.fee}</label>
            <select value={feeType} onChange={(e) => setFeeType(e.target.value as "free" | "paid")} className={inputCls}>
              <option value="free">{dict.gatherings.free}</option>
              <option value="paid">{dict.gatherings.paid}</option>
            </select>
          </div>
          {feeType === "paid" && (
            <div>
              <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.feeAmount}</label>
              <input type="number" min={0} step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className={inputCls} required />
            </div>
          )}
          <div className={feeType === "paid" ? "" : "sm:col-span-2"}>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.joinMode}</label>
            <select value={joinMode} onChange={(e) => setJoinMode(e.target.value as "open" | "waitlist")} className={inputCls}>
              <option value="open">{dict.gatherings.joinOpen}</option>
              <option value="waitlist">{dict.gatherings.joinWaitlist}</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.note}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={280} className={inputCls} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50">
              {dict.gatherings.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="clip-x border border-edge bg-panel-2 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
              {dict.gatherings.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-wide">{item.title}</h1>
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-dim">
                  <ProfileAvatar profile={item.host_profile} size={32} />
                  <span>
                    {dict.gatherings.hostedBy}:{" "}
                    {item.host_profile?.handle ? (
                      <Link
                        href={`/${locale}/players/${item.host_profile.handle}`}
                        className="font-semibold text-ink hover:text-accent"
                      >
                        {profileDisplayName(item.host_profile)}
                      </Link>
                    ) : (
                      profileDisplayName(item.host_profile)
                    )}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{moneyLabel(item, dict)}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.status === "cancelled" || isPast
                      ? "bg-atk/10 text-atk"
                      : "bg-accent-2/10 text-accent-2"
                  }`}
                >
                  {item.status === "cancelled"
                    ? dict.gatherings.cancel
                    : countdownLabel(item.gather_at, dict)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Detail
                label={dict.gatherings.when}
                value={fmtDay(item.gather_at, locale)}
                sub={fmtClock(item.gather_at, locale)}
                action={
                  isPast ? null : (
                    <a
                      href={calendarUrl(item, shareUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-semibold text-accent hover:underline"
                    >
                      {dict.gatherings.addToCalendar} →
                    </a>
                  )
                }
              />
              <Detail
                label={dict.gatherings.venue}
                value={item.venue}
                sub={item.city}
                action={
                  <a
                    href={mapsUrl(item)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-accent hover:underline"
                  >
                    {dict.gatherings.openMaps} →
                  </a>
                }
              />
              <Detail
                label={dict.gatherings.joined}
                value={`${joined.length}${item.capacity ? ` / ${item.capacity}` : ""}`}
                sub={
                  waitlisted.length > 0
                    ? `${dict.gatherings.waitlisted}: ${waitlisted.length}`
                    : null
                }
              />
              <Detail
                label={dict.gatherings.joinMode}
                value={
                  item.join_mode === "open" ? dict.gatherings.joinOpen : dict.gatherings.joinWaitlist
                }
                sub={
                  mine
                    ? mine.status === "joined"
                      ? dict.gatherings.youJoined
                      : dict.gatherings.youWaitlisted
                    : null
                }
              />
            </div>

            {item.note && (
              <div className="mt-3 rounded-md border border-edge bg-panel/50 px-3 py-2.5">
                <div className="font-display text-[10px] font-bold uppercase tracking-widest text-ink-dim">
                  {dict.gatherings.note}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">{item.note}</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {!profile ? (
                <Link href={`/${locale}/login`} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent">
                  {dict.gatherings.loginToJoin}
                </Link>
              ) : mine ? (
                <button onClick={leave} disabled={busy} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                  {dict.gatherings.leave}
                </button>
              ) : isHost ? (
                <button onClick={cancel} disabled={busy || item.status !== "open"} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                  {dict.gatherings.cancel}
                </button>
              ) : item.status === "open" ? (
                <button onClick={join} disabled={busy} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110 disabled:opacity-50">
                  {dict.gatherings.join}
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">
              {dict.gatherings.nameList}
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-accent-2">{dict.gatherings.joined}</span>
              <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-accent-2">
                {joined.length}{item.capacity ? `/${item.capacity}` : ""}
              </span>
            </div>
            {joined.length === 0 ? (
              <p className="text-xs text-ink-dim">{dict.gatherings.noParticipants}</p>
            ) : (
              <ol className="space-y-1 text-sm text-ink-dim">
                {joined.map((member, index) => (
                  <li key={member.user_id} className="flex items-center gap-2 rounded bg-panel px-2 py-1">
                    <span className="shrink-0 text-xs">#{index + 1}</span>
                    <MemberName member={member} locale={locale} />
                    {isHost && (
                      <button
                        onClick={() => moveMember(member.user_id, "waitlisted")}
                        disabled={busy}
                        className="ml-auto shrink-0 rounded border border-edge px-2 py-0.5 text-[10px] font-semibold text-ink-dim transition enabled:hover:border-accent-2/60 enabled:hover:text-accent-2 disabled:opacity-40"
                      >
                        {dict.gatherings.moveToWaitlist}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {waitlisted.length > 0 && (
              <>
                <div className="mb-2 mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-dim">
                    {dict.gatherings.waitlisted}
                  </span>
                  <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
                    {waitlisted.length}
                  </span>
                </div>
                <ol className="space-y-1 text-sm text-ink-dim">
                  {waitlisted.map((member, index) => (
                    <li key={member.user_id} className="flex items-center gap-2 rounded bg-panel px-2 py-1">
                      <span className="shrink-0 text-xs">#{index + 1}</span>
                      <MemberName member={member} locale={locale} />
                      {isHost && (
                        <button
                          onClick={() => moveMember(member.user_id, "joined")}
                          disabled={busy}
                          className="ml-auto shrink-0 rounded border border-edge px-2 py-0.5 text-[10px] font-semibold text-accent transition enabled:hover:border-accent/60 disabled:opacity-40"
                        >
                          {dict.gatherings.moveToJoined}
                        </button>
                      )}
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
