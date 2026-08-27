"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { displayMyPhone } from "@/lib/phone";
import { profileDisplayName } from "@/lib/profileName";
import {
  CommunityTournament,
  supabase,
  TournamentRegistration,
} from "@/lib/supabase";
import {
  checkTournamentRegistrationProof,
  normalizeTournamentRegistrationConfig,
  tournamentRegistrationProofExtension,
  TOURNAMENT_REGISTRATION_PROOF_ACCEPT,
  TOURNAMENT_REGISTRATION_PROOF_BUCKET,
} from "@/lib/tournamentRegistration";
import { inferTournamentEventType, registrationConfigForEventType } from "@/lib/tournamentEvent";
import { tournamentLookupColumn, tournamentPath } from "@/lib/tournamentRouting";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const TOURNAMENT_SELECT =
  "*, host_profile:profiles!tournaments_host_fkey(*), players:tournament_players(*, profile:profiles!tournament_players_user_id_fkey(*))";
const REGISTRATION_DRAFT_VERSION = 1;

type RegistrationDraftValues = {
  email: string;
  contactNumber: string;
  teamName: string;
  customAnswers: Record<string, string>;
  proofFileName: string | null;
};

type RegistrationDraft = RegistrationDraftValues & {
  version: typeof REGISTRATION_DRAFT_VERSION;
  tournamentId: string;
  profileId: string;
  savedAt: number;
};

function registrationDraftKey(tournamentId: string, profileId: string) {
  return `spindex.tournament-registration-draft.${tournamentId}.${profileId}`;
}

function cleanDraftAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function readRegistrationDraft(tournamentId: string, profileId: string): RegistrationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(registrationDraftKey(tournamentId, profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrationDraft>;
    if (
      parsed.version !== REGISTRATION_DRAFT_VERSION ||
      parsed.tournamentId !== tournamentId ||
      parsed.profileId !== profileId ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    return {
      version: REGISTRATION_DRAFT_VERSION,
      tournamentId,
      profileId,
      email: typeof parsed.email === "string" ? parsed.email : "",
      contactNumber: typeof parsed.contactNumber === "string" ? parsed.contactNumber : "",
      teamName: typeof parsed.teamName === "string" ? parsed.teamName : "",
      customAnswers: cleanDraftAnswers(parsed.customAnswers),
      proofFileName: typeof parsed.proofFileName === "string" ? parsed.proofFileName : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function writeRegistrationDraft(draft: RegistrationDraft) {
  try {
    window.localStorage.setItem(registrationDraftKey(draft.tournamentId, draft.profileId), JSON.stringify(draft));
  } catch {
    /* local draft storage unavailable */
  }
}

function clearRegistrationDraft(tournamentId: string, profileId: string) {
  try {
    window.localStorage.removeItem(registrationDraftKey(tournamentId, profileId));
  } catch {
    /* local draft storage unavailable */
  }
}

function hasRegistrationDraftContent(values: RegistrationDraftValues) {
  return (
    !!values.email.trim() ||
    !!values.contactNumber.trim() ||
    !!values.teamName.trim() ||
    !!values.proofFileName ||
    Object.values(values.customAnswers).some((answer) => answer.trim())
  );
}

function registrationDraftValuesEqual(a: RegistrationDraftValues, b: RegistrationDraftValues) {
  if (
    a.email !== b.email ||
    a.contactNumber !== b.contactNumber ||
    a.teamName !== b.teamName ||
    a.proofFileName !== b.proofFileName
  ) {
    return false;
  }
  const keys = new Set([...Object.keys(a.customAnswers), ...Object.keys(b.customAnswers)]);
  return [...keys].every((key) => (a.customAnswers[key] ?? "") === (b.customAnswers[key] ?? ""));
}

function fmtWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TournamentRegistrationClient({
  id,
  locale,
  dict,
}: {
  id: string;
  locale: Locale;
  dict: Dict;
}) {
  const router = useRouter();
  const { enabled, profile, session } = useAuth();
  const t = dict.tournaments;
  const [item, setItem] = useState<CommunityTournament | null>(null);
  const [existing, setExisting] = useState<TournamentRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [teamName, setTeamName] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftProofFileName, setDraftProofFileName] = useState<string | null>(null);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const draftBaselineRef = useRef<RegistrationDraftValues | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setDraftReady(false);
    setDraftRestored(false);
    setDraftSavedAt(null);
    setDraftProofFileName(null);
    const lookupColumn = tournamentLookupColumn(id);
    const { data, error: tournamentError } = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq(lookupColumn, id)
      .maybeSingle();
    setLoading(false);
    if (tournamentError) {
      setError(t.hostError);
      return;
    }

    const next = (data as unknown as CommunityTournament | null) ?? null;
    setItem(next);
    if (!next || !profile) {
      setExisting(null);
      return;
    }

    const { data: regData } = await supabase
      .from("tournament_registrations")
      .select("*, profile:profiles!tournament_registrations_user_id_fkey(*)")
      .eq("tournament_id", next.id)
      .eq("user_id", profile.id)
      .maybeSingle();
    const registration = (regData as unknown as TournamentRegistration | null) ?? null;
    const config = registrationConfigForEventType(
      normalizeTournamentRegistrationConfig(next.registration_config),
      inferTournamentEventType(next),
    );
    const phone = session?.user.phone ? displayMyPhone(session.user.phone) : "";
    const defaultAnswers = Object.fromEntries(
      config.customFields.map((field) => [
        field.id,
        registration?.custom_answers?.[field.id] ?? "",
      ]),
    );
    const baseline: RegistrationDraftValues = {
      email: registration?.email ?? session?.user.email ?? "",
      contactNumber: registration?.contact_number ?? phone,
      teamName: registration?.team_name ?? "",
      customAnswers: defaultAnswers,
      proofFileName: null,
    };
    const draft = readRegistrationDraft(next.id, profile.id);
    const registrationUpdatedAt = registration?.updated_at ? Date.parse(registration.updated_at) || 0 : 0;
    const restoreDraft = !!draft && draft.savedAt > registrationUpdatedAt && hasRegistrationDraftContent(draft);
    const restoredAnswers = Object.fromEntries(
      config.customFields.map((field) => [
        field.id,
        restoreDraft ? draft?.customAnswers[field.id] ?? defaultAnswers[field.id] ?? "" : defaultAnswers[field.id] ?? "",
      ]),
    );

    draftBaselineRef.current = baseline;
    setExisting(registration);
    setEmail(restoreDraft ? draft?.email ?? baseline.email : baseline.email);
    setContactNumber(restoreDraft ? draft?.contactNumber ?? baseline.contactNumber : baseline.contactNumber);
    setTeamName(restoreDraft ? draft?.teamName ?? baseline.teamName : baseline.teamName);
    setCustomAnswers(restoredAnswers);
    setDraftRestored(restoreDraft);
    setDraftSavedAt(restoreDraft ? draft?.savedAt ?? null : null);
    setDraftProofFileName(restoreDraft ? draft?.proofFileName ?? null : null);
    setDraftReady(true);
  }, [id, profile, session?.user.email, session?.user.phone, t.hostError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!draftReady || !item?.id || !profile?.id) return;
    const current: RegistrationDraftValues = {
      email,
      contactNumber,
      teamName,
      customAnswers,
      proofFileName: draftProofFileName,
    };
    const baseline = draftBaselineRef.current;
    if (!hasRegistrationDraftContent(current) || (baseline && registrationDraftValuesEqual(current, baseline))) {
      clearRegistrationDraft(item.id, profile.id);
      setDraftSavedAt(null);
      return;
    }
    const savedAt = Date.now();
    writeRegistrationDraft({
      version: REGISTRATION_DRAFT_VERSION,
      tournamentId: item.id,
      profileId: profile.id,
      savedAt,
      ...current,
    });
    setDraftSavedAt(savedAt);
  }, [contactNumber, customAnswers, draftProofFileName, draftReady, email, item?.id, profile?.id, teamName]);

  const config = useMemo(
    () =>
      registrationConfigForEventType(
        normalizeTournamentRegistrationConfig(item?.registration_config),
        inferTournamentEventType(item),
      ),
    [item],
  );
  const players = item?.players ?? [];
  const mine = profile ? players.find((player) => player.user_id === profile.id) : null;
  const isHost = profile?.id === item?.host;
  const joinedCount = players.filter((player) => player.status === "joined").length;
  const isFull = item ? joinedCount >= item.max_players : false;

  const changeProof = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    setProofFile(null);
    setDraftProofFileName(null);
    setError(null);
    if (!file) return;
    const problem = checkTournamentRegistrationProof(file);
    if (problem === "type") {
      setError(t.registrationProofTypeError);
      event.currentTarget.value = "";
      return;
    }
    if (problem === "size") {
      setError(t.registrationProofSizeError);
      event.currentTarget.value = "";
      return;
    }
    setProofFile(file);
    setDraftProofFileName(file.name);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !profile || !item || busy) return;

    const cleanEmail = email.trim();
    const cleanContactNumber = contactNumber.trim();
    const cleanBladerName = profileDisplayName(profile, "").trim();
    const cleanTeamName = teamName.trim();
    if (!cleanBladerName) {
      setError(t.registrationRequiredFieldError.replace("{field}", t.registrationBladerName));
      return;
    }
    if (config.teamNameEnabled && config.teamNameRequired && !cleanTeamName) {
      setError(t.registrationRequiredFieldError.replace("{field}", t.registrationTeamName));
      return;
    }
    if (!proofFile) {
      setError(t.registrationRequiredFieldError.replace("{field}", t.registrationPaymentProof));
      return;
    }

    const answers = Object.fromEntries(
      config.customFields.map((field) => [field.id, (customAnswers[field.id] ?? "").trim()]),
    );
    const missingCustomField = config.customFields.find(
      (field) => field.required && !answers[field.id],
    );
    if (missingCustomField) {
      setError(t.registrationRequiredFieldError.replace("{field}", missingCustomField.label));
      return;
    }
    if (!mine && joinedCount >= item.max_players) {
      setError(t.registrationFull);
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    const ext = tournamentRegistrationProofExtension(proofFile);
    const proofPath = `${item.id}/${profile.id}/proof-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(TOURNAMENT_REGISTRATION_PROOF_BUCKET)
      .upload(proofPath, proofFile, {
        cacheControl: "31536000",
        contentType: proofFile.type,
        upsert: false,
      });
    if (uploadError) {
      setBusy(false);
      setError(`${t.registrationProofUploadError} ${uploadError.message}`);
      return;
    }

    const { data, error: submitError } = await supabase.rpc("submit_tournament_registration", {
      tid: item.id,
      p_email: cleanEmail,
      p_contact_number: cleanContactNumber,
      p_team_name: config.teamNameEnabled ? cleanTeamName : null,
      p_payment_proof_path: proofPath,
      p_custom_answers: answers,
    });

    setBusy(false);
    if (submitError) {
      setError(
        submitError.message === "tournament_full"
          ? t.registrationFull
          : submitError.message === "payment_proof_required"
            ? t.registrationRequiredFieldError.replace("{field}", t.registrationPaymentProof)
          : submitError.message === "team_name_required"
            ? t.registrationRequiredFieldError.replace("{field}", t.registrationTeamName)
          : submitError.message === "blader_name_required"
            ? t.registrationRequiredFieldError.replace("{field}", t.registrationBladerName)
          : submitError.message?.startsWith("custom_field_required:")
            ? t.registrationRequiredFieldError.replace(
                "{field}",
                submitError.message.slice("custom_field_required:".length) || t.registrationCustomFieldPlaceholder,
              )
          : submitError.message
            ? submitError.message.replace(/_/g, " ")
            : t.hostError,
      );
      return;
    }

    const status = data === "waitlisted" ? t.hostYouWaitlisted : t.hostYouJoined;
    setSuccess(t.registrationSubmitted.replace("{status}", status));
    clearRegistrationDraft(item.id, profile.id);
    setDraftReady(false);
    setDraftRestored(false);
    setDraftSavedAt(null);
    setDraftProofFileName(null);
    setProofFile(null);
    await load();
    window.setTimeout(() => {
      router.push(tournamentPath(locale, item, "", id));
    }, 1000);
  };

  if (!enabled) {
    return <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">{dict.auth.notConfigured}</div>;
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-dim">{dict.admin.loading}</p>;
  if (!item) return <p className="py-16 text-center text-sm text-ink-dim">{t.notFound}</p>;
  const detailPath = tournamentPath(locale, item, "", id);
  const draftProofLabel = draftProofFileName ? ` (${draftProofFileName})` : "";

  if (!profile) {
    return (
      <div>
        <Link href={detailPath} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          {t.back}
        </Link>
        <div className="panel mt-5 p-5">
          <h1 className="font-display text-2xl font-bold tracking-wide">{t.registrationTitle}</h1>
          <p className="mt-2 text-sm text-ink-dim">{t.registrationLoginRequired}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/${locale}/register`} className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition hover:brightness-110">
              {dict.auth.register}
            </Link>
            <Link href={`/${locale}/login`} className="clip-x border border-edge bg-panel-2 px-4 py-2 font-display text-xs font-bold tracking-wider text-accent transition hover:border-accent/60">
              {dict.auth.login}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isHost) {
    return (
      <div>
        <Link href={detailPath} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          {t.back}
        </Link>
        <div className="panel mt-5 p-5">
          <h1 className="font-display text-2xl font-bold tracking-wide">{item.name}</h1>
          <p className="mt-2 text-sm text-ink-dim">{t.registrationHostHint}</p>
        </div>
      </div>
    );
  }

  if (!config.enabled || item.status !== "open" || (isFull && !mine)) {
    return (
      <div>
        <Link href={detailPath} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          {t.back}
        </Link>
        <div className="panel mt-5 p-5">
          <h1 className="font-display text-2xl font-bold tracking-wide">{item.name}</h1>
          <p className="mt-2 text-sm text-ink-dim">{isFull && !mine ? t.registrationFull : t.registrationClosed}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={detailPath} className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink">
          {t.back}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <h1 className="font-display text-2xl font-bold tracking-wide">{item.name}</h1>
          <p className="mt-1 text-sm text-ink-dim">
            {item.city} / {item.venue} / {fmtWhen(item.starts_at, locale)}
          </p>
          <p className="mt-1 text-xs text-ink-dim">
            {t.hostedBy}: {profileDisplayName(item.host_profile)}
          </p>
          {item.note && <p className="mt-4 text-sm leading-relaxed text-ink-dim">{item.note}</p>}
          <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className="rounded bg-panel px-2 py-0.5 text-accent">
              {t.hostJoined}: {joinedCount}/{item.max_players}
            </span>
            {isFull && !mine && (
              <span className="rounded bg-atk/10 px-2 py-0.5 text-atk">
                {t.tournamentFull}
              </span>
            )}
            {mine && (
              <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">
                {mine.status === "joined" ? t.hostYouJoined : t.hostYouWaitlisted}
              </span>
            )}
          </div>

          <div className="mt-5 rounded-md border border-accent/30 bg-accent/10 p-4">
            <div className="font-display text-xs font-bold uppercase tracking-wider text-accent">
              {t.registrationPaymentDetails}
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
              {config.paymentInstructions}
            </p>
            <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-ink-dim">
              {config.paymentRemarkHint}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="panel grid gap-3 p-5">
          <div>
            <div className="font-display text-sm font-bold tracking-wider">{t.registrationTitle}</div>
            <p className="mt-1 text-xs text-ink-dim">{t.registrationIntro}</p>
            {draftReady && !success && (
              <p className="mt-2 rounded-md border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
                {draftRestored ? t.registrationDraftRestored : t.registrationDraftAutosave}
              </p>
            )}
            {draftSavedAt && !success && (
              <p className="mt-1 text-[11px] font-semibold text-accent-2">{t.registrationDraftSaved}</p>
            )}
          </div>

          {success && <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">{success}</p>}
          {error && <p className="rounded-md border border-atk/40 bg-atk/10 px-3 py-2 text-xs font-semibold text-atk">{error}</p>}

          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.registrationEmail}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required maxLength={254} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.registrationBladerName}</label>
            <input value={profileDisplayName(profile)} className={`${inputCls} text-ink-dim`} readOnly />
          </div>

          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.registrationContactNumber}</label>
            <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className={inputCls} required maxLength={32} />
          </div>

          {config.teamNameEnabled && (
            <div>
              <label className="mb-1 block text-xs text-ink-dim">{t.registrationTeamName}</label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className={inputCls}
                required={config.teamNameRequired}
                maxLength={100}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-ink-dim">{t.registrationPaymentProof}</label>
            <input
              type="file"
              accept={TOURNAMENT_REGISTRATION_PROOF_ACCEPT}
              onChange={changeProof}
              className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-bold file:text-bg`}
              required
            />
            <p className="mt-1 text-[11px] text-ink-dim">
              {existing?.payment_proof_path ? t.registrationExistingProof : t.registrationPaymentProofHint}
            </p>
            {draftRestored && !proofFile && (
              <p className="mt-1 text-[11px] font-semibold text-accent-2">
                {t.registrationDraftProofReminder.replace("{file}", draftProofLabel)}
              </p>
            )}
          </div>

          {config.customFields.map((field) => (
            <div key={field.id}>
              <label className="mb-1 block text-xs text-ink-dim">{field.label}</label>
              <input
                value={customAnswers[field.id] ?? ""}
                onChange={(e) => setCustomAnswers((current) => ({ ...current, [field.id]: e.target.value }))}
                className={inputCls}
                required={field.required}
                maxLength={160}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={busy}
            className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t.registrationSubmitting : existing ? t.registrationUpdate : t.registrationSubmit}
          </button>
        </form>
      </div>
    </div>
  );
}
