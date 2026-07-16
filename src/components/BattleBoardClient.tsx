"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { supabase, Challenge, DEFAULT_WIN_SCORE, MY_CITIES } from "@/lib/supabase";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
type ChallengeFormat = Challenge["format"];

function StatusChip({ status, dict }: { status: Challenge["status"]; dict: Dict }) {
  const map = {
    open: { label: dict.battle.statusOpen, color: "var(--color-sta)" },
    accepted: { label: dict.battle.statusAccepted, color: "var(--color-accent-2)" },
    completed: { label: dict.battle.statusCompleted, color: "var(--color-ink-dim)" },
    cancelled: { label: dict.battle.statusCancelled, color: "var(--color-ink-dim)" },
  } as const;
  const { label, color } = map[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {label}
    </span>
  );
}

function fmtWhen(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ChallengeCard({
  c,
  locale,
  dict,
  meId,
  onAccept,
  onCancel,
  busy,
}: {
  c: Challenge;
  locale: Locale;
  dict: Dict;
  meId: string | null;
  onAccept: (c: Challenge) => void;
  onCancel: (c: Challenge) => void;
  busy: boolean;
}) {
  const isHost = meId === c.host;
  const isParticipant = meId === c.host || meId === c.opponent;
  const when = fmtWhen(c.battle_at, locale);
  const format = c.format ?? "single";
  const teamSize = c.team_size ?? 1;
  const targetScore = c.target_score ?? DEFAULT_WIN_SCORE;
  const formatLabel =
    format === "team"
      ? dict.battle.teamFormat.replace("{count}", String(teamSize))
      : dict.battle.singleBattle;

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/${locale}/players/${c.host_profile?.handle ?? ""}`}
            className="font-semibold hover:text-accent"
          >
            @{c.host_profile?.handle}
          </Link>
          {c.opponent_profile && (
            <span className="text-sm text-ink-dim">
              {" "}vs{" "}
              <Link
                href={`/${locale}/players/${c.opponent_profile.handle}`}
                className="font-semibold text-ink hover:text-accent"
              >
                @{c.opponent_profile.handle}
              </Link>
            </span>
          )}
          <div className="mt-0.5 text-xs text-ink-dim">
            {c.city}
            {c.venue ? ` · ${c.venue}` : ""}
            {when ? ` · ${when}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-accent-2/10 px-2 py-0.5 text-[10px] font-semibold text-accent-2">
              {formatLabel}
            </span>
            <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
              {dict.battle.firstToPoints.replace("{points}", String(targetScore))}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusChip status={c.status} dict={dict} />
          <span className="font-display text-sm font-bold text-bal">★{c.wager}</span>
        </div>
      </div>
      {c.note && <p className="text-sm leading-relaxed text-ink-dim">{c.note}</p>}
      <div className="flex flex-wrap gap-2">
        {c.status === "open" && meId && !isHost && (
          <button
            onClick={() => onAccept(c)}
            disabled={busy}
            className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {dict.battle.accept}
          </button>
        )}
        {c.status === "open" && isHost && (
          <button
            onClick={() => onCancel(c)}
            disabled={busy}
            className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink"
          >
            {dict.battle.cancel}
          </button>
        )}
        {c.status === "accepted" && isParticipant && (
          <Link
            href={`/${locale}/battle/score?c=${c.id}`}
            className="clip-x bg-accent-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
          >
            ⚔ {dict.battle.playNow}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function BattleBoardClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { enabled, profile } = useAuth();
  const [tab, setTab] = useState<"open" | "mine">("open");
  const [city, setCity] = useState("all");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [showPost, setShowPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // post form state
  const [pCity, setPCity] = useState("Kuala Lumpur");
  const [pVenue, setPVenue] = useState("");
  const [pWhen, setPWhen] = useState("");
  const [pFormat, setPFormat] = useState<ChallengeFormat>("single");
  const [pTeamSize, setPTeamSize] = useState(2);
  const [pWager, setPWager] = useState(1);
  const [pTargetScore, setPTargetScore] = useState(DEFAULT_WIN_SCORE);
  const [pNote, setPNote] = useState("");
  const activeTeamSize = pFormat === "team" ? pTeamSize : 1;
  const minPostWager = activeTeamSize;
  const maxPostWager = profile ? Math.min(50, profile.stars) : 0;
  const canCoverPost = maxPostWager >= minPostWager;

  const load = useCallback(async () => {
    if (!supabase) return;
    let q = supabase
      .from("challenges")
      .select(
        "*, host_profile:profiles!challenges_host_fkey(*), opponent_profile:profiles!challenges_opponent_fkey(*)"
      )
      .order("created_at", { ascending: false })
      .limit(60);
    if (tab === "open") {
      q = q.eq("status", "open");
      if (city !== "all") q = q.eq("city", city);
    } else {
      if (!profile) {
        setChallenges([]);
        return;
      }
      q = q.or(`host.eq.${profile.id},opponent.eq.${profile.id}`);
    }
    const { data, error: err } = await q;
    if (!err) setChallenges((data as unknown as Challenge[]) ?? []);
  }, [tab, city, profile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const nextWager = Math.min(
      Math.max(pWager, minPostWager),
      Math.max(minPostWager, maxPostWager)
    );
    if (pWager !== nextWager) setPWager(nextWager);
  }, [maxPostWager, minPostWager, pWager]);

  if (!enabled) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        🚧 {dict.auth.notConfigured}
      </div>
    );
  }

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile) return;
    if (
      !canCoverPost ||
      pWager < minPostWager ||
      pWager > maxPostWager ||
      pTargetScore < 1 ||
      pTargetScore > 30
    ) {
      setError(dict.battle.notEnoughStars);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("challenges").insert({
      host: profile.id,
      city: pCity,
      venue: pVenue || null,
      battle_at: pWhen ? new Date(pWhen).toISOString() : null,
      wager: pWager,
      format: pFormat,
      team_size: activeTeamSize,
      target_score: pTargetScore,
      note: pNote || null,
    });
    setBusy(false);
    if (err) return setError(dict.battle.errorGeneric);
    setShowPost(false);
    setPVenue("");
    setPNote("");
    load();
  };

  const accept = async (c: Challenge) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("accept_challenge", { cid: c.id });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("not_enough_stars")
          ? dict.battle.notEnoughStars
          : dict.battle.errorGeneric
      );
      return;
    }
    setTab("mine");
  };

  const cancel = async (c: Challenge) => {
    if (!supabase) return;
    setBusy(true);
    await supabase.from("challenges").update({ status: "cancelled" }).eq("id", c.id);
    setBusy(false);
    load();
  };

  const selectCls =
    "rounded-md border border-edge bg-panel px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["open", "mine"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`clip-x px-4 py-2 font-display text-xs font-bold tracking-wider transition ${
              tab === t
                ? "bg-accent text-bg"
                : "border border-edge bg-panel text-ink-dim hover:text-ink"
            }`}
          >
            {t === "open" ? dict.battle.tabOpen : dict.battle.tabMine}
          </button>
        ))}
        {tab === "open" && (
          <select value={city} onChange={(e) => setCity(e.target.value)} className={selectCls} aria-label={dict.battle.cityFilter}>
            <option value="all">{dict.battle.cityFilter}: {dict.battle.all}</option>
            {MY_CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <div className="ml-auto">
          {profile ? (
            <button
              onClick={() => setShowPost(!showPost)}
              className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
            >
              + {dict.battle.postCta}
            </button>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent"
            >
              {dict.battle.loginToPost}
            </Link>
          )}
        </div>
      </div>

      {showPost && profile && (
        <form onSubmit={post} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 font-display text-sm font-bold tracking-wider">
            {dict.battle.postTitle}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{dict.battle.eventFormat}</label>
            <div className="grid grid-cols-2 gap-2">
              {(["single", "team"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setPFormat(format)}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    pFormat === format
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-edge bg-panel text-ink-dim hover:text-ink"
                  }`}
                >
                  {format === "single" ? dict.battle.singleBattle : dict.battle.teamEvent}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.battle.cityFilter}</label>
            <select value={pCity} onChange={(e) => setPCity(e.target.value)} className={inputCls} required>
              {MY_CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.battle.venue}</label>
            <input value={pVenue} onChange={(e) => setPVenue(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.battle.when}</label>
            <input
              type="datetime-local"
              value={pWhen}
              onChange={(e) => setPWhen(e.target.value)}
              className={inputCls}
            />
          </div>
          {pFormat === "team" && (
            <div>
              <label className="mb-1 block text-xs text-ink-dim">{dict.battle.peopleQty}</label>
              <input
                type="number"
                min={2}
                max={20}
                value={pTeamSize}
                onChange={(e) =>
                  setPTeamSize(Math.max(2, Math.min(20, Number(e.target.value) || 2)))
                }
                className={inputCls}
                required
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{dict.battle.targetScore}</label>
            <input
              type="number"
              min={1}
              max={30}
              value={pTargetScore}
              onChange={(e) =>
                setPTargetScore(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
              }
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">
              {dict.battle.starQuantity}{" "}
              {canCoverPost
                ? `(★${minPostWager}–${maxPostWager})`
                : `(${dict.battle.notEnoughStars})`}
            </label>
            <input
              type="number"
              min={minPostWager}
              max={Math.max(minPostWager, maxPostWager)}
              value={pWager}
              onChange={(e) => setPWager(Number(e.target.value))}
              className={inputCls}
              disabled={!canCoverPost}
              required
            />
            {pFormat === "team" && (
              <p className="mt-1 text-[11px] text-ink-dim">
                {dict.battle.starMinimumHint.replace("{count}", String(activeTeamSize))}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{dict.battle.note}</label>
            <textarea
              value={pNote}
              onChange={(e) => setPNote(e.target.value)}
              placeholder={dict.battle.notePlaceholder}
              maxLength={280}
              rows={2}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !canCoverPost}
              className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
            >
              {dict.battle.postCta}
            </button>
            {error && <span className="text-xs font-semibold text-atk">{error}</span>}
          </div>
        </form>
      )}

      {error && !showPost && (
        <p className="mb-4 text-xs font-semibold text-atk">{error}</p>
      )}

      {challenges.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-dim">{dict.battle.noOpen}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              c={c}
              locale={locale}
              dict={dict}
              meId={profile?.id ?? null}
              onAccept={accept}
              onCancel={cancel}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
