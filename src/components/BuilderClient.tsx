"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dict, Locale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import {
  blades,
  ratchets,
  bits,
  assists,
  lockChips,
  findBlade,
  findRatchet,
  findBit,
  findAssist,
  findLockChip,
  tierRank,
} from "@/data/parts";
import { Combo, comboName, comboStats, comboType, comboToParams, isComplete } from "@/lib/combo";
import {
  StrategyPair,
  StrategyQuota,
  StrategyResult,
  StrategySource,
  strategyMatchupKeyJson,
} from "@/lib/strategy";
import { TypeBadge, TierChip, TYPE_COLOR } from "./badges";
import Radar from "./Radar";
import PartImage from "./PartImage";

type SlotKey = "blade" | "lockChip" | "assist" | "ratchet" | "bit";
type PickerTarget = "own" | "opponent";

interface PickerItem {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  tier?: string | null;
}

interface StrategyResponse {
  strategy?: StrategyResult;
  strategies?: StrategyPair;
  cached?: boolean;
  source?: StrategySource;
  quota?: StrategyQuota;
  matchupHash?: string;
  error?: string;
}

interface StrategySessionCache {
  strategies: StrategyPair;
  quota?: StrategyQuota;
  source?: StrategySource;
  cached?: boolean;
}

const strategySessionKey = (hash: string) => `spindex.strategy.${hash}`;

async function sha256Hex(value: string): Promise<string | null> {
  if (!window.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readStrategySession(hash: string): StrategySessionCache | null {
  try {
    const raw = window.sessionStorage.getItem(strategySessionKey(hash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StrategySessionCache;
    if (!parsed.strategies?.en || !parsed.strategies?.zh) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStrategySession(hash: string, value: StrategySessionCache) {
  try {
    window.sessionStorage.setItem(strategySessionKey(hash), JSON.stringify(value));
  } catch {
    /* sessionStorage can be unavailable in private browsing */
  }
}

function formatQuota(template: string, quota: StrategyQuota): string {
  return template
    .replace("{remaining}", String(quota.remaining))
    .replace("{limit}", String(quota.limit));
}

function PickerModal({
  title,
  items,
  onPick,
  onClose,
  dict,
}: {
  title: string;
  items: PickerItem[];
  onPick: (id: string) => void;
  onClose: () => void;
  dict: Dict;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const query = q.trim().toLowerCase();
  const filtered = query
    ? items.filter(
        (i) =>
          i.id.toLowerCase().includes(query) ||
          i.title.toLowerCase().includes(query) ||
          (i.subtitle ?? "").toLowerCase().includes(query)
      )
    : items;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-edge p-4">
          <h3 className="font-display text-sm font-bold tracking-wider">{title}</h3>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={dict.builder.pickerSearch}
            className="ml-auto w-40 rounded-md border border-edge bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent sm:w-56"
          />
          <button
            onClick={onClose}
            aria-label={dict.builder.close}
            className="rounded-md border border-edge px-2 py-1.5 text-xs text-ink-dim hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="thin-scroll grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
          {filtered.map((i) => (
            <button
              key={i.id}
              onClick={() => onPick(i.id)}
              className="panel group flex flex-col items-center gap-1 p-3 text-center transition hover:border-accent/60"
            >
              <div className="relative h-20 w-full">
                {i.tier && (
                  <span className="absolute -left-1 -top-1 z-10">
                    <TierChip tier={i.tier} />
                  </span>
                )}
                <PartImage src={i.image} alt={i.title} fallbackLabel={i.id} sizes="(max-width: 640px) 30vw, 140px" className="transition group-hover:scale-105" />
              </div>
              <div className="w-full truncate text-xs font-semibold">{i.title}</div>
              {i.subtitle && (
                <div className="w-full truncate text-[10px] text-ink-dim">{i.subtitle}</div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-ink-dim">
              {dict.catalog.noResults}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BuilderClient({ locale, dict }: { locale: Locale; dict: Dict }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { enabled, loading: authLoading, session } = useAuth();

  const [bladeId, setBladeId] = useState<string | null>(() => searchParams.get("b"));
  const [lockChipId, setLockChipId] = useState<string | null>(() => searchParams.get("l"));
  const [ratchetId, setRatchetId] = useState<string | null>(() => searchParams.get("r"));
  const [bitId, setBitId] = useState<string | null>(() => searchParams.get("t"));
  const [assistId, setAssistId] = useState<string | null>(() => searchParams.get("a"));
  const [opponentBladeId, setOpponentBladeId] = useState<string | null>(() => searchParams.get("ob"));
  const [opponentLockChipId, setOpponentLockChipId] = useState<string | null>(() => searchParams.get("ol"));
  const [opponentRatchetId, setOpponentRatchetId] = useState<string | null>(() => searchParams.get("or"));
  const [opponentBitId, setOpponentBitId] = useState<string | null>(() => searchParams.get("ot"));
  const [opponentAssistId, setOpponentAssistId] = useState<string | null>(() => searchParams.get("oa"));
  const [openSlot, setOpenSlot] = useState<{ target: PickerTarget; slot: SlotKey } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategyPair | null>(null);
  const [strategySource, setStrategySource] = useState<StrategySource | null>(null);
  const [strategyCached, setStrategyCached] = useState(false);
  const [strategyQuota, setStrategyQuota] = useState<StrategyQuota | null>(null);
  const [matchupHash, setMatchupHash] = useState<string | null>(null);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  const combo: Combo = useMemo(() => {
    const blade = bladeId ? findBlade(bladeId) : null;
    const defaultLockChip = blade?.lockChip ? findLockChip(blade.lockChip) : null;
    return {
      blade,
      lockChip: blade?.cx
        ? lockChipId
          ? findLockChip(lockChipId) ?? defaultLockChip
          : defaultLockChip
        : null,
      ratchet: ratchetId ? findRatchet(ratchetId) : null,
      bit: bitId ? findBit(bitId) : null,
      assist: blade?.cx && assistId ? findAssist(assistId) : null,
    };
  }, [bladeId, lockChipId, ratchetId, bitId, assistId]);

  const opponentCombo: Combo = useMemo(() => {
    const blade = opponentBladeId ? findBlade(opponentBladeId) : null;
    const defaultLockChip = blade?.lockChip ? findLockChip(blade.lockChip) : null;
    return {
      blade,
      lockChip: blade?.cx
        ? opponentLockChipId
          ? findLockChip(opponentLockChipId) ?? defaultLockChip
          : defaultLockChip
        : null,
      ratchet: opponentRatchetId ? findRatchet(opponentRatchetId) : null,
      bit: opponentBitId ? findBit(opponentBitId) : null,
      assist: blade?.cx && opponentAssistId ? findAssist(opponentAssistId) : null,
    };
  }, [opponentBladeId, opponentLockChipId, opponentRatchetId, opponentBitId, opponentAssistId]);

  // Keep both builds in the URL so language switching preserves the matchup.
  useEffect(() => {
    const params = comboToParams(combo);
    if (opponentCombo.blade) params.set("ob", opponentCombo.blade.id);
    if (opponentCombo.lockChip && opponentCombo.blade?.cx) {
      params.set("ol", opponentCombo.lockChip.id);
    }
    if (opponentCombo.assist && opponentCombo.blade?.cx) {
      params.set("oa", opponentCombo.assist.id);
    }
    if (opponentCombo.ratchet) params.set("or", opponentCombo.ratchet.id);
    if (opponentCombo.bit) params.set("ot", opponentCombo.bit.id);

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [combo, opponentCombo, pathname, router]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const stats = comboStats(combo);
  const type = comboType(combo);
  const name = comboName(combo, locale);
  const complete = isComplete(combo);
  const opponentStats = comboStats(opponentCombo);
  const opponentType = comboType(opponentCombo);
  const opponentName = comboName(opponentCombo, locale);
  const opponentComplete = isComplete(opponentCombo);
  const strategyLocked = !enabled || authLoading || !session;
  const strategy = strategies?.[locale] ?? null;
  const matchupKeyJson = useMemo(
    () => (complete && opponentComplete ? strategyMatchupKeyJson(combo, opponentCombo) : null),
    [complete, combo, opponentComplete, opponentCombo]
  );
  const quotaText =
    strategyQuota && !strategyLocked ? formatQuota(dict.builder.strategyQuota, strategyQuota) : null;
  const strategyStatus =
    strategySource === "fallback"
      ? dict.builder.strategyFallback
      : strategyCached || strategySource === "cache"
        ? dict.builder.strategyCached
        : null;

  const share = async () => {
    const params = comboToParams(combo).toString();
    const url = `${window.location.origin}${pathname}${params ? `?${params}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${dict.site.name} — ${name}`, text: name, url });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    await navigator.clipboard.writeText(url);
    showToast(dict.builder.copied);
  };

  const copyName = async () => {
    await navigator.clipboard.writeText(name);
    showToast(dict.builder.nameCopied);
  };

  useEffect(() => {
    if (!enabled || authLoading || !session) {
      setStrategyQuota(null);
      return;
    }

    let active = true;
    fetch("/api/strategy/quota", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const data = (await res.json()) as { quota?: StrategyQuota };
        if (data.quota) setStrategyQuota(data.quota);
      })
      .catch(() => {
        /* quota display is non-blocking */
      });

    return () => {
      active = false;
    };
  }, [authLoading, enabled, session]);

  useEffect(() => {
    if (!matchupKeyJson) {
      setMatchupHash(null);
      setStrategies(null);
      setStrategySource(null);
      setStrategyCached(false);
      return;
    }

    let active = true;
    sha256Hex(matchupKeyJson).then((hash) => {
      if (!active || !hash) return;
      setMatchupHash(hash);
      const cached = readStrategySession(hash);
      if (cached) {
        setStrategies(cached.strategies);
        setStrategySource(cached.source ?? "cache");
        setStrategyCached(cached.cached ?? true);
        if (cached.quota) setStrategyQuota(cached.quota);
      } else {
        setStrategies(null);
        setStrategySource(null);
        setStrategyCached(false);
      }
      setStrategyError(null);
    });

    return () => {
      active = false;
    };
  }, [matchupKeyJson]);

  const randomize = () => {
    const pool = blades.filter((b) => b.image);
    const blade = pool[Math.floor(Math.random() * pool.length)];
    setBladeId(blade.id);
    setLockChipId(
      blade.cx ? lockChips[Math.floor(Math.random() * lockChips.length)].id : null
    );
    setRatchetId(ratchets[Math.floor(Math.random() * ratchets.length)].id);
    setBitId(bits[Math.floor(Math.random() * bits.length)].id);
    setAssistId(
      blade.cx ? assists[Math.floor(Math.random() * assists.length)].id : null
    );
    setStrategies(null);
    setStrategySource(null);
    setStrategyCached(false);
    setStrategyError(null);
  };

  const reset = () => {
    setBladeId(null);
    setLockChipId(null);
    setRatchetId(null);
    setBitId(null);
    setAssistId(null);
    setStrategies(null);
    setStrategySource(null);
    setStrategyCached(false);
    setStrategyError(null);
  };

  const resetOpponent = () => {
    setOpponentBladeId(null);
    setOpponentLockChipId(null);
    setOpponentRatchetId(null);
    setOpponentBitId(null);
    setOpponentAssistId(null);
    setStrategies(null);
    setStrategySource(null);
    setStrategyCached(false);
    setStrategyError(null);
  };

  const pickerItems: Record<SlotKey, PickerItem[]> = useMemo(
    () => ({
      blade: [...blades]
        .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.en.localeCompare(b.en))
        .map((b) => ({
          id: b.id,
          title: locale === "zh" ? b.zh : b.enFull,
          subtitle: b.code,
          image: b.image,
          tier: b.tier,
        })),
      ratchet: ratchets.map((r) => ({
        id: r.id,
        title: r.id,
        subtitle: r.height != null ? `${r.height.toFixed(1)}mm` : null,
        image: r.image,
      })),
      bit: bits.map((b) => ({ id: b.id, title: b.id, subtitle: b.name, image: b.image })),
      lockChip: lockChips.map((l) => ({
        id: l.id,
        title: locale === "zh" ? l.zh : l.id,
        subtitle: l.hasMetal ? dict.part.metalLockChip : locale === "zh" ? dict.part.lockChip : l.name,
        image: l.image,
      })),
      assist: assists.map((a) => ({ id: a.id, title: a.id, subtitle: a.name, image: a.image })),
    }),
    [dict.part.lockChip, dict.part.metalLockChip, locale]
  );

  const setters: Record<SlotKey, (id: string | null) => void> = {
    blade: setBladeId,
    lockChip: setLockChipId,
    ratchet: setRatchetId,
    bit: setBitId,
    assist: setAssistId,
  };
  const opponentSetters: Record<SlotKey, (id: string | null) => void> = {
    blade: setOpponentBladeId,
    lockChip: setOpponentLockChipId,
    ratchet: setOpponentRatchetId,
    bit: setOpponentBitId,
    assist: setOpponentAssistId,
  };

  const slots: {
    key: SlotKey;
    label: string;
    value: string | null;
    image: string | null;
    hidden?: boolean;
  }[] = [
    {
      key: "blade",
      label: dict.builder.slotBlade,
      value: combo.blade ? (locale === "zh" ? combo.blade.zh : combo.blade.enFull) : null,
      image: combo.blade?.image ?? null,
    },
    {
      key: "lockChip",
      label: dict.builder.slotLockChip,
      value: combo.lockChip
        ? `${locale === "zh" ? combo.lockChip.zh : combo.lockChip.id}${
            combo.lockChip.hasMetal ? ` · ${dict.part.metalLockChip}` : ""
          }`
        : null,
      image: combo.lockChip?.image ?? null,
      hidden: !combo.blade?.cx,
    },
    {
      key: "assist",
      label: dict.builder.slotAssist,
      value: combo.assist ? `${combo.assist.id}${combo.assist.name ? ` · ${combo.assist.name}` : ""}` : null,
      image: combo.assist?.image ?? null,
      hidden: !combo.blade?.cx,
    },
    {
      key: "ratchet",
      label: dict.builder.slotRatchet,
      value: combo.ratchet?.id ?? null,
      image: combo.ratchet?.image ?? null,
    },
    {
      key: "bit",
      label: dict.builder.slotBit,
      value: combo.bit ? `${combo.bit.id}${combo.bit.name ? ` · ${combo.bit.name}` : ""}` : null,
      image: combo.bit?.image ?? null,
    },
  ];

  const opponentSlots: {
    key: SlotKey;
    label: string;
    value: string | null;
    image: string | null;
    hidden?: boolean;
  }[] = [
    {
      key: "blade",
      label: dict.builder.slotBlade,
      value: opponentCombo.blade
        ? locale === "zh"
          ? opponentCombo.blade.zh
          : opponentCombo.blade.enFull
        : null,
      image: opponentCombo.blade?.image ?? null,
    },
    {
      key: "lockChip",
      label: dict.builder.slotLockChip,
      value: opponentCombo.lockChip
        ? `${locale === "zh" ? opponentCombo.lockChip.zh : opponentCombo.lockChip.id}${
            opponentCombo.lockChip.hasMetal ? ` · ${dict.part.metalLockChip}` : ""
          }`
        : null,
      image: opponentCombo.lockChip?.image ?? null,
      hidden: !opponentCombo.blade?.cx,
    },
    {
      key: "assist",
      label: dict.builder.slotAssist,
      value: opponentCombo.assist
        ? `${opponentCombo.assist.id}${opponentCombo.assist.name ? ` · ${opponentCombo.assist.name}` : ""}`
        : null,
      image: opponentCombo.assist?.image ?? null,
      hidden: !opponentCombo.blade?.cx,
    },
    {
      key: "ratchet",
      label: dict.builder.slotRatchet,
      value: opponentCombo.ratchet?.id ?? null,
      image: opponentCombo.ratchet?.image ?? null,
    },
    {
      key: "bit",
      label: dict.builder.slotBit,
      value: opponentCombo.bit
        ? `${opponentCombo.bit.id}${opponentCombo.bit.name ? ` · ${opponentCombo.bit.name}` : ""}`
        : null,
      image: opponentCombo.bit?.image ?? null,
    },
  ];

  const slotLabels: Record<SlotKey, string> = {
    blade: dict.builder.slotBlade,
    lockChip: dict.builder.slotLockChip,
    assist: dict.builder.slotAssist,
    ratchet: dict.builder.slotRatchet,
    bit: dict.builder.slotBit,
  };

  const analyzeStrategy = async () => {
    if (!session) return;
    if (!complete || !opponentComplete) {
      setStrategyError(dict.builder.strategyIncomplete);
      return;
    }

    if (matchupHash) {
      const cached = readStrategySession(matchupHash);
      if (cached) {
        setStrategies(cached.strategies);
        setStrategySource(cached.source ?? "cache");
        setStrategyCached(cached.cached ?? true);
        if (cached.quota) setStrategyQuota(cached.quota);
        setStrategyError(null);
        return;
      }
    }

    setStrategyBusy(true);
    setStrategyError(null);
    setStrategies(null);
    setStrategySource(null);
    setStrategyCached(false);
    const res = await fetch("/api/strategy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        locale,
        own: {
          bladeId: combo.blade?.id,
          lockChipId: combo.lockChip?.id,
          assistId: combo.assist?.id,
          ratchetId: combo.ratchet?.id,
          bitId: combo.bit?.id,
        },
        opponent: {
          bladeId: opponentCombo.blade?.id,
          lockChipId: opponentCombo.lockChip?.id,
          assistId: opponentCombo.assist?.id,
          ratchetId: opponentCombo.ratchet?.id,
          bitId: opponentCombo.bit?.id,
        },
      }),
    });
    setStrategyBusy(false);
    const data = (await res.json().catch(() => ({}))) as StrategyResponse;
    if (data.quota) setStrategyQuota(data.quota);

    if (!res.ok) {
      if (res.status === 429) {
        setStrategyError(dict.builder.strategyLimitReached);
      } else {
        setStrategyError(
          res.status === 400 ? dict.builder.strategyIncomplete : dict.builder.strategyError
        );
      }
      return;
    }

    const nextStrategies =
      data.strategies ?? (data.strategy ? { en: data.strategy, zh: data.strategy } : null);
    if (!nextStrategies) {
      setStrategyError(dict.builder.strategyError);
      return;
    }

    setStrategies(nextStrategies);
    setStrategySource(data.source ?? (data.cached ? "cache" : "ai"));
    setStrategyCached(!!data.cached);

    const nextHash = data.matchupHash ?? matchupHash;
    if (nextHash) {
      setMatchupHash(nextHash);
      if (data.source !== "fallback") {
        writeStrategySession(nextHash, {
          strategies: nextStrategies,
          quota: data.quota,
          source: "cache",
          cached: true,
        });
      }
    }
  };

  const compareRows = [
    { key: "attack", label: dict.part.statAttack },
    { key: "defense", label: dict.part.statDefense },
    { key: "stamina", label: dict.part.statStamina },
    { key: "burst", label: dict.part.statBurst },
  ] as const;

  const strategySections: { title: string; items: string[] | undefined }[] = [
    { title: dict.builder.openingPlan, items: strategy?.openingPlan },
    { title: dict.builder.winConditions, items: strategy?.winConditions },
    { title: dict.builder.risks, items: strategy?.risks },
    { title: dict.builder.adjustments, items: strategy?.adjustments },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      {/* Left: slots + preview */}
      <div className="space-y-6">
        {/* Assembly preview */}
        <div className="panel bg-grid relative flex flex-col items-center gap-0 px-6 py-8">
          {combo.blade && (
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <TierChip tier={combo.blade.tier} />
              <span className="font-display text-[10px] tracking-widest text-ink-dim">
                {combo.blade.code}
              </span>
            </div>
          )}
          <div className="h-44 w-full max-w-64">
            {combo.blade ? (
              <PartImage
                src={combo.blade.image}
                alt="blade"
                fallbackLabel="X"
                color={TYPE_COLOR[combo.blade.type]}
                sizes="256px"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-edge text-sm text-ink-dim">
                {dict.builder.slotBlade}
              </div>
            )}
          </div>
          {combo.blade?.cx && (
            <div className="-mt-2 h-12 w-full max-w-28 opacity-95">
              <PartImage
                src={combo.lockChip?.image ?? null}
                alt="lock chip"
                fallbackLabel={
                  combo.lockChip ? (locale === "zh" ? combo.lockChip.zh : combo.lockChip.id) : "LC"
                }
                sizes="112px"
              />
            </div>
          )}
          {combo.blade?.cx && combo.assist?.image && (
            <div className="-mt-3 h-16 w-full max-w-40 opacity-95">
              <PartImage src={combo.assist.image} alt="assist" fallbackLabel={combo.assist.id} sizes="160px" />
            </div>
          )}
          <div className="-mt-2 h-20 w-full max-w-36">
            {combo.ratchet ? (
              <PartImage src={combo.ratchet.image} alt="ratchet" fallbackLabel={combo.ratchet.id} sizes="144px" />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-edge text-xs text-ink-dim">
                {dict.builder.slotRatchet}
              </div>
            )}
          </div>
          <div className="-mt-1 h-16 w-full max-w-28">
            {combo.bit ? (
              <PartImage src={combo.bit.image} alt="bit" fallbackLabel={combo.bit.id} sizes="112px" />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-edge text-xs text-ink-dim">
                {dict.builder.slotBit}
              </div>
            )}
          </div>
        </div>

        {/* Slot buttons */}
        <div className="grid grid-cols-2 gap-3">
          {slots
            .filter((s) => !s.hidden)
            .map((s) => (
              <button
                key={s.key}
                onClick={() => setOpenSlot({ target: "own", slot: s.key })}
                className={`panel flex items-center gap-3 p-3 text-left transition hover:border-accent/60 ${
                  s.value ? "" : "border-dashed"
                }`}
              >
                <div className="h-12 w-12 shrink-0">
                  <PartImage src={s.image} alt={s.label} fallbackLabel="+" sizes="48px" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[10px] uppercase tracking-widest text-ink-dim">
                    {s.label}
                  </div>
                  <div className="truncate text-sm font-semibold">
                    {s.value ?? dict.builder.emptySlot}
                  </div>
                </div>
                <span className="ml-auto text-xs text-accent">
                  {s.value ? dict.builder.change : dict.builder.pick}
                </span>
              </button>
            ))}
        </div>

        {combo.blade?.cx && (!combo.lockChip || !combo.assist) && (
          <p className="text-xs text-accent-2">◆ {dict.builder.cxNote}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={randomize}
            className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink transition hover:border-accent-2/60 hover:text-accent-2"
          >
            ⚡ {dict.builder.random}
          </button>
          <button
            onClick={reset}
            className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition hover:text-ink"
          >
            {dict.builder.reset}
          </button>
        </div>
      </div>

      {/* Right: name, stats, share */}
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="font-display text-[10px] uppercase tracking-widest text-ink-dim">
            {dict.builder.comboName}
          </div>
          <div className="mt-1 min-h-9 font-display text-2xl font-bold tracking-wide text-glow text-accent">
            {name || "—"}
          </div>
          {type && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-ink-dim">{dict.builder.comboType}:</span>
              <TypeBadge type={type} dict={dict} />
            </div>
          )}
          {!complete && <p className="mt-3 text-xs text-ink-dim">{dict.builder.incomplete}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={share}
              disabled={!combo.blade}
              className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⤴ {dict.builder.share}
            </button>
            <button
              onClick={copyName}
              disabled={!combo.blade}
              className="clip-x border border-edge bg-panel px-5 py-2.5 font-display text-xs font-bold tracking-wider transition enabled:hover:border-accent/60 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {dict.builder.copyName}
            </button>
          </div>
        </div>

        {stats && (
          <div className="panel p-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-widest text-ink-dim">
              {dict.builder.statsTitle}
            </div>
          <Radar stats={stats} dict={dict} />
        </div>
      )}
      </div>
      </div>

      <div className={`panel p-5 ${strategyLocked ? "opacity-50" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-[10px] uppercase tracking-widest text-ink-dim">
              {dict.builder.strategyTitle}
            </div>
            <h2 className="mt-1 font-display text-xl font-bold tracking-wide text-accent">
              {dict.builder.opponentBuild}
            </h2>
            <p className="mt-1 text-sm text-ink-dim">{dict.builder.strategySubtitle}</p>
          </div>
          {strategyLocked && (
            <Link
              href={`/${locale}/login`}
              className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-accent"
            >
              {dict.auth.login}
            </Link>
          )}
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {opponentSlots
                .filter((s) => !s.hidden)
                .map((s) => (
                  <button
                    key={s.key}
                    disabled={strategyLocked}
                    onClick={() => setOpenSlot({ target: "opponent", slot: s.key })}
                    className={`panel flex items-center gap-3 p-3 text-left transition enabled:hover:border-accent/60 disabled:cursor-not-allowed ${
                      s.value ? "" : "border-dashed"
                    }`}
                  >
                    <div className="h-12 w-12 shrink-0">
                      <PartImage src={s.image} alt={s.label} fallbackLabel="+" sizes="48px" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-[10px] uppercase tracking-widest text-ink-dim">
                        {s.label}
                      </div>
                      <div className="truncate text-sm font-semibold">
                        {s.value ?? dict.builder.emptySlot}
                      </div>
                    </div>
                    <span className="ml-auto text-xs text-accent">
                      {s.value ? dict.builder.change : dict.builder.pick}
                    </span>
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={resetOpponent}
                disabled={strategyLocked}
                className="clip-x border border-edge bg-panel px-4 py-2 font-display text-xs font-bold tracking-wider text-ink-dim transition enabled:hover:text-ink disabled:cursor-not-allowed"
              >
                {dict.builder.reset}
              </button>
              {!strategyLocked && opponentName && (
                <span className="self-center truncate text-sm text-ink-dim">{opponentName}</span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-3 font-display text-[10px] uppercase tracking-widest text-ink-dim">
                {dict.builder.statCompare}
              </div>
              <div className="space-y-2">
                {compareRows.map((row) => {
                  const ownValue = stats?.[row.key] ?? 0;
                  const opponentValue = opponentStats?.[row.key] ?? 0;
                  const total = Math.max(1, ownValue + opponentValue);
                  return (
                    <div key={row.key} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs">
                      <span className="text-ink-dim">{row.label}</span>
                      <div className="grid h-2 grid-cols-2 overflow-hidden rounded-full bg-panel-2">
                        <div
                          className="bg-accent"
                          style={{ width: `${Math.max(8, (ownValue / total) * 100)}%` }}
                        />
                        <div
                          className="ml-auto bg-accent-2"
                          style={{ width: `${Math.max(8, (opponentValue / total) * 100)}%` }}
                        />
                      </div>
                      <span className="font-display text-ink-dim">
                        {ownValue}/{opponentValue}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={analyzeStrategy}
                disabled={strategyLocked || strategyBusy || !complete || !opponentComplete}
                className="clip-x bg-accent px-5 py-2.5 font-display text-xs font-bold tracking-wider text-bg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {strategyBusy ? dict.builder.analyzing : dict.builder.analyze}
              </button>
              {type && <TypeBadge type={type} dict={dict} />}
              {opponentType && <TypeBadge type={opponentType} dict={dict} />}
              {quotaText && <span className="text-xs text-ink-dim">{quotaText}</span>}
            </div>

            {strategyLocked && (
              <p className="text-sm text-ink-dim">{dict.builder.loginForStrategy}</p>
            )}
            {strategyStatus && <p className="text-sm text-ink-dim">{strategyStatus}</p>}
            {strategyError && <p className="text-sm font-semibold text-atk">{strategyError}</p>}

            {strategy && (
              <div className="space-y-4 border-t border-edge pt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-ink-dim">
                      {dict.builder.matchupEdge}
                    </div>
                    <div className="font-display text-sm font-bold text-accent">
                      {strategy.edge ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-ink-dim">
                      {dict.builder.confidence}
                    </div>
                    <div className="font-display text-sm font-bold text-accent-2">
                      {strategy.confidence ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-ink-dim">
                      {dict.builder.prediction}
                    </div>
                    <div className="text-sm font-semibold">{strategy.prediction ?? "-"}</div>
                  </div>
                </div>
                {strategy.summary && (
                  <p className="text-sm leading-relaxed text-ink-dim">{strategy.summary}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {strategySections.map((section) => (
                    <div key={section.title}>
                      <div className="mb-1 font-display text-xs font-bold tracking-wider">
                        {section.title}
                      </div>
                      <ul className="space-y-1 text-sm text-ink-dim">
                        {(section.items ?? []).map((item, i) => (
                          <li key={`${section.title}-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {openSlot && (
        <PickerModal
          title={slotLabels[openSlot.slot]}
          items={pickerItems[openSlot.slot]}
          dict={dict}
          onClose={() => setOpenSlot(null)}
          onPick={(id) => {
            const targetSetters = openSlot.target === "own" ? setters : opponentSetters;
            targetSetters[openSlot.slot](id);
            setStrategies(null);
            setStrategySource(null);
            setStrategyCached(false);
            setStrategyError(null);
            setOpenSlot(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-accent px-5 py-2 font-display text-xs font-bold text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
