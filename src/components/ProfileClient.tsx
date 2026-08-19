"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { supabase, Match, MY_CITIES, Profile, ProfilePrivate, Round } from "@/lib/supabase";
import { profileDisplayName } from "@/lib/profileName";
import { beylivePlayerCode, beyliveQrValue } from "@/lib/beylive";
import { AVATAR_ACCEPT, AvatarImage, checkAvatarFile, uploadAvatar } from "@/lib/avatar";
import AvatarCropper from "./AvatarCropper";
import PasswordInput from "./PasswordInput";
import QrCodeBadge from "./QrCodeBadge";

const FINISH_COLOR: Record<string, string> = {
  spin: "var(--color-sta)",
  over: "var(--color-def)",
  burst: "var(--color-spc)",
  xtreme: "var(--color-atk)",
};

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2.5 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const labelCls = "mb-1 block text-xs font-semibold text-ink-dim";

function fmtDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function ageFromBirthday(birthday: string | null): number | null {
  if (!birthday) return null;
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function genderLabel(gender: ProfilePrivate["gender"], dict: Dict) {
  if (gender === "male") return dict.auth.genderMale;
  if (gender === "female") return dict.auth.genderFemale;
  return null;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="panel px-4 py-3 text-center">
      <div className={`font-display text-2xl font-bold ${accent ? "text-bal" : "text-accent"}`}>
        {value}
      </div>
      <div className="text-xs text-ink-dim">{label}</div>
    </div>
  );
}

export function ProfileHeader({
  p,
  priv = null,
  locale,
  dict,
  publicView = false,
}: {
  p: Profile;
  /** Owner-only demographics; only the /me page can load and pass these. */
  priv?: ProfilePrivate | null;
  locale: Locale;
  dict: Dict;
  /** Public player pages show only the handle and location — demographics stay private. */
  publicView?: boolean;
}) {
  const total = p.wins + p.losses;
  const rate = total > 0 ? Math.round((p.wins / total) * 100) : 0;
  const details = publicView
    ? [`@${p.handle}`, p.city].filter(Boolean)
    : [
        `@${p.handle}`,
        p.city,
        priv ? genderLabel(priv.gender, dict) : null,
        priv?.age != null ? `${dict.auth.age} ${priv.age}` : null,
        priv?.birthday ? `${dict.auth.birthday} ${fmtDate(priv.birthday, locale)}` : null,
        `${dict.battle.memberSince} ${fmtDate(p.created_at, locale)}`,
      ].filter(Boolean);

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/40 bg-panel font-display text-xl font-black text-accent">
          {p.avatar_url ? (
            <img
              src={p.avatar_url}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            p.handle.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-wide">
            {p.display_name || p.handle}
          </h1>
          <div className="text-sm text-ink-dim">{details.join(" / ")}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={dict.battle.starsBalance} value={`${p.stars} pts`} accent />
        <StatCard label={dict.exchange.diamonds} value={p.diamonds ?? 0} accent />
        <StatCard label={dict.exchange.goldBars} value={p.gold_bars ?? 0} />
        <StatCard label={dict.battle.wins} value={p.wins} />
        <StatCard label={dict.battle.losses} value={p.losses} />
        <StatCard label={dict.battle.winRate} value={`${rate}%`} />
      </div>
      <div className="panel mt-4 flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div className="font-display text-xs font-bold tracking-[0.28em] text-accent">
            BEYLIVE PLAYER ID
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-ink">{beylivePlayerCode(p)}</div>
          <p className="mt-1 text-xs text-ink-dim">
            Show this QR at tournament check-in or to a judge using phone camera scan.
          </p>
        </div>
        <QrCodeBadge value={beyliveQrValue(p)} label={beylivePlayerCode(p)} />
      </div>
    </div>
  );
}

export function MatchRow({
  m,
  perspectiveId,
  locale,
  dict,
}: {
  m: Match;
  perspectiveId: string;
  locale: Locale;
  dict: Dict;
}) {
  const iAmP1 = m.p1 === perspectiveId;
  const me = iAmP1 ? m.p1_profile : m.p2_profile;
  const opp = iAmP1 ? m.p2_profile : m.p1_profile;
  const myScore = iAmP1 ? m.p1_score : m.p2_score;
  const oppScore = iAmP1 ? m.p2_score : m.p1_score;
  const won = m.winner === perspectiveId;
  const rounds = (m.rounds ?? []) as Round[];
  const format = m.format ?? "single";
  const teamSize = m.team_size ?? 1;
  const targetScore = m.target_score ?? 4;
  const formatLabel =
    format === "team"
      ? dict.battle.teamFormat.replace("{count}", String(teamSize))
      : dict.battle.singleBattle;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-display text-sm font-black ${won ? "text-accent" : "text-atk"}`}
        >
          {won ? "W" : "L"} {myScore}:{oppScore}
        </span>
        <span className="text-sm text-ink-dim">
          vs{" "}
          <Link
            href={`/${locale}/players/${opp?.handle ?? ""}`}
            className="font-semibold text-ink hover:text-accent"
          >
            {profileDisplayName(opp)}
          </Link>
        </span>
        {m.status === "confirmed" && m.stars_moved != null && (
          <span className={`text-xs font-bold ${won ? "text-bal" : "text-ink-dim"}`}>
            {won ? `+${m.stars_moved} pts` : `-${m.stars_moved} pts`}
          </span>
        )}
        {m.status === "pending" && (
          <span className="rounded-full bg-accent-2/10 px-2 py-0.5 text-[10px] font-semibold text-accent-2">
            {dict.battle.statusPending}
          </span>
        )}
        <span className="ml-auto text-xs text-ink-dim">
          {fmtDate(m.created_at, locale)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded bg-accent-2/10 px-2 py-0.5 text-[10px] font-semibold text-accent-2">
          {formatLabel}
        </span>
        <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
          {dict.battle.firstToPoints.replace("{points}", String(targetScore))}
        </span>
      </div>
      {rounds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {rounds.map((r, i) => {
            const mine = (r.side === 1) === iAmP1;
            return (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 font-display text-[9px] font-bold"
                style={{
                  color: FINISH_COLOR[r.finish],
                  background: `color-mix(in srgb, ${FINISH_COLOR[r.finish]} ${mine ? 18 : 8}%, transparent)`,
                  opacity: mine ? 1 : 0.6,
                }}
              >
                {mine ? "+" : "·"}{r.pts}
              </span>
            );
          })}
        </div>
      )}
      <span className="sr-only">{me?.handle}</span>
    </div>
  );
}

function AccountSettings({
  profile,
  priv,
  dict,
  refreshProfile,
  refreshPriv,
}: {
  profile: Profile;
  priv: ProfilePrivate | null;
  dict: Dict;
  refreshProfile: () => Promise<void>;
  refreshPriv: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [city, setCity] = useState(profile.city ?? "");
  const [gender, setGender] = useState<ProfilePrivate["gender"] | "">(priv?.gender ?? "");
  const [birthday, setBirthday] = useState(priv?.birthday ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The picked file is kept so the framing can be redone from the original. */
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);

  useEffect(() => {
    setDisplayName(profile.display_name || "");
    setCity(profile.city ?? "");
    setGender(priv?.gender ?? "");
    setBirthday(priv?.birthday ?? "");
  }, [priv, profile.city, profile.display_name]);

  const pickAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setMessage(null);
    setError(null);
    const invalid = checkAvatarFile(file);
    if (invalid) {
      setError(invalid === "type" ? dict.profile.imageType : dict.profile.imageTooLarge);
      return;
    }
    setPhotoFile(file);
    setCropping(file);
  };

  const saveAvatar = async (image: AvatarImage) => {
    setCropping(null);
    if (!supabase) return;
    setPhotoBusy(true);
    const failure = await uploadAvatar(supabase, profile.id, image);
    setPhotoBusy(false);
    if (failure) {
      setError(failure === "upload" ? dict.profile.uploadFailed : dict.profile.updateFailed);
      return;
    }
    await refreshProfile();
    setMessage(dict.profile.updated);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const nextAge = ageFromBirthday(birthday);
    if (birthday && (nextAge == null || nextAge < 0 || nextAge > 120)) {
      setMessage(null);
      setError(dict.auth.birthdayInvalid);
      return;
    }
    setProfileBusy(true);
    setMessage(null);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        city: city || null,
      })
      .eq("id", profile.id);
    const { error: privError } = await supabase.from("profile_private").upsert({
      id: profile.id,
      gender: gender || null,
      birthday: birthday || null,
      age: nextAge,
    });

    setProfileBusy(false);
    if (updateError || privError) {
      setError(dict.profile.updateFailed);
      return;
    }
    await Promise.all([refreshProfile(), refreshPriv()]);
    setMessage(dict.profile.updated);
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setMessage(null);
    setError(null);
    if (newPassword.length < 8) {
      setError(dict.auth.passwordMin);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(dict.profile.passwordMismatch);
      return;
    }

    setPasswordBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setPasswordBusy(false);

    if (updateError) {
      setError(dict.profile.passwordFailed);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setMessage(dict.profile.passwordUpdated);
  };

  return (
    <section className="panel p-5">
      {cropping && (
        <AvatarCropper
          file={cropping}
          dict={dict}
          onCancel={() => setCropping(null)}
          onDone={saveAvatar}
        />
      )}
      <div className="mb-5">
        <h2 className="font-display text-lg font-bold tracking-wide">
          {dict.profile.title}
        </h2>
        <p className="mt-1 text-sm text-ink-dim">{dict.profile.subtitle}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-[12rem_1fr]">
        <div>
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border border-accent/40 bg-panel font-display text-3xl font-black text-accent">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              profile.handle.slice(0, 1).toUpperCase()
            )}
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-edge bg-panel px-3 py-2 font-display text-xs font-bold tracking-wider text-ink transition hover:border-accent hover:text-accent">
            <input
              type="file"
              accept={AVATAR_ACCEPT}
              onChange={pickAvatar}
              disabled={photoBusy}
              className="sr-only"
            />
            {photoBusy ? dict.profile.uploading : dict.profile.uploadPhoto}
          </label>
          {photoFile && (
            <button
              type="button"
              onClick={() => setCropping(photoFile)}
              disabled={photoBusy}
              className="ml-2 text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
            >
              {dict.profile.reposition}
            </button>
          )}
          <p className="mt-2 text-xs text-ink-dim">{dict.profile.photoHint}</p>
        </div>

        <div className="space-y-5">
          <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{dict.auth.bladerName}</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-ink-dim">
                {dict.auth.profileLink}: /players/{profile.handle}
              </p>
            </div>
            <div>
              <label className={labelCls}>{dict.auth.city}</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputCls}
              >
                <option value="">-</option>
                {MY_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{dict.auth.gender}</label>
              <select
                value={gender ?? ""}
                onChange={(e) => setGender(e.target.value as ProfilePrivate["gender"] | "")}
                className={inputCls}
              >
                <option value="">-</option>
                <option value="male">{dict.auth.genderMale}</option>
                <option value="female">{dict.auth.genderFemale}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{dict.auth.birthday}</label>
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{dict.auth.age}</label>
              <input
                value={ageFromBirthday(birthday) ?? ""}
                readOnly
                aria-readonly="true"
                placeholder={dict.auth.ageAuto}
                className={`${inputCls} text-ink-dim`}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={profileBusy}
                className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
              >
                {dict.profile.saveProfile}
              </button>
            </div>
          </form>

          <form
            onSubmit={resetPassword}
            className="grid gap-3 border-t border-edge pt-5 sm:grid-cols-2"
          >
            <div>
              <label className={labelCls}>{dict.profile.newPassword}</label>
              <PasswordInput
                dict={dict}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{dict.profile.confirmPassword}</label>
              <PasswordInput
                dict={dict}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={passwordBusy}
                className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition enabled:hover:text-accent disabled:opacity-50"
              >
                {dict.profile.resetPassword}
              </button>
            </div>
          </form>
        </div>
      </div>

      {(message || error) && (
        <p className={`mt-4 text-sm font-semibold ${error ? "text-atk" : "text-accent"}`}>
          {error ?? message}
        </p>
      )}
    </section>
  );
}

const MATCH_SELECT =
  "*, p1_profile:profiles!matches_p1_fkey(*), p2_profile:profiles!matches_p2_fkey(*)";

export function MeClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const router = useRouter();
  const { enabled, loading, profile, refreshProfile, signOut } = useAuth();
  const [pending, setPending] = useState<Match[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [priv, setPriv] = useState<ProfilePrivate | null>(null);
  const [busy, setBusy] = useState(false);
  const profileId = profile?.id ?? null;

  const loadPriv = useCallback(async () => {
    if (!supabase || !profileId) {
      setPriv(null);
      return;
    }
    const { data } = await supabase
      .from("profile_private")
      .select("*")
      .eq("id", profileId)
      .maybeSingle();
    setPriv((data as ProfilePrivate | null) ?? null);
  }, [profileId]);

  useEffect(() => {
    loadPriv();
  }, [loadPriv]);

  const load = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data: all } = await supabase
      .from("matches")
      .select(MATCH_SELECT)
      .or(`p1.eq.${profile.id},p2.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (all as unknown as Match[]) ?? [];
    setPending(
      list.filter((m) => m.status === "pending" && m.reported_by !== profile.id)
    );
    setMatches(list.filter((m) => m.status !== "rejected"));
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && enabled && !profile) router.replace(`/${locale}/login`);
  }, [loading, enabled, profile, router, locale]);

  if (!enabled) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        🚧 {dict.auth.notConfigured}
      </div>
    );
  }
  if (!profile) return null;

  const act = async (id: string, fn: "confirm_match" | "reject_match") => {
    if (!supabase) return;
    setBusy(true);
    await supabase.rpc(fn, { mid: id });
    await Promise.all([load(), refreshProfile()]);
    setBusy(false);
  };

  return (
    <div className="space-y-8">
      <ProfileHeader p={profile} priv={priv} locale={locale} dict={dict} />
      <AccountSettings
        profile={profile}
        priv={priv}
        dict={dict}
        refreshProfile={refreshProfile}
        refreshPriv={loadPriv}
      />

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold tracking-wide text-accent-2">
            ⏳ {dict.battle.pendingConfirm}
          </h2>
          <p className="mb-3 text-xs text-ink-dim">{dict.battle.confirmHint}</p>
          <div className="space-y-3">
            {pending.map((m) => (
              <div key={m.id}>
                <MatchRow m={m} perspectiveId={profile.id} locale={locale} dict={dict} />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => act(m.id, "confirm_match")}
                    disabled={busy}
                    className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                  >
                    ✓ {dict.battle.confirm}
                  </button>
                  <button
                    onClick={() => act(m.id, "reject_match")}
                    disabled={busy}
                    className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-atk transition disabled:opacity-50"
                  >
                    ✕ {dict.battle.reject}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-bold tracking-wide">
          {dict.battle.records}
        </h2>
        {matches.length === 0 ? (
          <p className="text-sm text-ink-dim">{dict.battle.noRecords}</p>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchRow key={m.id} m={m} perspectiveId={profile.id} locale={locale} dict={dict} />
            ))}
          </div>
        )}
      </section>

      <button
        onClick={async () => {
          await signOut();
          router.push(`/${locale}`);
        }}
        className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-atk"
      >
        {dict.auth.logout}
      </button>
    </div>
  );
}

export function PlayerClient({
  handle,
  locale,
  dict,
}: {
  handle: string;
  locale: Locale;
  dict: Dict;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: p } = await supabase!
        .from("profiles")
        .select("*")
        .eq("handle", handle)
        .maybeSingle();
      if (!p) {
        setMissing(true);
        return;
      }
      setProfile(p as Profile);
      const { data: ms } = await supabase!
        .from("matches")
        .select(MATCH_SELECT)
        .or(`p1.eq.${(p as Profile).id},p2.eq.${(p as Profile).id}`)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(50);
      setMatches((ms as unknown as Match[]) ?? []);
    })();
  }, [handle]);

  if (!supabase) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        🚧 {dict.auth.notConfigured}
      </div>
    );
  }
  if (missing) {
    return <p className="py-16 text-center text-sm text-ink-dim">404</p>;
  }
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <ProfileHeader p={profile} locale={locale} dict={dict} publicView />
      <section>
        <h2 className="mb-3 font-display text-lg font-bold tracking-wide">
          {dict.battle.records}
        </h2>
        {matches.length === 0 ? (
          <p className="text-sm text-ink-dim">{dict.battle.noRecords}</p>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchRow key={m.id} m={m} perspectiveId={profile.id} locale={locale} dict={dict} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
