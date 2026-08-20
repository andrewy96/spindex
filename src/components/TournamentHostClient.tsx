"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth, useIsSuperadmin } from "@/lib/auth";
import {
  CommunityTournament,
  MY_CITIES,
  supabase,
  TournamentFormat,
} from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";
import TournamentFormatDesigner, { TournamentFormatSummary } from "./TournamentFormatDesigner";
import {
  defaultTournamentFormatConfig,
  normalizeTournamentFormatConfig,
  tournamentFormatConfigForSave,
  TournamentFormatConfig,
} from "@/lib/tournamentFormat";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const TOURNAMENT_SELECT =
  "*, host_profile:profiles!tournaments_host_fkey(*), players:tournament_players(*, profile:profiles!tournament_players_user_id_fkey(*))";

type FormatOption = {
  key: TournamentFormat;
  label: string;
  desc: string;
};

function fmtWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** A tournament is past once it is closed, or its start time has gone by without it running. */
function isPast(item: CommunityTournament) {
  if (item.status === "completed" || item.status === "cancelled") return true;
  if (item.status === "started") return false;
  return new Date(item.starts_at).getTime() < Date.now();
}

function HostGuidePanel({
  t,
  formats,
}: {
  t: Dict["tournaments"];
  formats: FormatOption[];
}) {
  const setupGuides = [
    { title: t.hostGuideBasicsTitle, body: t.hostGuideBasicsBody },
    { title: t.hostGuideScoringTitle, body: t.hostGuideScoringBody },
    { title: t.hostGuideFormatTitle, body: t.hostGuideFormatBody },
    { title: t.hostGuideCustomizeTitle, body: t.hostGuideCustomizeBody },
  ];
  const fieldGuides = [
    { label: t.hostName, body: t.hostFieldNameHelp },
    { label: t.hostCity, body: t.hostFieldCityHelp },
    { label: t.hostVenue, body: t.hostFieldVenueHelp },
    { label: t.hostStartsAt, body: t.hostFieldStartsAtHelp },
    { label: t.hostMaxPlayers, body: t.hostFieldMaxPlayersHelp },
    { label: t.hostTargetScore, body: t.hostFieldTargetScoreHelp },
    { label: t.hostFormat, body: t.hostFieldFormatHelp },
    { label: t.hostNote, body: t.hostFieldNoteHelp },
  ];
  const customizeGuides = [
    { label: t.formatStageType, body: t.hostCustomizeStageTypeHelp },
    { label: t.formatEntrants, body: t.hostCustomizeEntrantsHelp },
    { label: t.formatAdvance, body: t.hostCustomizeAdvanceHelp },
    { label: `${t.formatGroups} / ${t.formatRounds}`, body: t.hostCustomizeGroupsRoundsHelp },
    { label: t.formatTargetScore, body: t.hostCustomizeTargetScoreHelp },
    { label: t.formatSeeding, body: t.hostCustomizeSeedingHelp },
  ];

  return (
    <div className="sm:col-span-2 rounded-md border border-edge bg-bg/80 p-4">
      <div className="font-display text-xs font-bold uppercase tracking-[0.22em] text-accent">
        {t.hostGuideTitle}
      </div>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-ink-dim">{t.hostGuideIntro}</p>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {setupGuides.map((item) => (
          <div key={item.title} className="rounded-md border border-edge bg-panel px-3 py-2">
            <div className="text-xs font-semibold text-ink">{item.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-ink-dim">{item.body}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-edge pt-4">
        <div className="font-display text-xs font-bold uppercase tracking-wider text-accent-2">
          {t.hostGuideFieldTitle}
        </div>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {fieldGuides.map((item) => (
            <div key={item.label} className="rounded bg-panel px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-ink">{item.label}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-dim">{item.body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <details className="mt-4 rounded-md border border-edge bg-panel px-3 py-2">
        <summary className="cursor-pointer font-display text-xs font-bold uppercase tracking-wider text-accent">
          {t.hostFormatGuideTitle}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-ink-dim">{t.hostFormatGuideIntro}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {formats.map((format) => (
            <div key={format.key} className="rounded border border-edge bg-bg px-3 py-2">
              <div className="text-xs font-semibold text-ink">{format.label}</div>
              <div className="mt-1 text-xs leading-relaxed text-ink-dim">{format.desc}</div>
            </div>
          ))}
        </div>
      </details>

      <details className="mt-2 rounded-md border border-edge bg-panel px-3 py-2">
        <summary className="cursor-pointer font-display text-xs font-bold uppercase tracking-wider text-accent">
          {t.hostCustomizeReferenceTitle}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-ink-dim">{t.hostCustomizeReferenceBody}</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {customizeGuides.map((item) => (
            <div key={item.label} className="rounded border border-edge bg-bg px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-ink">{item.label}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-dim">{item.body}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

export default function TournamentHostClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { enabled, profile } = useAuth();
  const isSuperadmin = useIsSuperadmin();
  const t = dict.tournaments;
  const [timeScope, setTimeScope] = useState<"upcoming" | "past">("upcoming");
  const [items, setItems] = useState<CommunityTournament[]>([]);
  const [showPost, setShowPost] = useState(false);
  const [showHostGuide, setShowHostGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const formats = useMemo<FormatOption[]>(
    () =>
      [
        { key: "single_elimination", label: t.hostFormatSingle, desc: t.hostFormatSingleDesc },
        { key: "double_elimination", label: t.hostFormatDouble, desc: t.hostFormatDoubleDesc },
        { key: "round_robin", label: t.hostFormatRoundRobin, desc: t.hostFormatRoundRobinDesc },
        { key: "swiss", label: t.hostFormatSwiss, desc: t.hostFormatSwissDesc },
        { key: "free_for_all", label: t.hostFormatFreeForAll, desc: t.hostFormatFreeForAllDesc },
        { key: "leaderboard", label: t.hostFormatLeaderboard, desc: t.hostFormatLeaderboardDesc },
        { key: "partner", label: t.hostFormatPartner, desc: t.hostFormatPartnerDesc },
        { key: "group_stage", label: t.hostFormatGroupStage, desc: t.hostFormatGroupStageDesc },
      ] as const,
    [t]
  );

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .order("starts_at", { ascending: false })
      .limit(120);
    if (!err) setItems((data as unknown as CommunityTournament[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [upcoming, past] = useMemo(() => {
    const up: CommunityTournament[] = [];
    const done: CommunityTournament[] = [];
    for (const item of items) (isPast(item) ? done : up).push(item);
    up.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return [up, done];
  }, [items]);
  const visible = timeScope === "upcoming" ? upcoming : past;
  const maxPlayersNumber = Number(maxPlayers) || 16;
  const targetScoreNumber = Number(targetScore) || 4;
  const canHost =
    !!profile &&
    (isSuperadmin ||
      (!!profile.approved_host && !profile.is_walkin && !profile.admin_deleted_at));

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

  if (!enabled) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        {dict.auth.notConfigured}
      </div>
    );
  }

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile || !canHost) {
      setError("Only approved hosts can create tournaments.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("tournaments").insert({
      host: profile.id,
      name: name.trim(),
      city,
      venue: venue.trim(),
      starts_at: new Date(startsAt).toISOString(),
      format,
      format_config: tournamentFormatConfigForSave(formatConfig, format, maxPlayersNumber, targetScoreNumber),
      max_players: Number(maxPlayers) || 16,
      target_score: targetScoreNumber,
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
    setTargetScore("4");
    setFormatConfig(defaultTournamentFormatConfig("single_elimination", 16, 4, false));
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

  const remove = async (item: CommunityTournament) => {
    if (!supabase || !profile) return;
    if (!window.confirm(t.deleteConfirm.replace("{name}", item.name))) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("delete_tournament", { tid: item.id });
    setBusy(false);
    if (err) setError(t.hostError);
    else load();
  };

  const formatLabel = (key: TournamentFormat) =>
    formats.find((f) => f.key === key)?.label ?? key;

  const copyShareLink = async (id: string) => {
    const url = `${window.location.origin}/${locale}/tournaments/${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide">{t.hostTitle}</h2>
          <p className="mt-1 text-sm text-ink-dim">{t.hostIntro}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-edge bg-panel p-0.5">
            {(["upcoming", "past"] as const).map((scope) => (
              <button
                key={scope}
                onClick={() => setTimeScope(scope)}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                  timeScope === scope
                    ? "bg-accent/15 text-accent"
                    : "text-ink-dim hover:text-ink"
                }`}
              >
                {scope === "upcoming" ? t.timeUpcoming : t.timePast} (
                {scope === "upcoming" ? upcoming.length : past.length})
              </button>
            ))}
          </div>
          {profile && canHost ? (
            <button
              onClick={() => {
                setShowPost(!showPost);
                setShowHostGuide(false);
              }}
              className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110"
            >
              + {t.hostCta}
            </button>
          ) : profile ? (
            <span className="rounded-md border border-edge bg-panel px-3 py-2 text-xs font-semibold text-ink-dim">
              Approved hosts only
            </span>
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

      {showPost && profile && canHost && (
        <form onSubmit={post} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-sm font-bold tracking-wider">{t.hostFormTitle}</div>
              <div className="mt-1 text-xs text-ink-dim">{t.hostFormIntro}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowHostGuide((current) => !current)}
              aria-expanded={showHostGuide}
              className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-[10px] font-bold tracking-wider text-accent transition hover:bg-accent/20"
            >
              {showHostGuide ? t.hostGuideHide : t.hostGuideShow}
            </button>
          </div>
          {showHostGuide && <HostGuidePanel t={t} formats={formats} />}
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
            <input type="number" min={2} max={256} value={maxPlayers} onChange={(e) => changeMaxPlayers(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostTargetScore}</label>
            <input type="number" min={1} max={30} value={targetScore} onChange={(e) => changeTargetScore(e.target.value)} className={inputCls} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostFormat}</label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {formats.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => changeFormat(f.key)}
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
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={busy} className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50">
              {t.hostCta}
            </button>
            {error && <span className="text-xs font-semibold text-atk">{error}</span>}
          </div>
        </form>
      )}

      {error && !showPost && <p className="mb-4 text-xs font-semibold text-atk">{error}</p>}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-dim">
          {timeScope === "past" ? t.hostEmptyPast : t.hostEmpty}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((item) => {
            const players = item.players ?? [];
            const joined = players
              .filter((p) => p.status === "joined")
              .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999));
            const waitlisted = players.filter((p) => p.status === "waitlisted");
            const mine = profile ? players.find((p) => p.user_id === profile.id) : null;
            const isHost = profile?.id === item.host;
            const past = isPast(item);
            const statusLabel =
              item.status === "cancelled"
                ? t.statusCancelled
                : item.status === "completed"
                  ? t.statusCompleted
                  : item.status === "started"
                    ? t.statusLive
                    : past
                      ? t.statusEnded
                      : null;
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-accent-2/10 px-2 py-0.5 text-[10px] font-semibold text-accent-2">
                      {formatLabel(item.format)}
                    </span>
                    {statusLabel && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "started"
                            ? "bg-accent/15 text-accent"
                            : "bg-panel text-ink-dim"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    )}
                  </div>
                </div>
                {item.note && <p className="text-sm leading-relaxed text-ink-dim">{item.note}</p>}
                <TournamentFormatSummary
                  value={item.format_config}
                  format={item.format}
                  maxPlayers={item.max_players}
                  targetScore={item.target_score ?? 4}
                  labels={t}
                  compact
                />
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
                  <Link href={`/${locale}/tournaments/${item.id}`} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:border-accent/60">
                    {t.view}
                  </Link>
                  <Link href={`/${locale}/tournaments/${item.id}/live`} className="clip-x border border-accent/50 bg-accent/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:bg-accent/20">
                    BEYLIVE
                  </Link>
                  <button onClick={() => copyShareLink(item.id)} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent-2 transition hover:border-accent-2/60">
                    {copiedId === item.id ? t.copied : t.shareLink}
                  </button>
                  {!profile ? null : mine && !past ? (
                    <button onClick={() => leave(item)} disabled={busy} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                      {t.leave}
                    </button>
                  ) : isHost ? (
                    <button onClick={() => cancel(item)} disabled={busy || item.status !== "open"} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink disabled:opacity-50">
                      {t.cancel}
                    </button>
                  ) : item.status === "open" && !past ? (
                    <button onClick={() => join(item)} disabled={busy} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110 disabled:opacity-50">
                      {t.joinTournament}
                    </button>
                  ) : null}
                  {isSuperadmin && (
                    <button
                      onClick={() => remove(item)}
                      disabled={busy}
                      className="clip-x border border-atk/50 bg-atk/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-atk transition enabled:hover:bg-atk enabled:hover:text-bg disabled:opacity-50"
                    >
                      {t.delete}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
