"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Dict, Locale, switchLocalePath } from "@/i18n";
import { useAuth } from "@/lib/auth";

function AuthChip({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { enabled, profile, loading } = useAuth();
  if (!enabled || loading) return null;
  if (profile) {
    return (
      <Link
        href={`/${locale}/me`}
        className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/20"
      >
        @{profile.handle}
        <span className="text-bal">★{profile.stars}</span>
      </Link>
    );
  }
  return (
    <Link
      href={`/${locale}/login`}
      className="rounded-md border border-edge px-2.5 py-1 text-xs font-semibold text-ink-dim transition hover:border-accent hover:text-accent"
    >
      {dict.nav.login}
    </Link>
  );
}

function AdminShortcut({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { session } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!session) {
      setAllowed(false);
      return;
    }
    let active = true;
    fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then((res) => {
      if (active) setAllowed(res.ok);
    });
    return () => {
      active = false;
    };
  }, [session]);

  if (!allowed) return null;

  return (
    <Link
      href={`/${locale}/admin`}
      className="rounded-md border border-accent-2/40 bg-accent-2/10 px-2.5 py-1 text-xs font-semibold text-accent-2 transition hover:bg-accent-2/20"
    >
      {dict.nav.admin}
    </Link>
  );
}

function LangSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const target: Locale = locale === "en" ? "zh" : "en";
  const href = switchLocalePath(pathname, target) + (query ? `?${query}` : "");
  return (
    <Link
      href={href}
      className="rounded-md border border-edge px-2.5 py-1 text-xs font-semibold tracking-wide text-ink-dim transition hover:border-accent hover:text-accent"
      aria-label="Switch language"
    >
      {locale === "en" ? "中文" : "EN"}
    </Link>
  );
}

export default function Nav({ locale, dict }: { locale: Locale; dict: Dict }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    { href: `/${locale}`, label: dict.nav.home, exact: true },
    { href: `/${locale}/catalog`, label: dict.nav.catalog },
    { href: `/${locale}/builder`, label: dict.nav.builder },
    { href: `/${locale}/rankings`, label: dict.nav.rankings },
    { href: `/${locale}/tournaments`, label: dict.nav.tournaments },
    { href: `/${locale}/clubs`, label: dict.nav.clubs },
    { href: `/${locale}/market`, label: dict.nav.market },
    { href: `/${locale}/battle`, label: dict.nav.battle },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-bg/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href={`/${locale}`} className="flex items-baseline gap-1 font-display text-lg font-bold tracking-widest">
          <span>BEYLAB</span>
          <span className="text-glow text-accent">X</span>
        </Link>

        <div className="ml-auto hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive(l.href, l.exact)
                  ? "bg-panel-2 text-accent"
                  : "text-ink-dim hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <div className="ml-2 flex items-center gap-2">
            <AdminShortcut locale={locale} dict={dict} />
            <AuthChip locale={locale} dict={dict} />
            <Suspense fallback={null}>
              <LangSwitcher locale={locale} />
            </Suspense>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:hidden">
          <AdminShortcut locale={locale} dict={dict} />
          <AuthChip locale={locale} dict={dict} />
          <Suspense fallback={null}>
            <LangSwitcher locale={locale} />
          </Suspense>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Menu"
            className="rounded-md border border-edge p-2 text-ink-dim"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {open ? (
                <path d="M3.3 2.3 8 7l4.7-4.7 1 1L9 8l4.7 4.7-1 1L8 9l-4.7 4.7-1-1L7 8 2.3 3.3z" />
              ) : (
                <path d="M1 3h14v1.6H1zM1 7.2h14v1.6H1zM1 11.4h14V13H1z" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-edge bg-bg sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block px-6 py-3 text-sm font-medium ${
                isActive(l.href, l.exact) ? "text-accent" : "text-ink-dim"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
