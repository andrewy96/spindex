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
import PartnerBattleRunner from "@/components/PartnerBattleRunner";
import TournamentFormatDesigner, { TournamentFormatSummary } from "@/components/TournamentFormatDesigner";
import {
  defaultTournamentFormatConfig,
  normalizeTournamentFormatConfig,
  tournamentGroupStageSettings,
  tournamentFormatConfigForSave,
  TournamentFormatConfig,
} from "@/lib/tournamentFormat";

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
  const [partnerRoster, setPartnerRoster] = useState<{ id: string; name: string }[]>([]);
  const [walkinName, setWalkinName] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("Kuala Lumpur");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single_elimination");
  const [maxPlayers, setMaxPlayers] = useState("16");
  const [targetScore, setTargetScore] = useState("4");
  const [formatConfig, setFormatConfig] = useState<TournamentFormatConfig>(() =>
    defaultTournamentFormatConfig("single_elimination", 16, 4, false),
  );
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
        { key: "partner", label: t.hostFormatPartner },
        { key: "group_stage", label: t.hostFormatGroupStage },
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
    setTargetScore(String(next.target_score ?? 4));
    setFormatConfig(normalizeTournamentFormatConfig(next.format_config, next.format, next.max_players, next.target_score ?? 4));
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

  // Partner tournaments track their roster in partner_battles (walk-in names,
  // not accounts), so mirror that count/lineup into the header — kept live.
  useEffect(() => {
    if (!supabase || item?.format !== "partner") return;
    let active = true;
    const read = (state: { players?: { id: string; name: string }[] } | null) => {
      if (active) setPartnerRoster(Array.isArray(state?.players) ? state!.players! : []);
    };
    supabase
      .from("partner_battles")
      .select("state")
      .eq("tournament_id", id)
      .maybeSingle()
      .then(({ data }) => read((data?.state as { players?: { id: string; name: string }[] }) ?? null));
    const channel = supabase
      .channel(`partner_battles_hdr:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_battles", filter: `tournament_id=eq.${id}` },
        (payload) => read((payload.new as { state?: { players?: { id: string; name: string }[] } } | null)?.state ?? null)
      )
      .subscribe();
    return () => {
      active = false;
      supabase?.removeChannel(channel);
    };
  }, [id, item?.format]);

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
  const maxPlayersNumber = Number(maxPlayers) || 16;
  const targetScoreNumber = Number(targetScore) || 4;
  const savedGroupStageSettings =
    item.format === "group_stage"
      ? tournamentGroupStageSettings(item.format_config, item.format, item.max_players, item.target_score ?? 4)
      : null;
  const groupStageGroupCount = savedGroupStageSettings?.groups ?? 8;
  const groupStageAdvanceCount = savedGroupStageSettings?.advanceCount ?? 16;
  const groupStageMinPlayers = savedGroupStageSettings?.minPlayers ?? 16;
  const poolNumbers = Array.from({ length: groupStageGroupCount }, (_, i) => i + 1);

  const changeFormat = (next: TournamentFormat) => {
    setFormat(next);
    setFormatConfig((current) =>
      defaultTournamentFormatConfig(next, maxPlayersNumber, targetScoreNumber, current.enabled),
    );
  };

  const changeMaxPlayers = (value: string) => {
    const nextMaxPlayers = Number(value) || 16;
    setMaxPlayers(value);
    setFormatConfig((current) =>
      current.enabled
        ? normalizeTournamentFormatConfig(current, format, nextMaxPlayers, targetScoreNumber)
        : current,
    );
  };

  const changeTargetScore = (value: string) => {
    const nextTargetScore = Number(value) || 4;
    setTargetScore(value);
    setFormatConfig((current) =>
      current.enabled
        ? normalizeTournamentFormatConfig(current, format, maxPlayersNumber, nextTargetScore)
        : current,
    );
  };

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

  const addWalkin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !isHost) return;
    const cleanName = walkinName.trim();
    if (!cleanName) return;
    setRosterBusy(true);
    setRosterError(null);
    const { error: err } = await supabase.rpc("add_tournament_walkin", { tid: item?.id, p_name: cleanName });
    setRosterBusy(false);
    if (err) {
      setRosterError(err.message.replace(/_/g, " "));
      return;
    }
    setWalkinName("");
    load();
  };

  const removePlayer = async (userId: string) => {
    if (!supabase || !isHost || !item) return;
    setRosterBusy(true);
    setRosterError(null);
    const { error: err } = await supabase.rpc("remove_tournament_player", { tid: item.id, p_user_id: userId });
    setRosterBusy(false);
    if (err) setRosterError(err.message.replace(/_/g, " "));
    else load();
  };

  const drawPools = async () => {
    if (!supabase || !isHost || !item) return;
    setRosterBusy(true);
    setRosterError(null);
    const { error: err } = await supabase.rpc("draw_group_stage_pools", { tid: item.id });
    setRosterBusy(false);
    if (err) setRosterError(err.message.replace(/_/g, " "));
    else load();
  };

  const setPlayerPool = async (userId: string, poolNo: number | null) => {
    if (!supabase || !isHost || !item) return;
    setRosterBusy(true);
    setRosterError(null);
    const { error: err } = await supabase.rpc("set_tournament_player_pool", {
      tid: item.id,
      p_user_id: userId,
      p_pool_no: poolNo,
    });
    setRosterBusy(false);
    if (err) setRosterError(err.message.replace(/_/g, " "));
    else load();
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
        format_config: tournamentFormatConfigForSave(formatConfig, format, maxPlayersNumber, targetScoreNumber),
        max_players: Number(maxPlayers) || 16,
        target_score: targetScoreNumber,
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
        <Link href={`/${locale}/tournaments/${item.id}/live`} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
          BEYLIVE
        </Link>
        {isHost && (
          <>
            <Link href={`/${locale}/tournaments/${item.id}/control`} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
              BEYLIVE Control
            </Link>
            <button onClick={() => setEditing(!editing)} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
              {editing ? t.cancel : t.edit}
            </button>
          </>
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
            <input type="number" min={2} max={256} value={maxPlayers} onChange={(e) => changeMaxPlayers(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostTargetScore}</label>
            <input type="number" min={1} max={30} value={targetScore} onChange={(e) => changeTargetScore(e.target.value)} className={inputCls} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostFormat}</label>
            <select value={format} onChange={(e) => changeFormat(e.target.value as TournamentFormat)} className={inputCls}>
              {formats.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <TournamentFormatDesigner
            value={formatConfig}
            onChange={setFormatConfig}
            format={format}
            maxPlayers={maxPlayersNumber}
            targetScore={targetScoreNumber}
            labels={t}
          />
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
        <>
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
            <TournamentFormatSummary
              value={item.format_config}
              format={item.format}
              maxPlayers={item.max_players}
              targetScore={item.target_score ?? 4}
              labels={t}
            />
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
              <span className="rounded bg-panel px-2 py-0.5 text-accent">
                {t.hostJoined}: {item.format === "partner" ? partnerRoster.length : joined.length}/
                {item.max_players}
              </span>
              {item.format !== "partner" && (
                <span className="rounded bg-panel px-2 py-0.5 text-ink-dim">
                  {t.hostWaitlisted}: {waitlisted.length}
                </span>
              )}
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
            {isHost && item.status === "open" && item.format !== "partner" && (
              <form onSubmit={addWalkin} className="mb-3 flex gap-2">
                <input
                  value={walkinName}
                  onChange={(e) => setWalkinName(e.target.value)}
                  placeholder="Add player by name (no account needed)"
                  maxLength={60}
                  className={`${inputCls} text-xs`}
                />
                <button
                  type="submit"
                  disabled={rosterBusy || !walkinName.trim()}
                  className="clip-x shrink-0 bg-accent px-3 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            )}
            {rosterError && <p className="mb-2 text-xs font-semibold text-atk">{rosterError}</p>}
            {item.format === "partner" ? (
              partnerRoster.length === 0 ? (
                <p className="text-sm text-ink-dim">{t.noPlayers}</p>
              ) : (
                <ol className="space-y-1 text-sm text-ink-dim">
                  {partnerRoster.map((p, i) => (
                    <li key={p.id} className="rounded bg-panel px-2 py-1">
                      #{i + 1} {p.name}
                    </li>
                  ))}
                </ol>
              )
            ) : joined.length === 0 ? (
              <p className="text-sm text-ink-dim">{t.noPlayers}</p>
            ) : (
              <ol className="space-y-1 text-sm text-ink-dim">
                {joined.map((p, i) => (
                  <li key={p.user_id} className="flex items-center justify-between gap-2 rounded bg-panel px-2 py-1">
                    <span className="min-w-0 truncate">
                      #{p.seed ?? i + 1} {profileDisplayName(p.profile)}
                      <span className="ml-2 font-mono text-[10px] text-accent-2">
                        {p.profile?.player_code ?? ""}
                      </span>
                      {p.profile?.is_walkin && (
                        <span className="ml-2 rounded bg-panel-2 px-1.5 py-0.5 text-[9px] font-semibold text-ink-dim">
                          walk-in
                        </span>
                      )}
                      {item.format === "group_stage" && p.pool_no != null && (
                        <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                          Pool {p.pool_no}
                        </span>
                      )}
                    </span>
                    {isHost && item.status === "open" && (
                      <button
                        onClick={() => removePlayer(p.user_id)}
                        disabled={rosterBusy}
                        className="shrink-0 text-[10px] font-semibold text-ink-dim underline decoration-dotted transition hover:text-atk disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {item.format !== "partner" && waitlisted.length > 0 && (
              <>
                <div className="mb-2 mt-4 font-display text-xs font-bold tracking-wider text-ink-dim">{t.hostWaitlisted}</div>
                <ol className="space-y-1 text-xs text-ink-dim">
                  {waitlisted.map((p) => (
                    <li key={p.user_id} className="flex items-center justify-between gap-2 rounded bg-panel px-2 py-1">
                      <span className="min-w-0 truncate">{profileDisplayName(p.profile)}</span>
                      {isHost && item.status === "open" && (
                        <button
                          onClick={() => removePlayer(p.user_id)}
                          disabled={rosterBusy}
                          className="shrink-0 text-[10px] font-semibold text-ink-dim underline decoration-dotted transition hover:text-atk disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>

        {item.format === "group_stage" && item.status === "open" && (
          <div className="panel mt-6 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-display text-sm font-bold tracking-wider text-ink-dim">Pools</div>
                <p className="mt-1 text-xs text-ink-dim">
                  Splits joined players into {groupStageGroupCount} pools and advances {groupStageAdvanceCount} players after round robin. Safe to
                  re-draw after adding more players — anyone already placed (including hand-moved players) stays put.
                </p>
              </div>
              {isHost && (
                <button
                  onClick={drawPools}
                  disabled={rosterBusy || joined.length < groupStageMinPlayers}
                  className="clip-x shrink-0 bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                >
                  Draw pools
                </button>
              )}
            </div>
            {joined.some((p) => p.pool_no != null) ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {poolNumbers.map((poolNo) => {
                  const members = joined.filter((p) => p.pool_no === poolNo);
                  if (members.length === 0) return null;
                  return (
                    <div key={poolNo} className="rounded-md border border-edge bg-panel p-3">
                      <div className="mb-2 font-display text-xs font-bold tracking-wider text-accent-2">
                        Pool {poolNo}
                      </div>
                      <div className="grid gap-1.5">
                        {members.map((p) => (
                          <div key={p.user_id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-ink-dim">{profileDisplayName(p.profile)}</span>
                            {isHost && (
                              <select
                                value={poolNo}
                                onChange={(e) => setPlayerPool(p.user_id, Number(e.target.value))}
                                disabled={rosterBusy}
                                className="shrink-0 rounded border border-edge bg-panel-2 px-1 py-0.5 text-[10px] outline-none focus:border-accent disabled:opacity-50"
                              >
                                {poolNumbers.map((n) => (
                                  <option key={n} value={n}>
                                    Pool {n}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {joined.some((p) => p.pool_no == null) && (
                  <div className="rounded-md border border-dashed border-edge bg-panel p-3">
                    <div className="mb-2 font-display text-xs font-bold tracking-wider text-ink-dim">Not yet placed</div>
                    <div className="grid gap-1.5">
                      {joined
                        .filter((p) => p.pool_no == null)
                        .map((p) => (
                          <div key={p.user_id} className="text-xs text-ink-dim">
                            {profileDisplayName(p.profile)}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-dim">
                {joined.length < groupStageMinPlayers
                  ? `Need at least ${groupStageMinPlayers} joined players to draw ${groupStageGroupCount} pools (${joined.length}/${groupStageMinPlayers}).`
                  : `No pools drawn yet — click "Draw pools" to split the lineup into ${groupStageGroupCount} groups.`}
              </p>
            )}
          </div>
        )}

        {item.format === "partner" && (
          <div className="mt-6">
            <PartnerBattleRunner
              locale={locale}
              tournamentId={item.id}
              seedNames={joined.map((p) => profileDisplayName(p.profile))}
              canManage={isHost}
            />
          </div>
        )}
        </>
      )}
    </div>
  );
}
