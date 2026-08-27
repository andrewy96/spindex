"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  CommunityTournament,
  MY_CITIES,
  Profile,
  supabase,
  TournamentEventType,
  TournamentFormat,
  TournamentRegistration,
} from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";
import PartnerBattleRunner from "@/components/PartnerBattleRunner";
import TournamentFormatDesigner, { TournamentFormatSummary } from "@/components/TournamentFormatDesigner";
import TournamentRegistrationSettings from "@/components/TournamentRegistrationSettings";
import {
  defaultTournamentFormatConfig,
  normalizeTournamentFormatConfig,
  tournamentGroupStageSettings,
  tournamentSwissStageSettings,
  tournamentFormatConfigForSave,
  TournamentFormatConfig,
} from "@/lib/tournamentFormat";
import {
  checkTournamentRegistrationProof,
  normalizeTournamentRegistrationConfig,
  tournamentRegistrationConfigForSave,
  tournamentRegistrationProofExtension,
  TournamentRegistrationConfig,
  TOURNAMENT_REGISTRATION_PROOF_ACCEPT,
  TOURNAMENT_REGISTRATION_PROOF_BUCKET,
} from "@/lib/tournamentRegistration";
import { canAccessBeyliveControl } from "@/lib/beyliveAccess";
import {
  inferTournamentEventType,
  registrationConfigForEventType,
  tournamentUsesTeamEntrants,
} from "@/lib/tournamentEvent";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const TOURNAMENT_SELECT =
  "*, host_profile:profiles!tournaments_host_fkey(*), players:tournament_players(*, profile:profiles!tournament_players_user_id_fkey(*))";
const WALKIN_CSV_TEMPLATE_PATH = "/templates/tournament-lineup-template.csv";
const WALKIN_NAME_HEADERS = new Set(["name", "player", "player name", "player_name", "blader", "blader name", "blader_name"]);

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

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushRow = () => {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
    field = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      pushRow();
      if (next === "\n") i += 1;
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) pushRow();
  return rows;
}

function parseWalkinCsv(text: string) {
  const rows = parseCsvRows(text)
    .map((row) => row.map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, "") : cell).trim()))
    .filter((row) => row.some(Boolean));
  if (rows.length === 0) return { names: [] as string[], skipped: 0, errors: ["CSV is empty."] };

  const firstRow = rows[0].map((cell) => cell.toLowerCase());
  const nameColumn = firstRow.findIndex((cell) => WALKIN_NAME_HEADERS.has(cell));
  const dataRows = nameColumn >= 0 ? rows.slice(1) : rows;
  const nameIndex = nameColumn >= 0 ? nameColumn : 0;
  const names: string[] = [];
  const errors: string[] = [];
  let skipped = 0;

  dataRows.forEach((row, index) => {
    const name = (row[nameIndex] ?? "").trim();
    const rowNumber = (nameColumn >= 0 ? index + 2 : index + 1);
    if (!name) {
      skipped += 1;
      return;
    }
    if (name.length > 60) {
      skipped += 1;
      errors.push(`Row ${rowNumber}: name is over 60 characters.`);
      return;
    }
    names.push(name);
  });

  return { names, skipped, errors };
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
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [hostRegisterQuery, setHostRegisterQuery] = useState("");
  const [hostRegisterMatches, setHostRegisterMatches] = useState<Profile[]>([]);
  const [hostRegisterProfile, setHostRegisterProfile] = useState<Profile | null>(null);
  const [hostRegisterExisting, setHostRegisterExisting] = useState<TournamentRegistration | null>(null);
  const [hostRegisterEmail, setHostRegisterEmail] = useState("");
  const [hostRegisterContactNumber, setHostRegisterContactNumber] = useState("");
  const [hostRegisterTeamName, setHostRegisterTeamName] = useState("");
  const [hostRegisterProofFile, setHostRegisterProofFile] = useState<File | null>(null);
  const [hostRegisterCustomAnswers, setHostRegisterCustomAnswers] = useState<Record<string, string>>({});
  const [hostRegisterBusy, setHostRegisterBusy] = useState(false);
  const [hostRegisterError, setHostRegisterError] = useState<string | null>(null);
  const [hostRegisterSuccess, setHostRegisterSuccess] = useState<string | null>(null);
  const [walkinName, setWalkinName] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("Kuala Lumpur");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [eventType, setEventType] = useState<TournamentEventType>("team");
  const [format, setFormat] = useState<TournamentFormat>("single_elimination");
  const [maxPlayers, setMaxPlayers] = useState("16");
  const [targetScore, setTargetScore] = useState("4");
  const [stadiumCount, setStadiumCount] = useState("2");
  const [formatConfig, setFormatConfig] = useState<TournamentFormatConfig>(() =>
    defaultTournamentFormatConfig("single_elimination", 16, 4, false),
  );
  const [registrationConfig, setRegistrationConfig] = useState<TournamentRegistrationConfig>(() =>
    normalizeTournamentRegistrationConfig(null),
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
    setEventType(inferTournamentEventType(next));
    setFormat(next.format);
    setMaxPlayers(String(next.max_players));
    setTargetScore(String(next.target_score ?? 4));
    setStadiumCount(String(next.beylive_stadium_count ?? 2));
    setFormatConfig(normalizeTournamentFormatConfig(next.format_config, next.format, next.max_players, next.target_score ?? 4));
    setRegistrationConfig(normalizeTournamentRegistrationConfig(next.registration_config));
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

    if (profile) {
      const { data: regData } = await supabase
        .from("tournament_registrations")
        .select("*, profile:profiles!tournament_registrations_user_id_fkey(*)")
        .eq("tournament_id", id)
        .order("created_at", { ascending: true });
      setRegistrations((regData as unknown as TournamentRegistration[]) ?? []);
    } else {
      setRegistrations([]);
    }
  }, [id, profile, t.hostError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const client = supabase;
    const hostReady = !!item && profile?.id === item.host;
    const raw = hostRegisterQuery.trim();
    const selectedQuery = hostRegisterProfile
      ? hostRegisterProfile.player_code || `@${hostRegisterProfile.handle}`
      : "";
    if (!client || !hostReady || raw.length < 2 || raw === selectedQuery) {
      setHostRegisterMatches([]);
      return;
    }

    const term = raw
      .replace(/^@/, "")
      .replace(/[,%()]/g, " ")
      .trim()
      .replace(/\s+/g, "%");
    if (term.length < 2) {
      setHostRegisterMatches([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      const pattern = `%${term}%`;
      const { data } = await client
        .from("profiles")
        .select("*")
        .or(`player_code.ilike.${pattern},handle.ilike.${pattern},display_name.ilike.${pattern}`)
        .eq("is_walkin", false)
        .is("admin_deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(50);

      if (!active) return;
      setHostRegisterMatches(
        ((data as unknown as Profile[] | null) ?? []).filter(
          (target) => !target.is_walkin && !target.admin_deleted_at,
        ),
      );
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [hostRegisterProfile, hostRegisterQuery, item, profile?.id]);

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
  const canSeeBeyliveControl = canAccessBeyliveControl(profile, item);
  const joinedEntryCount = joined.length;
  const full = joinedEntryCount >= item.max_players;
  const hostRegisterSelectedPlayer = hostRegisterProfile
    ? players.find((player) => player.user_id === hostRegisterProfile.id)
    : null;
  const hostRegisterFullBlocked = !!hostRegisterProfile && !hostRegisterSelectedPlayer && full;
  const formatLabel = formats.find((f) => f.key === item.format)?.label ?? item.format;
  const detailEventType = inferTournamentEventType(item);
  const detailRegistrationConfig = registrationConfigForEventType(
    normalizeTournamentRegistrationConfig(item.registration_config),
    detailEventType,
  );
  const detailEntrantLabel =
    tournamentUsesTeamEntrants(detailEventType, item.format)
      ? t.formatEntrantsTeams
      : undefined;
  const poolEntrantLabel = detailEntrantLabel ? "teams" : "players";
  const poolPlacedLabel = detailEntrantLabel ? "any team" : "anyone";
  const editEventType: TournamentEventType = format === "partner" ? "team" : eventType;
  const editEntrantLabel =
    tournamentUsesTeamEntrants(editEventType, format)
      ? t.formatEntrantsTeams
      : undefined;
  const maxPlayersNumber = Number(maxPlayers) || 16;
  const targetScoreNumber = Number(targetScore) || 4;
  const stadiumCountNumber = Math.max(1, Math.min(16, Number(stadiumCount) || 2));
  const savedGroupStageSettings =
    item.format === "group_stage"
      ? tournamentGroupStageSettings(item.format_config, item.format, item.max_players, item.target_score ?? 4)
      : null;
  const savedSwissStageSettings =
    item.format === "swiss"
      ? tournamentSwissStageSettings(item.format_config, item.format, item.max_players, item.target_score ?? 4)
      : null;
  const poolStageSettings = savedGroupStageSettings ?? savedSwissStageSettings;
  const poolStageGroupCount = poolStageSettings?.groups ?? 8;
  const poolStageAdvanceCount = poolStageSettings?.advanceCount ?? 16;
  const poolStageMinPlayers = poolStageSettings?.minPlayers ?? 16;
  const poolNumbers = Array.from({ length: poolStageGroupCount }, (_, i) => i + 1);
  const hasPoolStageSetup =
    item.status === "open" &&
    (item.format === "group_stage" || (item.format === "swiss" && poolStageGroupCount > 1));

  const changeEventType = (next: TournamentEventType) => {
    setEventType(next);
    setRegistrationConfig((current) => registrationConfigForEventType(current, next));
  };

  const changeFormat = (next: TournamentFormat) => {
    setFormat(next);
    if (next === "partner") {
      changeEventType("team");
    }
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

  const leave = async () => {
    if (!supabase || !profile) return;
    if (!window.confirm(t.leaveConfirm)) return;
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
    setCsvImportMessage(null);
    const { error: err } = await supabase.rpc("add_tournament_walkin", { tid: item?.id, p_name: cleanName });
    setRosterBusy(false);
    if (err) {
      setRosterError(err.message.replace(/_/g, " "));
      return;
    }
    setWalkinName("");
    load();
  };

  const importWalkinCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || !supabase || !isHost || !item) return;

    setRosterError(null);
    setCsvImportMessage(null);

    if (!file.name.toLowerCase().endsWith(".csv") && file.type && !file.type.includes("csv")) {
      setRosterError("Upload a CSV file.");
      return;
    }

    let parsed: ReturnType<typeof parseWalkinCsv>;
    try {
      parsed = parseWalkinCsv(await file.text());
    } catch {
      setRosterError("Could not read the CSV file.");
      return;
    }

    if (parsed.names.length === 0) {
      setRosterError(parsed.errors[0] ?? "No player names found in the CSV.");
      return;
    }

    setRosterBusy(true);
    setCsvImportMessage(`Importing ${parsed.names.length} player${parsed.names.length === 1 ? "" : "s"}...`);
    const failures: string[] = [];
    let imported = 0;

    setCsvImporting(true);
    try {
      for (const name of parsed.names) {
        const { error: err } = await supabase.rpc("add_tournament_walkin", { tid: item.id, p_name: name });
        if (err) failures.push(`${name}: ${err.message.replace(/_/g, " ")}`);
        else imported += 1;
      }
    } catch {
      failures.push("CSV import stopped. Try again.");
    } finally {
      setRosterBusy(false);
      setCsvImporting(false);
    }

    if (imported > 0) await load();

    const skippedText =
      parsed.skipped > 0
        ? ` Skipped ${parsed.skipped} blank or invalid row${parsed.skipped === 1 ? "" : "s"}.`
        : "";
    setCsvImportMessage(
      imported > 0
        ? `Imported ${imported}/${parsed.names.length} player${parsed.names.length === 1 ? "" : "s"}. SPX IDs were assigned automatically.${skippedText}`
        : null,
    );

    const validationErrors = parsed.errors.slice(0, 3);
    const importErrors = failures.slice(0, 3);
    const hiddenErrors = Math.max(0, parsed.errors.length + failures.length - validationErrors.length - importErrors.length);
    if (validationErrors.length > 0 || importErrors.length > 0) {
      setRosterError(
        [...validationErrors, ...importErrors, hiddenErrors ? `${hiddenErrors} more row${hiddenErrors === 1 ? "" : "s"} failed.` : ""]
          .filter(Boolean)
          .join(" "),
      );
    }
  };

  const removePlayer = async (userId: string) => {
    if (!supabase || !isHost || !item) return;
    setRosterBusy(true);
    setRosterError(null);
    setCsvImportMessage(null);
    const { error: err } = await supabase.rpc("remove_tournament_player", { tid: item.id, p_user_id: userId });
    setRosterBusy(false);
    if (err) setRosterError(err.message.replace(/_/g, " "));
    else load();
  };

  const drawPools = async () => {
    if (!supabase || !isHost || !item) return;
    setRosterBusy(true);
    setRosterError(null);
    setCsvImportMessage(null);
    const { error: err } = await supabase.rpc("draw_group_stage_pools", { tid: item.id });
    setRosterBusy(false);
    if (err) setRosterError(err.message.replace(/_/g, " "));
    else load();
  };

  const setPlayerPool = async (userId: string, poolNo: number | null) => {
    if (!supabase || !isHost || !item) return;
    setRosterBusy(true);
    setRosterError(null);
    setCsvImportMessage(null);
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
        event_type: editEventType,
        format_config: tournamentFormatConfigForSave(formatConfig, format, maxPlayersNumber, targetScoreNumber),
        max_players: Number(maxPlayers) || 16,
        target_score: targetScoreNumber,
        beylive_stadium_count: stadiumCountNumber,
        registration_config: tournamentRegistrationConfigForSave(
          registrationConfigForEventType(registrationConfig, editEventType),
        ),
        note: note.trim() || null,
      })
      .eq("id", item.id);
    setBusy(false);
    if (err) {
      setError(err.message ? err.message.replace(/_/g, " ") : t.hostError);
      return;
    }
    setEditing(false);
    load();
  };

  const fillHostRegistrationForm = (
    target: Profile,
    registration: TournamentRegistration | null,
  ) => {
    setHostRegisterProfile(target);
    setHostRegisterExisting(registration);
    setHostRegisterEmail(registration?.email ?? "");
    setHostRegisterContactNumber(registration?.contact_number ?? "");
    setHostRegisterTeamName(registration?.team_name ?? "");
    setHostRegisterProofFile(null);
    setHostRegisterCustomAnswers(
      Object.fromEntries(
        detailRegistrationConfig.customFields.map((field) => [
          field.id,
          registration?.custom_answers?.[field.id] ?? "",
        ]),
      ),
    );
  };

  const readHostRegistration = async (targetId: string) => {
    if (!supabase) return null;
    const { data } = await supabase
      .from("tournament_registrations")
      .select("*, profile:profiles!tournament_registrations_user_id_fkey(*)")
      .eq("tournament_id", item.id)
      .eq("user_id", targetId)
      .maybeSingle();
    return (data as unknown as TournamentRegistration | null) ?? null;
  };

  const clearHostRegistrationSelection = () => {
    setHostRegisterProfile(null);
    setHostRegisterExisting(null);
    setHostRegisterEmail("");
    setHostRegisterContactNumber("");
    setHostRegisterTeamName("");
    setHostRegisterProofFile(null);
    setHostRegisterCustomAnswers({});
  };

  const selectHostRegistrationPlayer = async (target: Profile) => {
    if (target.is_walkin || target.admin_deleted_at) {
      setHostRegisterError(t.registrationPlayerInvalid);
      return;
    }

    setHostRegisterBusy(true);
    setHostRegisterError(null);
    setHostRegisterSuccess(null);
    const registration = await readHostRegistration(target.id);
    fillHostRegistrationForm(target, registration);
    setHostRegisterQuery(target.player_code || `@${target.handle}`);
    setHostRegisterMatches([]);
    setHostRegisterBusy(false);
  };

  const findHostRegistrationPlayer = async () => {
    const client = supabase;
    if (!client || !isHost) return;
    const raw = hostRegisterQuery.trim();
    if (!raw) {
      setHostRegisterError(t.registrationPlayerRequired);
      return;
    }

    setHostRegisterBusy(true);
    setHostRegisterError(null);
    setHostRegisterSuccess(null);
    clearHostRegistrationSelection();

    const term = raw
      .replace(/^@/, "")
      .replace(/[,%()]/g, " ")
      .trim()
      .replace(/\s+/g, "%");
    if (!term) {
      setHostRegisterBusy(false);
      setHostRegisterError(t.registrationPlayerRequired);
      return;
    }
    const pattern = `%${term}%`;
    const { data, error: searchError } = await client
      .from("profiles")
      .select("*")
      .or(`player_code.ilike.${pattern},handle.ilike.${pattern},display_name.ilike.${pattern}`)
      .eq("is_walkin", false)
      .is("admin_deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(50);

    const matches = ((data as unknown as Profile[] | null) ?? []).filter(
      (target) => !target.is_walkin && !target.admin_deleted_at,
    );
    setHostRegisterBusy(false);

    if (searchError || matches.length === 0) {
      setHostRegisterMatches([]);
      setHostRegisterError(t.registrationPlayerNotFound);
      return;
    }

    setHostRegisterMatches(matches);
  };

  const changeHostRegistrationProof = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    setHostRegisterProofFile(null);
    setHostRegisterError(null);
    if (!file) return;
    const problem = checkTournamentRegistrationProof(file);
    if (problem === "type") {
      setHostRegisterError(t.registrationProofTypeError);
      event.currentTarget.value = "";
      return;
    }
    if (problem === "size") {
      setHostRegisterError(t.registrationProofSizeError);
      event.currentTarget.value = "";
      return;
    }
    setHostRegisterProofFile(file);
  };

  const registrationRpcError = (message?: string) => {
    if (message === "tournament_full") return t.registrationFull;
    if (message === "payment_proof_required") {
      return t.registrationRequiredFieldError.replace("{field}", t.registrationPaymentProof);
    }
    if (message === "team_name_required") {
      return t.registrationRequiredFieldError.replace("{field}", t.registrationTeamName);
    }
    if (message === "blader_name_required") {
      return t.registrationRequiredFieldError.replace("{field}", t.registrationBladerName);
    }
    if (message?.startsWith("custom_field_required:")) {
      return t.registrationRequiredFieldError.replace(
        "{field}",
        message.slice("custom_field_required:".length) || t.registrationCustomFieldPlaceholder,
      );
    }
    if (message === "player_required") return t.registrationPlayerRequired;
    if (message === "profile_not_found") return t.registrationPlayerNotFound;
    if (message === "invalid_profile") return t.registrationPlayerInvalid;
    if (message === "registration_closed" || message === "tournament_not_open") return t.registrationClosed;
    return message ? message.replace(/_/g, " ") : t.hostError;
  };

  const submitHostRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !profile || !isHost || hostRegisterBusy) return;
    if (!hostRegisterProfile) {
      setHostRegisterError(t.registrationPlayerRequired);
      return;
    }
    const cleanBladerName = profileDisplayName(hostRegisterProfile, "").trim();
    const cleanTeamName = hostRegisterTeamName.trim();
    const cleanEmail = hostRegisterEmail.trim();
    const cleanContactNumber = hostRegisterContactNumber.trim();
    if (!cleanBladerName) {
      setHostRegisterError(t.registrationRequiredFieldError.replace("{field}", t.registrationBladerName));
      return;
    }
    if (detailRegistrationConfig.teamNameEnabled && !cleanTeamName) {
      setHostRegisterError(t.registrationRequiredFieldError.replace("{field}", t.registrationTeamName));
      return;
    }

    const answers = Object.fromEntries(
      detailRegistrationConfig.customFields.map((field) => [
        field.id,
        (hostRegisterCustomAnswers[field.id] ?? "").trim(),
      ]),
    );
    const missingCustomField = detailRegistrationConfig.customFields.find(
      (field) => field.required && !answers[field.id],
    );
    if (missingCustomField) {
      setHostRegisterError(t.registrationRequiredFieldError.replace("{field}", missingCustomField.label));
      return;
    }
    const existingPlayer = players.find((player) => player.user_id === hostRegisterProfile.id);
    if (!existingPlayer && full) {
      setHostRegisterError(t.registrationFull);
      return;
    }
    if (!hostRegisterProofFile) {
      setHostRegisterError(t.registrationRequiredFieldError.replace("{field}", t.registrationPaymentProof));
      return;
    }

    setHostRegisterBusy(true);
    setHostRegisterError(null);
    setHostRegisterSuccess(null);

    const ext = tournamentRegistrationProofExtension(hostRegisterProofFile);
    const proofPath = `${item.id}/${hostRegisterProfile.id}/host-${profile.id}-proof-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(TOURNAMENT_REGISTRATION_PROOF_BUCKET)
      .upload(proofPath, hostRegisterProofFile, {
        cacheControl: "31536000",
        contentType: hostRegisterProofFile.type,
        upsert: false,
      });
    if (uploadError) {
      setHostRegisterBusy(false);
      setHostRegisterError(`${t.registrationProofUploadError} ${uploadError.message}`);
      return;
    }

    const { data, error: submitError } = await supabase.rpc("host_submit_tournament_registration", {
      tid: item.id,
      p_user_id: hostRegisterProfile.id,
      p_email: cleanEmail,
      p_contact_number: cleanContactNumber,
      p_team_name: detailRegistrationConfig.teamNameEnabled ? cleanTeamName : null,
      p_payment_proof_path: proofPath,
      p_custom_answers: answers,
    });

    if (submitError) {
      setHostRegisterBusy(false);
      setHostRegisterError(registrationRpcError(submitError.message));
      return;
    }

    const status = data === "waitlisted" ? t.hostYouWaitlisted : t.hostYouJoined;
    setHostRegisterSuccess(
      t.registrationHostSuccess
        .replace("{player}", profileDisplayName(hostRegisterProfile))
        .replace("{status}", status),
    );
    setHostRegisterProofFile(null);
    const updatedRegistration = await readHostRegistration(hostRegisterProfile.id);
    fillHostRegistrationForm(hostRegisterProfile, updatedRegistration);
    await load();
    setHostRegisterBusy(false);
  };

  const openProof = async (path: string | null) => {
    if (!supabase || !path) return;
    const { data, error: err } = await supabase.storage
      .from(TOURNAMENT_REGISTRATION_PROOF_BUCKET)
      .createSignedUrl(path, 10 * 60);
    if (err || !data?.signedUrl) {
      setRosterError("Could not open the payment proof.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const csvCell = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const exportRegistrations = () => {
    if (!item) return;
    const config = normalizeTournamentRegistrationConfig(item.registration_config);
    const customFields = config.customFields;
    const header = [
      "Submitted at",
      "Status",
      "Blader name",
      "SPX ID",
      "Email",
      "Contact number",
      "Team name",
      "Payment proof path",
      ...customFields.map((field) => field.label),
    ];
    const rows = registrations.map((registration) => [
      registration.created_at,
      registration.status,
      registration.blader_name,
      registration.profile?.player_code ?? "",
      registration.email,
      registration.contact_number,
      registration.team_name ?? "",
      registration.payment_proof_path ?? "",
      ...customFields.map((field) => registration.custom_answers?.[field.id] ?? ""),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${item.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tournament"}-registrations.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
        {canSeeBeyliveControl && (
          <Link href={`/${locale}/tournaments/${item.id}/control`} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
            BEYLIVE Control
          </Link>
        )}
        {isHost && (
          <>
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
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-dim">{t.hostEventType}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["player", "team"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeEventType(option)}
                  disabled={format === "partner" && option === "player"}
                  className={`rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    editEventType === option
                      ? "border-accent bg-accent/10"
                      : "border-edge bg-panel hover:border-accent/50"
                  }`}
                >
                  <div className={`text-sm font-semibold ${editEventType === option ? "text-accent" : "text-ink"}`}>
                    {option === "team" ? t.hostEventTypeTeam : t.hostEventTypePlayer}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-ink-dim">
                    {option === "team" ? t.hostEventTypeTeamDesc : t.hostEventTypePlayerDesc}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-dim">{t.hostEventTypeHelp}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostMaxPlayers}</label>
            <input type="number" min={2} max={256} value={maxPlayers} onChange={(e) => changeMaxPlayers(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostTargetScore}</label>
            <input type="number" min={1} max={30} value={targetScore} onChange={(e) => changeTargetScore(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.hostStadiumCount}</label>
            <input type="number" min={1} max={16} value={stadiumCount} onChange={(e) => setStadiumCount(e.target.value)} className={inputCls} required />
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
            entrantLabel={editEntrantLabel}
          />
          <TournamentRegistrationSettings
            value={registrationConfigForEventType(registrationConfig, editEventType)}
            onChange={(next) => setRegistrationConfig(registrationConfigForEventType(next, editEventType))}
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
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">{formatLabel}</span>
                <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-ink-dim">
                  {detailEventType === "team" ? t.hostEventTypeTeam : t.hostEventTypePlayer}
                </span>
              </div>
            </div>
            {item.note && <p className="mt-4 text-sm leading-relaxed text-ink-dim">{item.note}</p>}
            <TournamentFormatSummary
              value={item.format_config}
              format={item.format}
              maxPlayers={item.max_players}
              targetScore={item.target_score ?? 4}
              labels={t}
              entrantLabel={detailEntrantLabel}
            />
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
              <span className="rounded bg-panel px-2 py-0.5 text-accent">
                {t.hostJoined}: {joinedEntryCount}/{item.max_players}
              </span>
              {full && !mine && !isHost && item.status === "open" && (
                <span className="rounded bg-atk/10 px-2 py-0.5 text-atk">
                  {t.tournamentFull}
                </span>
              )}
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
              ) : item.status === "open" && full ? (
                <span className="clip-x border border-atk/40 bg-atk/10 px-4 py-2 font-display text-xs font-bold tracking-wider text-atk">
                  {t.tournamentFull}
                </span>
              ) : item.status === "open" ? (
                <Link href={`/${locale}/tournaments/${item.id}/register`} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
                  {t.registerTournament}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 font-display text-sm font-bold tracking-wider text-ink-dim">{t.lineup}</div>
            {isHost && item.status === "open" && item.format !== "partner" && (
              <div className="mb-3 grid gap-2">
                <form onSubmit={addWalkin} className="flex gap-2">
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
                <div className="rounded-md border border-edge bg-panel/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-display text-[10px] font-bold uppercase tracking-wider text-accent-2">
                      CSV mass upload
                    </div>
                    <a
                      href={WALKIN_CSV_TEMPLATE_PATH}
                      download
                      className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-accent"
                    >
                      Template
                    </a>
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-edge bg-bg px-3 py-2 text-xs font-semibold text-ink-dim transition hover:border-accent hover:text-accent">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={importWalkinCsv}
                      disabled={rosterBusy}
                      className="sr-only"
                    />
                    {csvImporting ? "Importing..." : "Upload CSV"}
                  </label>
                  <p className="mt-2 text-[10px] leading-relaxed text-ink-dim">
                    Use a CSV with a name column. Leave player ID blank; SPX IDs are assigned automatically.
                  </p>
                </div>
              </div>
            )}
            {rosterError && <p className="mb-2 text-xs font-semibold text-atk">{rosterError}</p>}
            {csvImportMessage && <p className="mb-2 text-xs font-semibold text-accent">{csvImportMessage}</p>}
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
                      {(item.format === "group_stage" || item.format === "swiss") && p.pool_no != null && (
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

        {isHost && (
          <div className="panel mt-6 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display text-sm font-bold tracking-wider text-ink-dim">
                  {t.registrationListTitle}
                </div>
                <p className="mt-1 text-xs text-ink-dim">{t.registrationListIntro}</p>
              </div>
              <button
                onClick={exportRegistrations}
                disabled={registrations.length === 0}
                className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:border-accent/60 disabled:opacity-50"
              >
                {t.registrationExportCsv}
              </button>
            </div>

            <form onSubmit={submitHostRegistration} className="mb-5 border-b border-edge pb-5">
              <div className="mb-3">
                <div className="font-display text-xs font-bold uppercase tracking-wider text-accent">
                  {t.registrationHostOnBehalfTitle}
                </div>
                <p className="mt-1 text-xs text-ink-dim">{t.registrationHostOnBehalfIntro}</p>
              </div>

              {hostRegisterSuccess && (
                <p className="mb-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">
                  {hostRegisterSuccess}
                </p>
              )}
              {hostRegisterError && (
                <p className="mb-3 rounded-md border border-atk/40 bg-atk/10 px-3 py-2 text-xs font-semibold text-atk">
                  {hostRegisterError}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-xs text-ink-dim">{t.registrationPlayerSearch}</label>
                  <input
                    value={hostRegisterQuery}
                    onChange={(e) => {
                      const nextQuery = e.target.value;
                      const selectedQuery = hostRegisterProfile
                        ? hostRegisterProfile.player_code || `@${hostRegisterProfile.handle}`
                        : "";
                      setHostRegisterQuery(nextQuery);
                      setHostRegisterMatches([]);
                      if (hostRegisterProfile && nextQuery.trim() !== selectedQuery) {
                        clearHostRegistrationSelection();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void findHostRegistrationPlayer();
                      }
                    }}
                    className={inputCls}
                    placeholder="SPX-0001 or @handle"
                  />
                </div>
                <button
                  type="button"
                  onClick={findHostRegistrationPlayer}
                  disabled={hostRegisterBusy}
                  className="clip-x self-end border border-edge bg-panel-2 px-4 py-2.5 font-display text-xs font-bold tracking-wider text-accent transition hover:border-accent/60 disabled:opacity-50"
                >
                  {t.registrationFindPlayer}
                </button>
              </div>

              {hostRegisterMatches.length > 0 && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-ink-dim">{t.registrationPlayerResults}</label>
                  <select
                    value={hostRegisterProfile?.id ?? ""}
                    onChange={(e) => {
                      const target = hostRegisterMatches.find((match) => match.id === e.target.value);
                      if (target) void selectHostRegistrationPlayer(target);
                    }}
                    className={inputCls}
                  >
                    <option value="">{t.registrationSelectPlayer}</option>
                    {hostRegisterMatches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {(match.player_code ? `${match.player_code} / ` : "")}
                        {profileDisplayName(match)} / @{match.handle}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hostRegisterProfile && (
                <div className="mt-4 grid gap-3">
                  <div className="border-l-2 border-accent pl-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">
                      {t.registrationSelectedPlayer}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-ink">
                      {profileDisplayName(hostRegisterProfile)}
                      {hostRegisterProfile.player_code && (
                        <span className="ml-2 font-mono text-[10px] text-accent-2">
                          {hostRegisterProfile.player_code}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-dim">@{hostRegisterProfile.handle}</div>
                    {hostRegisterFullBlocked && (
                      <div className="mt-2 text-xs font-semibold text-atk">{t.registrationFull}</div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-ink-dim">{t.registrationEmail}</label>
                      <input
                        type="email"
                        value={hostRegisterEmail}
                        onChange={(e) => setHostRegisterEmail(e.target.value)}
                        className={inputCls}
                        required
                        maxLength={254}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-dim">{t.registrationBladerName}</label>
                      <input value={profileDisplayName(hostRegisterProfile)} className={`${inputCls} text-ink-dim`} readOnly />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-dim">{t.registrationContactNumber}</label>
                      <input
                        value={hostRegisterContactNumber}
                        onChange={(e) => setHostRegisterContactNumber(e.target.value)}
                        className={inputCls}
                        required
                        maxLength={32}
                      />
                    </div>
                    {detailRegistrationConfig.teamNameEnabled && (
                      <div>
                        <label className="mb-1 block text-xs text-ink-dim">{t.registrationTeamName}</label>
                        <input
                          value={hostRegisterTeamName}
                          onChange={(e) => setHostRegisterTeamName(e.target.value)}
                          className={inputCls}
                          required
                          maxLength={100}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs text-ink-dim">{t.registrationPaymentProof}</label>
                      <input
                        type="file"
                        accept={TOURNAMENT_REGISTRATION_PROOF_ACCEPT}
                        onChange={changeHostRegistrationProof}
                        className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-bold file:text-bg`}
                        required
                      />
                      <p className="mt-1 text-[11px] text-ink-dim">
                        {hostRegisterExisting?.payment_proof_path
                          ? t.registrationExistingProof
                          : t.registrationPaymentProofHint}
                      </p>
                    </div>
                    {detailRegistrationConfig.customFields.map((field) => (
                      <div key={field.id}>
                        <label className="mb-1 block text-xs text-ink-dim">{field.label}</label>
                        <input
                          value={hostRegisterCustomAnswers[field.id] ?? ""}
                          onChange={(e) =>
                            setHostRegisterCustomAnswers((current) => ({
                              ...current,
                              [field.id]: e.target.value,
                            }))
                          }
                          className={inputCls}
                          required={field.required}
                          maxLength={160}
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={hostRegisterBusy || hostRegisterFullBlocked}
                    className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                  >
                    {hostRegisterBusy
                      ? t.registrationSubmitting
                      : hostRegisterExisting
                        ? t.registrationHostUpdate
                        : t.registrationHostSubmit}
                  </button>
                </div>
              )}
            </form>

            {registrations.length === 0 ? (
              <p className="text-sm text-ink-dim">{t.registrationNoSubmissions}</p>
            ) : (
              <div className="grid gap-3">
                {registrations.map((registration) => (
                  <div key={registration.id} className="rounded-md border border-edge bg-panel p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">
                          {registration.blader_name}
                          {registration.profile?.player_code && (
                            <span className="ml-2 font-mono text-[10px] text-accent-2">
                              {registration.profile.player_code}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-ink-dim">
                          {registration.email} / {registration.contact_number}
                        </div>
                        {registration.team_name && (
                          <div className="mt-1 text-xs font-semibold text-accent">
                            {t.registrationTeamName}: {registration.team_name}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {registration.payment_proof_path ? (
                          <button
                            onClick={() => openProof(registration.payment_proof_path)}
                            className="clip-x border border-accent/50 bg-accent/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent transition hover:bg-accent/20"
                          >
                            {t.registrationViewProof}
                          </button>
                        ) : (
                          <span className="rounded bg-bg px-2 py-1 text-[10px] font-semibold text-ink-dim">
                            {t.registrationNoProof}
                          </span>
                        )}
                      </div>
                    </div>
                    {detailRegistrationConfig.customFields.length > 0 && (
                      <dl className="mt-3 grid gap-2 border-t border-edge pt-3 sm:grid-cols-2 lg:grid-cols-3">
                        {detailRegistrationConfig.customFields.map((field) => (
                          <div key={field.id} className="rounded bg-bg px-2 py-1.5">
                            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">
                              {field.label}
                            </dt>
                            <dd className="mt-0.5 text-xs text-ink">
                              {registration.custom_answers?.[field.id] || "-"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {hasPoolStageSetup && (
          <div className="panel mt-6 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-display text-sm font-bold tracking-wider text-ink-dim">Pools</div>
                <p className="mt-1 text-xs text-ink-dim">
                  Splits joined {poolEntrantLabel} into {poolStageGroupCount} pools and advances {poolStageAdvanceCount} {poolEntrantLabel} to the top cut. Safe to
                  re-draw after adding more {poolEntrantLabel} — {poolPlacedLabel} already placed (including hand-moved {poolEntrantLabel}) stays put.
                </p>
              </div>
              {isHost && (
                <button
                  onClick={drawPools}
                  disabled={rosterBusy || joined.length < poolStageMinPlayers}
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
                {joined.length < poolStageMinPlayers
                  ? `Need at least ${poolStageMinPlayers} joined ${poolEntrantLabel} to draw ${poolStageGroupCount} pools (${joined.length}/${poolStageMinPlayers}).`
                  : `No pools drawn yet - click "Draw pools" to split the lineup into ${poolStageGroupCount} groups.`}
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
