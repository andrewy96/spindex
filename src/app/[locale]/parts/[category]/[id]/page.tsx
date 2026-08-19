import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale, Locale, locales, Dict } from "@/i18n";
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
  bladeVariants,
  Blade,
} from "@/data/parts";
import { TypeBadge, TierChip, SpinBadge, TYPE_COLOR } from "@/components/badges";
import StatBars from "@/components/StatBars";
import PartImage from "@/components/PartImage";
import { BladeCard } from "@/components/PartCard";

const CATEGORIES = ["blade", "lock-chip", "ratchet", "bit", "assist"] as const;
type Category = (typeof CATEGORIES)[number];

export function generateStaticParams() {
  const params: { locale: string; category: string; id: string }[] = [];
  for (const locale of locales) {
    for (const b of blades) params.push({ locale, category: "blade", id: b.id });
    for (const l of lockChips) params.push({ locale, category: "lock-chip", id: l.id });
    for (const r of ratchets) params.push({ locale, category: "ratchet", id: r.id });
    for (const b of bits) params.push({ locale, category: "bit", id: b.id });
    for (const a of assists) params.push({ locale, category: "assist", id: a.id });
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string; id: string }>;
}): Promise<Metadata> {
  const { locale, category, id } = await params;
  if (!isLocale(locale) || category !== "blade") return {};
  const blade = findBlade(decodeURIComponent(id));
  if (!blade) return {};
  return { title: locale === "zh" ? blade.zh : blade.enFull };
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge/60 py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-ink-dim">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

/** "固鎖：9-60, W / 4-55 | 軸心：LF / UF" → localized sections with chips. */
function CombosBlock({ combos, dict }: { combos: string; dict: Dict }) {
  const sections = combos.split("|").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      {sections.map((sec, i) => {
        const [rawLabel, rest] = sec.split(/[:：]/, 2);
        const label = rawLabel?.includes("固鎖")
          ? dict.part.ratchet
          : rawLabel?.includes("軸心")
            ? dict.part.bit
            : rawLabel;
        const options = (rest ?? "").split("/").map((o) => o.trim()).filter(Boolean);
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-dim">{label}:</span>
            {options.map((o, j) => (
              <span key={j} className="rounded bg-panel-2 px-2 py-0.5 font-display text-xs text-accent-2">
                {o}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BladeDetail({ blade, locale, dict }: { blade: Blade; locale: Locale; dict: Dict }) {
  const name = locale === "zh" ? blade.zh : blade.enFull;
  const altName = locale === "zh" ? blade.enFull : blade.zh;
  const variants = bladeVariants(blade.canonical).filter((v) => v.id !== blade.id);
  const stockLockChip = blade.lockChip ? findLockChip(blade.lockChip) : null;
  const builderHref = `/${locale}/catalog?tab=builder&b=${encodeURIComponent(blade.id)}${
    blade.cx && blade.lockChip ? `&l=${encodeURIComponent(blade.lockChip)}` : ""
  }${
    blade.stockRatchet ? `&r=${encodeURIComponent(blade.stockRatchet)}` : ""
  }${blade.stockBit ? `&t=${encodeURIComponent(blade.stockBit)}` : ""}${
    blade.cx && blade.stockAssist ? `&a=${encodeURIComponent(blade.stockAssist)}` : ""
  }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/${locale}/catalog`} className="text-sm text-ink-dim hover:text-accent">
        ← {dict.part.back}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Image panel */}
        <div className="panel bg-grid relative flex min-h-72 items-center justify-center p-8">
          <div className="absolute left-3 top-3">
            <TierChip tier={blade.tier} size="md" />
          </div>
          <div className="absolute right-3 top-3 font-display text-xs tracking-widest text-ink-dim">
            {blade.code}
          </div>
          <div className="h-64 w-full">
            <PartImage
              src={blade.image}
              alt={name}
              fallbackLabel="X"
              color={TYPE_COLOR[blade.type]}
              sizes="(max-width: 1024px) 90vw, 460px"
              priority
            />
          </div>
        </div>

        {/* Info panel */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={blade.type} dict={dict} size="md" />
            <SpinBadge spin={blade.spin} dict={dict} />
            {blade.cx && (
              <span className="rounded-full bg-accent-2/10 px-3 py-1 text-xs font-semibold text-accent-2">
                {dict.part.cxPart}
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-wide sm:text-4xl">{name}</h1>
          <p className="mt-1 text-lg text-ink-dim">{altName}</p>
          {blade.review && (
            <p className="mt-1 text-xs italic text-ink-dim/70">* {dict.part.reviewNote}</p>
          )}

          <div className="panel mt-6 px-4 py-1">
            <InfoRow label={dict.part.code}>{blade.code}</InfoRow>
            <InfoRow label={dict.part.line}>{dict.lines[blade.line]}</InfoRow>
            <InfoRow label={dict.part.spin}>{dict.spin[blade.spin]}</InfoRow>
            {blade.tier && <InfoRow label={dict.part.tier}><TierChip tier={blade.tier} /></InfoRow>}
            {blade.source && <InfoRow label={dict.part.source}>{blade.source}</InfoRow>}
            {(blade.stockRatchet || blade.stockBit) && (
              <InfoRow label={dict.part.stockCombo}>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {blade.lockChip && blade.cx && (
                    <Link href={`/${locale}/parts/lock-chip/${encodeURIComponent(blade.lockChip)}`} className="rounded bg-panel-2 px-2 py-0.5 font-display text-xs text-accent-2 hover:text-accent">
                      {locale === "zh" ? stockLockChip?.zh ?? blade.lockChip : blade.lockChip}
                    </Link>
                  )}
                  {blade.stockAssist && blade.cx && (
                    <Link href={`/${locale}/parts/assist/${encodeURIComponent(blade.stockAssist)}`} className="rounded bg-panel-2 px-2 py-0.5 font-display text-xs text-accent-2 hover:text-accent">
                      {blade.stockAssist}
                    </Link>
                  )}
                  {blade.stockRatchet && (
                    <Link href={`/${locale}/parts/ratchet/${encodeURIComponent(blade.stockRatchet)}`} className="rounded bg-panel-2 px-2 py-0.5 font-display text-xs text-accent-2 hover:text-accent">
                      {blade.stockRatchet}
                    </Link>
                  )}
                  {blade.stockBit && (
                    <Link href={`/${locale}/parts/bit/${encodeURIComponent(blade.stockBit)}`} className="rounded bg-panel-2 px-2 py-0.5 font-display text-xs text-accent-2 hover:text-accent">
                      {blade.stockBit}
                    </Link>
                  )}
                </span>
              </InfoRow>
            )}
          </div>

          <div className="panel mt-4 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold">{dict.part.powerProfile}</span>
              <span className="text-[10px] text-ink-dim">{dict.part.powerNote}</span>
            </div>
            <StatBars stats={blade.stats} dict={dict} />
          </div>

          {blade.combos && (
            <div className="panel mt-4 p-4">
              <div className="mb-2 text-sm font-semibold">{dict.part.suggestedCombos}</div>
              <CombosBlock combos={blade.combos} dict={dict} />
            </div>
          )}

          <Link
            href={builderHref}
            className="clip-x mt-6 inline-block bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
          >
            {dict.part.useInBuilder} →
          </Link>
        </div>
      </div>

      {variants.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-display text-xl font-bold tracking-wide">{dict.part.variants}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {variants.map((v) => (
              <BladeCard key={v.id} blade={v} locale={locale} dict={dict} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleDetail({
  category,
  id,
  locale,
  dict,
}: {
  category: Exclude<Category, "blade">;
  id: string;
  locale: Locale;
  dict: Dict;
}) {
  const part =
    category === "ratchet"
      ? findRatchet(id)
      : category === "bit"
        ? findBit(id)
        : category === "lock-chip"
          ? findLockChip(id)
          : findAssist(id);
  if (!part) notFound();

  const title =
    category === "lock-chip" && locale === "zh"
      ? (part as unknown as { zh: string }).zh
      : part.id;
  const catLabel =
    category === "ratchet"
      ? dict.part.ratchet
      : category === "bit"
        ? dict.part.bit
        : category === "lock-chip"
          ? dict.part.lockChip
          : dict.part.assist;
  const builderParam =
    category === "ratchet" ? "r" : category === "bit" ? "t" : category === "lock-chip" ? "l" : "a";
  const name = "name" in part ? part.name : null;
  const isMetalLockChip = category === "lock-chip" && "hasMetal" in part && part.hasMetal === true;

  const usedBy = blades
    .filter((b) =>
      category === "ratchet"
        ? b.stockRatchet === id
        : category === "bit"
          ? b.stockBit === id
          : category === "lock-chip"
            ? b.lockChip === id
            : b.stockAssist === id
    )
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/${locale}/catalog`} className="text-sm text-ink-dim hover:text-accent">
        ← {dict.part.back}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="panel bg-grid flex min-h-64 items-center justify-center p-8">
          <div className="h-52 w-full">
            <PartImage src={part.image} alt={title} fallbackLabel={title} sizes="(max-width: 1024px) 90vw, 420px" priority />
          </div>
        </div>
        <div>
          <span className="rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold text-ink-dim">
            {catLabel}
          </span>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-wide">{title}</h1>
          {name && <p className="mt-1 text-lg text-ink-dim">{name}</p>}

          <div className="panel mt-6 px-4 py-1">
            {category === "ratchet" && "height" in part && (
              <>
                {part.prongs != null && <InfoRow label={dict.part.prongs}>{part.prongs}</InfoRow>}
                {part.height != null && (
                  <InfoRow label={dict.part.height}>{part.height.toFixed(1)} mm</InfoRow>
                )}
                {part.isMetal && <InfoRow label={dict.part.metalRatchet}>✓</InfoRow>}
              </>
            )}
            {name && <InfoRow label={dict.part.fullName}>{name}</InfoRow>}
            {isMetalLockChip && (
              <InfoRow label={dict.part.metalLockChip}>âœ“</InfoRow>
            )}
            {category === "lock-chip" && <InfoRow label={dict.part.line}>{dict.lines.CX}</InfoRow>}
            {category === "assist" && <InfoRow label={dict.part.line}>{dict.lines.CX}</InfoRow>}
          </div>

          <Link
            href={`/${locale}/catalog?tab=builder&${builderParam}=${encodeURIComponent(id)}`}
            className="clip-x mt-6 inline-block bg-accent px-6 py-3 font-display text-sm font-bold tracking-wider text-bg transition hover:brightness-110"
          >
            {dict.part.useInBuilder} →
          </Link>
        </div>
      </div>

      {usedBy.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-display text-xl font-bold tracking-wide">
            {dict.part.stockCombo}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {usedBy.map((b) => (
              <BladeCard key={b.id} blade={b} locale={locale} dict={dict} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function PartPage({
  params,
}: {
  params: Promise<{ locale: string; category: string; id: string }>;
}) {
  const { locale: raw, category, id: rawId } = await params;
  if (!isLocale(raw) || !CATEGORIES.includes(category as Category)) notFound();
  const locale = raw as Locale;
  const dict = getDict(locale);
  const id = decodeURIComponent(rawId);

  if (category === "blade") {
    const blade = findBlade(id);
    if (!blade) notFound();
    return <BladeDetail blade={blade} locale={locale} dict={dict} />;
  }
  return (
    <SimpleDetail
      category={category as Exclude<Category, "blade">}
      id={id}
      locale={locale}
      dict={dict}
    />
  );
}
