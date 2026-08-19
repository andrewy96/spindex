"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  OVERDRIVE_DIAMOND_TO_GOLD_COST,
  OVERDRIVE_POINT_TO_DIAMOND_COST,
  OVERDRIVE_REWARDS,
  OverdriveRewardKey,
} from "@/lib/overdrive";

interface Redemption {
  id: string;
  reward: OverdriveRewardKey;
  points_spent: number;
  diamonds_spent: number;
  diamonds_gained: number;
  gold_bars_gained: number;
  item_code: string | null;
  status: "pending" | "fulfilled" | "cancelled";
  created_at: string;
}

function fmtDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-MY", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function OverdriveExchangeClient({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dict;
}) {
  const { enabled, profile, refreshProfile } = useAuth();
  const [history, setHistory] = useState<Redemption[]>([]);
  const [busy, setBusy] = useState<OverdriveRewardKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const points = profile?.stars ?? 0;
  const diamonds = profile?.diamonds ?? 0;
  const goldBars = profile?.gold_bars ?? 0;

  const rewards = useMemo(
    () => ({
      diamond: {
        title: dict.exchange.pointToDiamond,
        detail: dict.exchange.pointToDiamondDetail,
        cost: `${OVERDRIVE_POINT_TO_DIAMOND_COST.toLocaleString("en-MY")} pts`,
        canRedeem: points >= OVERDRIVE_POINT_TO_DIAMOND_COST,
        image: "/rewards/overdrive-diamond.svg",
        imageAlt: dict.exchange.diamonds,
        imageClassName: "object-contain p-4",
      },
      gold_bar: {
        title: dict.exchange.diamondToGold,
        detail: dict.exchange.diamondToGoldDetail,
        cost: `${OVERDRIVE_DIAMOND_TO_GOLD_COST} ${dict.exchange.diamonds}`,
        canRedeem: diamonds >= OVERDRIVE_DIAMOND_TO_GOLD_COST,
        image: "/rewards/overdrive-gold-bar.svg",
        imageAlt: dict.exchange.goldBars,
        imageClassName: "object-contain p-4",
      },
      ux20: {
        title: dict.exchange.ux20,
        detail: dict.exchange.ux20Detail,
        cost: `5 ${dict.exchange.diamonds}`,
        canRedeem: diamonds >= 5,
        image: "/rewards/ux20.png",
        imageAlt: dict.exchange.ux20,
        imageClassName: "object-contain p-1",
      },
      ux00: {
        title: dict.exchange.ux00,
        detail: dict.exchange.ux00Detail,
        cost: `10 ${dict.exchange.diamonds}`,
        canRedeem: diamonds >= 10,
        image: "/rewards/ux00.jpg",
        imageAlt: dict.exchange.ux00,
        imageClassName: "object-contain p-2",
      },
    }),
    [diamonds, dict, points]
  );

  const loadHistory = useCallback(async () => {
    if (!supabase || !profile) {
      setHistory([]);
      return;
    }
    const { data } = await supabase
      .from("overdrive_redemptions")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as Redemption[]) ?? []);
  }, [profile]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!enabled) {
    return (
      <div className="panel border-accent-2/40 p-5 text-sm text-ink-dim">
        {dict.auth.notConfigured}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="panel p-5 text-sm text-ink-dim">
        <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
          {dict.auth.login}
        </Link>{" "}
        {dict.exchange.loginRequired}
      </div>
    );
  }

  const redeem = async (reward: OverdriveRewardKey) => {
    if (!supabase) return;
    setBusy(reward);
    setMessage(null);
    setError(null);
    const { error: redeemError } = await supabase.rpc("redeem_overdrive_reward", {
      p_reward: reward,
    });
    setBusy(null);
    if (redeemError) {
      setError(
        redeemError.message.includes("not_enough")
          ? dict.exchange.notEnough
          : dict.exchange.error
      );
      return;
    }
    await Promise.all([refreshProfile(), loadHistory()]);
    setMessage(dict.exchange.redeemed);
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3">
          <div className="font-display text-2xl font-black text-bal">
            {points.toLocaleString("en-MY")}
          </div>
          <div className="text-xs text-ink-dim">{dict.battle.starsBalance}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-display text-2xl font-black text-accent">
            {diamonds.toLocaleString("en-MY")}
          </div>
          <div className="text-xs text-ink-dim">{dict.exchange.diamonds}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-display text-2xl font-black text-accent-2">
            {goldBars.toLocaleString("en-MY")}
          </div>
          <div className="text-xs text-ink-dim">{dict.exchange.goldBars}</div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {OVERDRIVE_REWARDS.map((reward) => {
          const meta = rewards[reward.key];
          return (
            <div key={reward.key} className="panel flex flex-col gap-4 p-4">
              <div className="flex items-start gap-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-edge bg-bg">
                  <Image
                    src={meta.image}
                    alt={meta.imageAlt}
                    fill
                    sizes="96px"
                    className={meta.imageClassName}
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold tracking-wide">
                    {meta.title}
                  </div>
                  <p className="mt-1 text-sm text-ink-dim">{meta.detail}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3">
                <span className="rounded bg-panel px-2 py-1 font-display text-xs font-bold text-bal">
                  {meta.cost}
                </span>
                <button
                  type="button"
                  onClick={() => redeem(reward.key)}
                  disabled={busy !== null || !meta.canRedeem}
                  className="clip-x bg-accent px-4 py-2 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:opacity-45"
                >
                  {busy === reward.key ? dict.exchange.redeeming : dict.exchange.redeem}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {(message || error) && (
        <p className={`text-sm font-semibold ${error ? "text-atk" : "text-accent"}`}>
          {error ?? message}
        </p>
      )}

      <section className="panel p-4">
        <div className="font-display text-sm font-bold tracking-wider text-accent-2">
          {dict.exchange.history}
        </div>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">{dict.exchange.noHistory}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {history.map((row) => {
              const title = row.item_code || rewards[row.reward]?.title || row.reward;
              const spent =
                row.points_spent > 0
                  ? `${row.points_spent.toLocaleString("en-MY")} pts`
                  : `${row.diamonds_spent} ${dict.exchange.diamonds}`;
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-edge bg-panel px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-ink">{title}</span>
                  <span className="text-xs text-ink-dim">{spent}</span>
                  <span className="text-xs text-ink-dim">{fmtDate(row.created_at, locale)}</span>
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    {dict.exchange[row.status]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
