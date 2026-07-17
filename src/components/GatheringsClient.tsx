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

function moneyLabel(g: Gathering, dict: Dict) {
  if (g.fee_type === "free") return dict.gatherings.free;
  return `RM ${Number(g.fee_amount ?? 0).toFixed(2)}`;
}

export default function GatheringsClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { enabled, profile } = useAuth();
  const [city, setCity] = useState("all");
  const [items, setItems] = useState<Gathering[]>([]);
  const [showPost, setShowPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [pCity, setPCity] = useState("Kuala Lumpur");
  const [venue, setVenue] = useState("");
  const [when, setWhen] = useState("");
  const [feeType, setFeeType] = useState<"free" | "paid">("free");
  const [feeAmount, setFeeAmount] = useState("");
  const [capacity, setCapacity] = useState("16");
  const [joinMode, setJoinMode] = useState<"open" | "waitlist">("open");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    let q = supabase
      .from("gatherings")
      .select(GATHERING_SELECT)
      .eq("status", "open")
      .order("gather_at", { ascending: true })
      .limit(80);
    if (city !== "all") q = q.eq("city", city);
    const { data, error: err } = await q;
    if (!err) setItems((data as unknown as Gathering[]) ?? []);
  }, [city]);

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
    const { error: err } = await supabase.from("gatherings").insert({
      host: profile.id,
      title: title.trim(),
      city: pCity,
      venue: venue.trim(),
      gather_at: new Date(when).toISOString(),
      fee_type: feeType,
      fee_amount: feeType === "paid" ? Number(feeAmount || 0) : null,
      capacity: capacity ? Number(capacity) : null,
      join_mode: joinMode,
      note: note.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(dict.gatherings.errorGeneric);
      return;
    }
    setShowPost(false);
    setTitle("");
    setVenue("");
    setWhen("");
    setFeeType("free");
    setFeeAmount("");
    setCapacity("16");
    setJoinMode("open");
    setNote("");
    load();
  };

  const join = async (g: Gathering) => {
    if (!supabase || !profile) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("join_gathering", { gid: g.id });
    setBusy(false);
    if (err) setError(dict.gatherings.errorGeneric);
    else load();
  };

  const leave = async (g: Gathering) => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.rpc("leave_gathering", { gid: g.id });
    setBusy(false);
    load();
  };

  const cancel = async (g: Gathering) => {
    if (!supabase || !profile) return;
    setBusy(true);
    await supabase.from("gatherings").update({ status: "cancelled" }).eq("id", g.id);
    setBusy(false);
    load();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-md border border-edge bg-panel px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent"
          aria-label={dict.gatherings.cityFilter}
        >
          <option value="all">
            {dict.gatherings.cityFilter}: {dict.gatherings.all}
          </option>
          {MY_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          {profile ? (
            <button
              onClick={() => setShowPost(!showPost)}
              className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
            >
              + {dict.gatherings.postCta}
            </button>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent"
            >
              {dict.gatherings.loginToJoin}
            </Link>
          )}
        </div>
      </div>

      {showPost && profile && (
        <form onSubmit={post} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 font-display text-sm font-bold tracking-wider">
            {dict.gatherings.postTitle}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.titleField}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={80} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.gatherings.cityFilter}</label>
            <select value={pCity} onChange={(e) => setPCity(e.target.value)} className={inputCls} required>
              {MY_CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
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
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={busy} className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50">
              {dict.gatherings.postCta}
            </button>
            {error && <span className="text-xs font-semibold text-atk">{error}</span>}
          </div>
        </form>
      )}

      {error && !showPost && <p className="mb-4 text-xs font-semibold text-atk">{error}</p>}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-dim">{dict.gatherings.empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((g) => {
            const members = g.members ?? [];
            const joined = members.filter((m) => m.status === "joined");
            const waitlisted = members.filter((m) => m.status === "waitlisted");
            const mine = profile ? members.find((m) => m.user_id === profile.id) : null;
            const isHost = profile?.id === g.host;
            return (
              <div key={g.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{g.title}</div>
                    <div className="mt-0.5 text-xs text-ink-dim">
                      {g.city} · {g.venue} · {fmtWhen(g.gather_at, locale)}
                    </div>
                    <div className="mt-1 text-xs text-ink-dim">
                      {dict.gatherings.hostedBy}: {profileDisplayName(g.host_profile)}
                    </div>
                  </div>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    {moneyLabel(g, dict)}
                  </span>
                </div>
                {g.note && <p className="text-sm leading-relaxed text-ink-dim">{g.note}</p>}
                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded bg-panel px-2 py-0.5 text-accent-2">
                    {dict.gatherings.joined}: {joined.length}{g.capacity ? `/${g.capacity}` : ""}
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
                <div className="mt-auto flex flex-wrap gap-2">
                  {!profile ? null : mine ? (
                    <button onClick={() => leave(g)} disabled={busy} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                      {dict.gatherings.leave}
                    </button>
                  ) : isHost ? (
                    <button onClick={() => cancel(g)} disabled={busy || g.status !== "open"} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                      {dict.gatherings.cancel}
                    </button>
                  ) : g.status === "open" ? (
                    <button onClick={() => join(g)} disabled={busy} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110 disabled:opacity-50">
                      {dict.gatherings.join}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
