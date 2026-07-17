"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { Gathering, MY_CITIES, supabase } from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";

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

function toDateTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function moneyLabel(g: Gathering, dict: Dict) {
  if (g.fee_type === "free") return dict.gatherings.free;
  return `RM ${Number(g.fee_amount ?? 0).toFixed(2)}`;
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
  const joined = members.filter((m) => m.status === "joined");
  const waitlisted = members.filter((m) => m.status === "waitlisted");
  const mine = profile ? members.find((m) => m.user_id === profile.id) : null;
  const isHost = profile?.id === item.host;

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
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
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-wide">{item.title}</h1>
              <p className="mt-1 text-sm text-ink-dim">
                {item.city} · {item.venue} · {fmtWhen(item.gather_at, locale)}
              </p>
              <p className="mt-1 text-xs text-ink-dim">
                {dict.gatherings.hostedBy}: {profileDisplayName(item.host_profile)}
              </p>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{moneyLabel(item, dict)}</span>
          </div>
          {item.note && <p className="mt-4 text-sm leading-relaxed text-ink-dim">{item.note}</p>}
          <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className="rounded bg-panel px-2 py-0.5 text-accent-2">
              {dict.gatherings.joined}: {joined.length}{item.capacity ? `/${item.capacity}` : ""}
            </span>
            <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">
              {dict.gatherings.waitlisted}: {waitlisted.length}
            </span>
            {mine && (
              <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">
                {mine.status === "joined" ? dict.gatherings.youJoined : dict.gatherings.youWaitlisted}
              </span>
            )}
          </div>
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
      )}
    </div>
  );
}
