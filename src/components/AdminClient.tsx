"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { MY_CITIES } from "@/lib/supabase";

interface AdminUser {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  stars: number;
  wins: number;
  losses: number;
  created_at: string;
}

interface ProfileForm {
  displayName: string;
  city: string;
  avatarUrl: string;
}

function fmtDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export default function AdminClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { enabled, loading, session, profile, refreshProfile } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "forbidden" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [customDeltas, setCustomDeltas] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [profileForms, setProfileForms] = useState<Record<string, ProfileForm>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  const authHeaders = useCallback(() => {
    if (!session) return null;
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session]);

  const loadUsers = useCallback(
    async (q: string) => {
      const headers = authHeaders();
      if (!headers) return;
      setStatus("loading");
      setMessage(null);
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q.trim())}`, {
        headers,
      });
      if (res.status === 403) {
        setStatus("forbidden");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setMessage(dict.admin.error);
        return;
      }
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users);
      setProfileForms(
        Object.fromEntries(
          data.users.map((user) => [
            user.id,
            {
              displayName: user.display_name || "",
              city: user.city ?? "",
              avatarUrl: user.avatar_url ?? "",
            },
          ])
        )
      );
      setStatus("ready");
    },
    [authHeaders, dict.admin.error]
  );

  useEffect(() => {
    if (session) loadUsers("");
  }, [loadUsers, session]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    loadUsers(query);
  };

  const adjustStars = async (user: AdminUser, delta: number) => {
    const headers = authHeaders();
    if (!headers) return;
    setBusy(`${user.id}:stars`);
    setMessage(null);
    const res = await fetch("/api/admin/stars", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        targetId: user.id,
        delta,
        reason: reasons[user.id] ?? "",
      }),
    });
    setBusy(null);
    if (!res.ok) {
      setMessage(dict.admin.error);
      return;
    }
    const data = (await res.json()) as { user: AdminUser };
    setUsers((current) => current.map((u) => (u.id === data.user.id ? data.user : u)));
    setMessage(dict.admin.updated);
    if (profile?.id === data.user.id) refreshProfile();
  };

  const syncUser = (user: AdminUser) => {
    setUsers((current) => current.map((u) => (u.id === user.id ? user : u)));
    setProfileForms((current) => ({
      ...current,
      [user.id]: {
        displayName: user.display_name || "",
        city: user.city ?? "",
        avatarUrl: user.avatar_url ?? "",
      },
    }));
    if (profile?.id === user.id) refreshProfile();
  };

  const updateProfileForm = (id: string, field: keyof ProfileForm, value: string) => {
    setProfileForms((current) => ({
      ...current,
      [id]: {
        displayName: current[id]?.displayName ?? "",
        city: current[id]?.city ?? "",
        avatarUrl: current[id]?.avatarUrl ?? "",
        [field]: value,
      },
    }));
  };

  const saveUserProfile = async (user: AdminUser) => {
    const headers = authHeaders();
    const form = profileForms[user.id];
    if (!headers || !form) return;
    setBusy(`${user.id}:profile`);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: form.displayName,
        city: form.city || null,
        avatarUrl: form.avatarUrl.trim() || null,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      setMessage(dict.admin.error);
      return;
    }
    const data = (await res.json()) as { user: AdminUser };
    syncUser(data.user);
    setMessage(dict.admin.profileUpdated);
  };

  const resetUserPassword = async (user: AdminUser) => {
    const headers = authHeaders();
    const password = passwords[user.id] ?? "";
    if (!headers) return;
    if (password.length < 8) {
      setMessage(dict.auth.passwordMin);
      return;
    }
    setBusy(`${user.id}:password`);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(null);
    if (!res.ok) {
      setMessage(dict.admin.error);
      return;
    }
    const data = (await res.json()) as { user: AdminUser };
    syncUser(data.user);
    setPasswords((current) => ({ ...current, [user.id]: "" }));
    setMessage(dict.admin.passwordUpdated);
  };

  if (!enabled) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        {dict.auth.notConfigured}
      </div>
    );
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-ink-dim">{dict.admin.loading}</p>;
  }

  if (!session) {
    return (
      <div className="panel p-5 text-sm text-ink-dim">
        {dict.admin.loginRequired}{" "}
        <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
          {dict.auth.login}
        </Link>
      </div>
    );
  }

  if (status === "forbidden") {
    return <div className="panel p-5 text-sm text-atk">{dict.admin.forbidden}</div>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="panel flex flex-col gap-3 p-4 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={dict.admin.searchPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {dict.admin.search}
        </button>
      </form>

      {message && (
        <p
          className={`text-sm font-semibold ${
            [dict.admin.updated, dict.admin.profileUpdated, dict.admin.passwordUpdated].includes(
              message
            )
              ? "text-accent"
              : "text-atk"
          }`}
        >
          {message}
        </p>
      )}

      {status === "loading" ? (
        <p className="py-12 text-center text-sm text-ink-dim">{dict.admin.loading}</p>
      ) : users.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-dim">{dict.admin.noUsers}</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const delta = Number(customDeltas[user.id] ?? "1");
            const form = profileForms[user.id] ?? {
              displayName: user.display_name || "",
              city: user.city ?? "",
              avatarUrl: user.avatar_url ?? "",
            };
            const rowBusy = !!busy?.startsWith(`${user.id}:`);
            return (
              <div key={user.id} className="panel p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/30 bg-panel font-display text-lg font-black text-accent">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      user.handle.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/${locale}/players/${user.handle}`}
                        className="font-semibold hover:text-accent"
                      >
                        @{user.handle}
                      </Link>
                      <span className="text-xs text-ink-dim">
                        {user.display_name || user.handle}
                        {user.city ? ` · ${user.city}` : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-dim">
                      {dict.admin.memberSince} {fmtDate(user.created_at, locale)} ·{" "}
                      {dict.admin.record} {user.wins}-{user.losses}
                    </div>
                  </div>

                  <div className="w-24 shrink-0 font-display text-2xl font-bold text-bal">
                    ★{user.stars}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[1, 5, -1].map((quick) => (
                      <button
                        key={quick}
                        onClick={() => adjustStars(user, quick)}
                        disabled={rowBusy}
                        className="h-9 rounded-md border border-edge bg-panel-2 px-3 font-display text-xs font-bold text-ink transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
                      >
                        {quick > 0 ? `+${quick}` : quick}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                  <input
                    type="number"
                    min={-1000}
                    max={1000}
                    value={customDeltas[user.id] ?? "1"}
                    onChange={(e) =>
                      setCustomDeltas((current) => ({
                        ...current,
                        [user.id]: e.target.value,
                      }))
                    }
                    aria-label={dict.admin.customDelta}
                    className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition focus:border-accent"
                  />
                  <input
                    value={reasons[user.id] ?? ""}
                    onChange={(e) =>
                      setReasons((current) => ({ ...current, [user.id]: e.target.value }))
                    }
                    maxLength={240}
                    placeholder={dict.admin.reasonPlaceholder}
                    className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/60 focus:border-accent"
                  />
                  <button
                    onClick={() => Number.isInteger(delta) && delta !== 0 && adjustStars(user, delta)}
                    disabled={rowBusy || !Number.isInteger(delta) || delta === 0}
                    className="clip-x bg-accent-2 px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                  >
                    {dict.admin.apply}
                  </button>
                </div>

                <div className="mt-4 border-t border-edge pt-4">
                  <div className="mb-2 font-display text-xs font-bold tracking-wider text-accent-2">
                    {dict.admin.profileControls}
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[1fr_12rem_1fr_auto]">
                    <input
                      value={form.displayName}
                      onChange={(e) =>
                        updateProfileForm(user.id, "displayName", e.target.value)
                      }
                      maxLength={60}
                      aria-label={dict.auth.displayName}
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/60 focus:border-accent"
                    />
                    <select
                      value={form.city}
                      onChange={(e) => updateProfileForm(user.id, "city", e.target.value)}
                      aria-label={dict.auth.city}
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition focus:border-accent"
                    >
                      <option value="">-</option>
                      {MY_CITIES.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                    <input
                      type="url"
                      value={form.avatarUrl}
                      onChange={(e) =>
                        updateProfileForm(user.id, "avatarUrl", e.target.value)
                      }
                      maxLength={2048}
                      placeholder={dict.admin.avatarUrlPlaceholder}
                      aria-label={dict.admin.avatarUrl}
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/60 focus:border-accent"
                    />
                    <button
                      onClick={() => saveUserProfile(user)}
                      disabled={rowBusy}
                      className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
                    >
                      {dict.profile.saveProfile}
                    </button>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="password"
                      value={passwords[user.id] ?? ""}
                      onChange={(e) =>
                        setPasswords((current) => ({
                          ...current,
                          [user.id]: e.target.value,
                        }))
                      }
                      minLength={8}
                      placeholder={dict.admin.newPassword}
                      aria-label={dict.admin.newPassword}
                      autoComplete="new-password"
                      className="rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/60 focus:border-accent"
                    />
                    <button
                      onClick={() => resetUserPassword(user)}
                      disabled={rowBusy}
                      className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider text-ink-dim transition enabled:hover:text-accent disabled:opacity-50"
                    >
                      {dict.admin.resetPassword}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
