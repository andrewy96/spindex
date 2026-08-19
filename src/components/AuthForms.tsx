"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dict, Locale } from "@/i18n";
import { supabase, MY_CITIES } from "@/lib/supabase";
import { normalizeMyPhone } from "@/lib/phone";
import { isValidHandle, slugifyHandle } from "@/lib/handle";
import { AVATAR_ACCEPT, AvatarImage, checkAvatarFile, uploadAvatar } from "@/lib/avatar";
import { HOST_WHATSAPP, normalizeResetCode } from "@/lib/passwordReset";
import AvatarCropper from "./AvatarCropper";
import PasswordInput from "./PasswordInput";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2.5 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";
const labelCls = "mb-1 block text-xs font-semibold text-ink-dim";

function ageFromBirthday(birthday: string): number | null {
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

type HandleState = "idle" | "checking" | "free" | "taken";

function NotConfigured({ dict }: { dict: Dict }) {
  return (
    <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
      🚧 {dict.auth.notConfigured}
    </div>
  );
}

export function LoginForm({ locale, dict }: { locale: Locale; dict: Dict }) {
  const router = useRouter();
  const homeHref = `/${locale}`;
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) router.replace(homeHref);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace(homeHref);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [homeHref, router]);

  if (!supabase) return <NotConfigured dict={dict} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const e164 = normalizeMyPhone(phone);
    if (!e164) return setError(dict.auth.phoneInvalid);
    setBusy(true);
    const { error: err } = await supabase!.auth.signInWithPassword({
      phone: e164,
      password,
    });
    setBusy(false);
    if (err) return setError(dict.auth.loginFailed);
    router.replace(homeHref);
  };

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6">
      <div>
        <label className={labelCls}>{dict.auth.phone}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={dict.auth.phonePlaceholder}
          inputMode="tel"
          autoComplete="tel"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{dict.auth.password}</label>
        <PasswordInput
          dict={dict}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={inputCls}
        />
      </div>
      {error && <p className="text-xs font-semibold text-atk">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="clip-x w-full bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {dict.auth.submitLogin}
      </button>
      <p className="text-center text-xs">
        <Link
          href={`/${locale}/forgot-password`}
          className="font-semibold text-ink-dim hover:text-accent"
        >
          {dict.auth.forgotPassword}
        </Link>
      </p>
      <p className="text-center text-xs text-ink-dim">
        {dict.auth.noAccount}{" "}
        <Link href={`/${locale}/register`} className="font-semibold text-accent hover:underline">
          {dict.auth.register}
        </Link>
      </p>
    </form>
  );
}

/**
 * Asks a superadmin to reset the password. No email is ever collected, so the
 * temporary password is handed over out of band rather than sent anywhere.
 */
export function ForgotPasswordForm({ locale, dict }: { locale: Locale; dict: Dict }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabase) return <NotConfigured dict={dict} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!normalizeMyPhone(phone)) return setError(dict.auth.phoneInvalid);
    setBusy(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setBusy(false);
    if (!res.ok) return setError(dict.auth.forgotFailed);
    setSent(true);
  };

  if (sent) {
    // The host has to hear about it somehow — an admin who never opens the
    // panel leaves the blader waiting, so hand them straight to WhatsApp.
    const waText = encodeURIComponent(
      `SPINDEX password reset — my phone number is ${phone.trim()}`
    );
    return (
      <div className="panel space-y-4 p-6">
        <p className="text-sm text-ink-dim">{dict.auth.forgotSent}</p>
        {HOST_WHATSAPP && (
          <a
            href={`https://wa.me/${HOST_WHATSAPP}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            className="clip-x block w-full bg-accent px-6 py-3 text-center font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
          >
            {dict.auth.forgotWhatsapp}
          </a>
        )}
        <Link
          href={`/${locale}/reset-password`}
          className="clip-x block w-full border border-edge bg-panel px-6 py-3 text-center font-display text-sm font-bold tracking-wider text-ink transition hover:border-accent hover:text-accent"
        >
          {dict.auth.forgotHaveCode}
        </Link>
        <p className="text-center text-xs text-ink-dim">
          <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
            {dict.auth.backToLogin}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6">
      <p className="text-sm text-ink-dim">{dict.auth.forgotIntro}</p>
      <div>
        <label className={labelCls}>{dict.auth.phone}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={dict.auth.phonePlaceholder}
          inputMode="tel"
          autoComplete="tel"
          required
          className={inputCls}
        />
      </div>
      {error && <p className="text-xs font-semibold text-atk">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="clip-x w-full bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {dict.auth.forgotSubmit}
      </button>
      <p className="text-center text-xs text-ink-dim">
        <Link
          href={`/${locale}/reset-password`}
          className="font-semibold text-accent hover:underline"
        >
          {dict.auth.forgotHaveCode}
        </Link>
        {" · "}
        <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
          {dict.auth.backToLogin}
        </Link>
      </p>
    </form>
  );
}

/**
 * Redeems a one-time code from a host. The code is not a password and never
 * becomes one — the blader picks their own here, so the account is never left
 * holding a value somebody else has seen.
 */
export function ResetPasswordForm({ locale, dict }: { locale: Locale; dict: Dict }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabase) return <NotConfigured dict={dict} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!normalizeMyPhone(phone)) return setError(dict.auth.phoneInvalid);
    if (!normalizeResetCode(code)) return setError(dict.auth.resetInvalid);
    if (password.length < 8) return setError(dict.auth.passwordMin);
    if (password !== confirm) return setError(dict.profile.passwordMismatch);

    setBusy(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, password }),
    });
    setBusy(false);
    if (res.status === 400) return setError(dict.auth.resetInvalid);
    if (!res.ok) return setError(dict.auth.resetFailed);
    setDone(true);
  };

  if (done) {
    return (
      <div className="panel space-y-4 p-6">
        <p className="text-sm text-ink-dim">{dict.auth.resetDone}</p>
        <Link
          href={`/${locale}/login`}
          className="clip-x block w-full bg-accent px-6 py-3 text-center font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
        >
          {dict.auth.login}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6">
      <p className="text-sm text-ink-dim">{dict.auth.resetIntro}</p>
      <div>
        <label className={labelCls}>{dict.auth.phone}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={dict.auth.phonePlaceholder}
          inputMode="tel"
          autoComplete="tel"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{dict.auth.resetCode}</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={dict.auth.resetCodePlaceholder}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className={`${inputCls} font-mono tracking-widest`}
        />
      </div>
      <div>
        <label className={labelCls}>{dict.profile.newPassword}</label>
        <PasswordInput
          dict={dict}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-ink-dim">{dict.auth.passwordMin}</p>
      </div>
      <div>
        <label className={labelCls}>{dict.profile.confirmPassword}</label>
        <PasswordInput
          dict={dict}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
        />
      </div>
      {error && <p className="text-xs font-semibold text-atk">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="clip-x w-full bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {dict.auth.resetSubmit}
      </button>
      <p className="text-center text-xs text-ink-dim">
        <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
          {dict.auth.backToLogin}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ locale, dict }: { locale: Locale; dict: Dict }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [birthday, setBirthday] = useState("");
  const [referralCode, setReferralCode] = useState("");
  /** The picked file is kept so the framing can be redone from the original. */
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [photo, setPhoto] = useState<AvatarImage | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const age = ageFromBirthday(birthday);

  /** The @handle follows the blader name until the user edits it by hand. */
  useEffect(() => {
    if (handleTouched) return;
    const slug = slugifyHandle(displayName);
    setHandle(slug);
    // Nothing usable to slugify (e.g. a Chinese-only name) — ask for one up front.
    if (!slug && displayName.trim()) setEditingHandle(true);
  }, [displayName, handleTouched]);

  useEffect(() => {
    if (!supabase || !isValidHandle(handle)) {
      setHandleState("idle");
      return;
    }
    setHandleState("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data, error: err } = await supabase!
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();
      if (cancelled) return;
      // Fail open: a blocked read should not stop someone registering.
      setHandleState(err ? "idle" : data ? "taken" : "free");
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (!supabase) return <NotConfigured dict={dict} />;

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const invalid = checkAvatarFile(file);
    if (invalid) {
      setError(invalid === "type" ? dict.profile.imageType : dict.profile.imageTooLarge);
      return;
    }
    setError(null);
    setPhotoFile(file);
    setCropping(file);
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPhotoFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const e164 = normalizeMyPhone(phone);
    if (!e164) return setError(dict.auth.phoneInvalid);
    if (password.length < 8) return setError(dict.auth.passwordMin);
    if (!displayName.trim()) return setError(dict.auth.bladerNameRequired);
    if (!isValidHandle(handle)) {
      setEditingHandle(true);
      return setError(dict.auth.handleHint);
    }
    if (handleState === "taken") {
      setEditingHandle(true);
      return setError(dict.auth.handleTaken);
    }
    if (gender !== "male" && gender !== "female") return setError(dict.auth.genderRequired);
    if (age == null || age < 0 || age > 120) return setError(dict.auth.birthdayInvalid);
    setBusy(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: e164,
        password,
        handle,
        displayName,
        city,
        gender,
        birthday,
        age,
        referralCode: referralCode.trim() || undefined,
      }),
    });
    if (!res.ok) {
      setBusy(false);
      return setError(dict.auth.registerFailed);
    }
    const { data: session, error: err } = await supabase!.auth.signInWithPassword({
      phone: e164,
      password,
    });
    if (err || !session.user) {
      setBusy(false);
      return setError(dict.auth.registerFailed);
    }
    setRegistered(true);

    // The account exists from here on — a failed photo is not a failed signup.
    if (photo) {
      const failure = await uploadAvatar(supabase!, session.user.id, photo);
      if (failure) {
        setBusy(false);
        return setError(dict.auth.photoUploadFailed);
      }
    }
    setBusy(false);
    router.push(`/${locale}/me`);
  };

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6">
      {cropping && (
        <AvatarCropper
          file={cropping}
          dict={dict}
          onCancel={() => {
            setCropping(null);
            // Backing out of the very first crop leaves nothing to reposition.
            if (!photo) setPhotoFile(null);
          }}
          onDone={(image) => {
            setPhoto(image);
            setCropping(null);
          }}
        />
      )}
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/40 bg-panel font-display text-2xl font-black text-accent">
          {photoPreview ? (
            <img src={photoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            (displayName.trim() || handle || "?").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <span className={labelCls}>{dict.auth.photo}</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md border border-edge bg-panel px-3 py-2 font-display text-xs font-bold tracking-wider text-ink transition hover:border-accent hover:text-accent">
              <input
                type="file"
                accept={AVATAR_ACCEPT}
                onChange={pickPhoto}
                disabled={busy}
                className="sr-only"
              />
              {photo ? dict.auth.photoChange : dict.profile.uploadPhoto}
            </label>
            {photo && photoFile && (
              <button
                type="button"
                onClick={() => setCropping(photoFile)}
                className="text-[11px] font-semibold text-accent hover:underline"
              >
                {dict.profile.reposition}
              </button>
            )}
            {photo && (
              <button
                type="button"
                onClick={clearPhoto}
                className="text-[11px] font-semibold text-ink-dim hover:text-atk"
              >
                {dict.auth.photoRemove}
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-dim">{dict.auth.photoOptional}</p>
        </div>
      </div>
      <div>
        <label className={labelCls}>{dict.auth.bladerName}</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={dict.auth.bladerNamePlaceholder}
          maxLength={60}
          required
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-ink-dim">{dict.auth.bladerNameHint}</p>

        <div className="mt-2 rounded-md border border-edge bg-panel/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-ink-dim">
              {dict.auth.profileLink}
            </span>
            <button
              type="button"
              onClick={() => {
                setHandleTouched(true);
                setEditingHandle((v) => !v);
              }}
              className="text-[11px] font-semibold text-accent hover:underline"
            >
              {editingHandle ? dict.auth.handleDone : dict.auth.handleEdit}
            </button>
          </div>
          {editingHandle ? (
            <input
              value={handle}
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
              }}
              placeholder="phoenix_my"
              maxLength={20}
              className={`${inputCls} mt-1.5`}
            />
          ) : (
            <div className="mt-0.5 truncate font-semibold text-ink">
              @{handle || "—"}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            {handle && <span className="text-ink-dim">/players/{handle}</span>}
            {handleState === "checking" && (
              <span className="text-ink-dim">{dict.auth.handleChecking}</span>
            )}
            {handleState === "free" && (
              <span className="font-semibold text-accent">✓ {dict.auth.handleAvailable}</span>
            )}
            {handleState === "taken" && (
              <span className="font-semibold text-atk">{dict.auth.handleTaken}</span>
            )}
          </div>
          {editingHandle && (
            <p className="mt-1 text-[11px] text-ink-dim">{dict.auth.handleHint}</p>
          )}
        </div>
      </div>
      <div>
        <label className={labelCls}>{dict.auth.city}</label>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {MY_CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{dict.auth.gender}</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "male" | "female" | "")}
            required
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
            required
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>{dict.auth.age}</label>
        <input
          value={age == null ? "" : age}
          readOnly
          aria-readonly="true"
          placeholder={dict.auth.ageAuto}
          className={`${inputCls} text-ink-dim`}
        />
      </div>
      <div>
        <label className={labelCls}>{dict.auth.phone}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={dict.auth.phonePlaceholder}
          inputMode="tel"
          autoComplete="tel"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>{dict.auth.referralCode}</label>
        <input
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
          placeholder={dict.auth.referralCodePlaceholder}
          maxLength={24}
          autoCapitalize="characters"
          spellCheck={false}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-ink-dim">{dict.auth.referralCodeHint}</p>
      </div>
      <div>
        <label className={labelCls}>{dict.auth.password}</label>
        <PasswordInput
          dict={dict}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-ink-dim">{dict.auth.passwordMin}</p>
      </div>
      {error && <p className="text-xs font-semibold text-atk">{error}</p>}
      {registered ? (
        <Link
          href={`/${locale}/me`}
          className="clip-x block w-full bg-accent px-6 py-3 text-center font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
        >
          {dict.auth.continueToProfile}
        </Link>
      ) : (
        <button
          type="submit"
          disabled={busy}
          className="clip-x w-full bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {busy && photo ? dict.profile.uploading : dict.auth.submitRegister}
        </button>
      )}
      <p className="text-center text-xs text-ink-dim">
        {dict.auth.haveAccount}{" "}
        <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
          {dict.auth.login}
        </Link>
      </p>
    </form>
  );
}
