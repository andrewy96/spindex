"use client";

import { Dict } from "@/i18n";
import { TournamentFormat } from "@/lib/supabase";
import {
  defaultTournamentFormatConfig,
  normalizeTournamentFormatConfig,
  TournamentAdvanceRule,
  TournamentFormatConfig,
  TournamentFormatStage,
  TournamentSeedingMode,
  TournamentStageType,
} from "@/lib/tournamentFormat";

const rowInputCls =
  "w-full rounded-md border border-edge bg-bg px-2 py-1.5 text-xs outline-none transition focus:border-accent";

const STAGE_TYPES: TournamentStageType[] = [
  "group",
  "swiss",
  "round_robin",
  "knockout",
  "free_for_all",
  "leaderboard",
  "finals",
];

const SEEDING_MODES: TournamentSeedingMode[] = ["seeded", "random", "manual"];
const ADVANCE_RULES: TournamentAdvanceRule[] = ["winners", "top_n", "points", "manual"];

function stageTypeLabel(type: TournamentStageType, labels: Dict["tournaments"]) {
  return {
    group: labels.formatStageTypeGroup,
    swiss: labels.formatStageTypeSwiss,
    round_robin: labels.formatStageTypeRoundRobin,
    knockout: labels.formatStageTypeKnockout,
    free_for_all: labels.formatStageTypeFreeForAll,
    leaderboard: labels.formatStageTypeLeaderboard,
    finals: labels.formatStageTypeFinals,
  }[type];
}

function seedingLabel(mode: TournamentSeedingMode, labels: Dict["tournaments"]) {
  return {
    seeded: labels.formatSeedSeeded,
    random: labels.formatSeedRandom,
    manual: labels.formatSeedManual,
  }[mode];
}

function advanceRuleLabel(rule: TournamentAdvanceRule, labels: Dict["tournaments"]) {
  return {
    winners: labels.formatAdvanceWinners,
    top_n: labels.formatAdvanceTop,
    points: labels.formatAdvancePoints,
    manual: labels.formatAdvanceManual,
  }[rule];
}

function stageSummary(stage: TournamentFormatStage, labels: Dict["tournaments"]) {
  const parts = [
    `${stage.entrants} ${labels.formatEntrants}`,
    `${labels.formatAdvance} ${stage.advanceCount}`,
  ];
  if (stage.groups) parts.push(`${stage.groups} ${labels.formatGroups}`);
  if (stage.rounds) parts.push(`${stage.rounds} ${labels.formatRounds}`);
  parts.push(`${labels.formatTargetScore} ${stage.targetScore}`);
  if (stage.thirdPlace) parts.push(labels.formatThirdPlace);
  if (stage.consolation) parts.push(labels.formatConsolation);
  return parts.join(" · ");
}

function nextStageId(stages: TournamentFormatStage[]) {
  return `stage_${stages.length + 1}_${Date.now().toString(36)}`;
}

function renumberFallbackStageNames(stages: TournamentFormatStage[]) {
  return stages.map((stage, index) =>
    /^Stage \d+/.test(stage.name) ? { ...stage, name: `Stage ${index + 1}` } : stage,
  );
}

export function TournamentFormatSummary({
  value,
  format,
  maxPlayers,
  targetScore,
  labels,
  compact = false,
}: {
  value: unknown;
  format: TournamentFormat;
  maxPlayers: number;
  targetScore: number;
  labels: Dict["tournaments"];
  compact?: boolean;
}) {
  const config = normalizeTournamentFormatConfig(value, format, maxPlayers, targetScore);
  if (!config.enabled) return null;

  return (
    <div className={compact ? "grid gap-1.5 text-[10px]" : "mt-4 rounded-md border border-edge bg-bg p-3"}>
      {!compact && (
        <div className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-accent-2">
          {labels.formatSummary}
        </div>
      )}
      <div className={compact ? "flex flex-wrap gap-1.5" : "grid gap-1.5"}>
        {config.stages.map((stage, index) => (
          <div
            key={`${stage.id}-${index}`}
            className={compact ? "rounded bg-accent/10 px-2 py-0.5 text-accent" : "text-xs leading-relaxed text-ink-dim"}
          >
            {stage.name}: {stageSummary(stage, labels)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TournamentFormatDesigner({
  value,
  onChange,
  format,
  maxPlayers,
  targetScore,
  labels,
}: {
  value: TournamentFormatConfig;
  onChange: (next: TournamentFormatConfig) => void;
  format: TournamentFormat;
  maxPlayers: number;
  targetScore: number;
  labels: Dict["tournaments"];
}) {
  const config = normalizeTournamentFormatConfig(value, format, maxPlayers, targetScore);

  const setEnabled = (enabled: boolean) => {
    onChange({ ...config, enabled, template: format });
  };

  const setStages = (stages: TournamentFormatStage[]) => {
    onChange({ ...config, enabled: true, template: format, stages: renumberFallbackStageNames(stages) });
  };

  const updateStage = (id: string, patch: Partial<TournamentFormatStage>) => {
    setStages(config.stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)));
  };

  const moveStage = (index: number, delta: -1 | 1) => {
    const next = [...config.stages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next);
  };

  const addStage = () => {
    setStages([
      ...config.stages,
      {
        id: nextStageId(config.stages),
        name: `Stage ${config.stages.length + 1}`,
        type: "knockout",
        entrants: Math.max(2, Math.min(256, maxPlayers)),
        advanceCount: 1,
        targetScore: Math.max(1, Math.min(30, targetScore)),
        seeding: "seeded",
        advanceRule: "winners",
        thirdPlace: false,
        consolation: false,
      },
    ]);
  };

  const reset = () => onChange(defaultTournamentFormatConfig(format, maxPlayers, targetScore, true));

  return (
    <div className="sm:col-span-2 rounded-md border border-edge bg-panel p-3">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-1 size-4 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">{labels.formatCustomize}</span>
          <span className="block text-xs leading-relaxed text-ink-dim">{labels.formatCustomizeDesc}</span>
        </span>
      </label>

      {config.enabled && (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-display text-xs font-bold uppercase tracking-wider text-accent-2">
              {labels.formatDesignerTitle}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addStage}
                className="clip-x border border-accent/50 bg-accent/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-accent transition hover:bg-accent/20"
              >
                {labels.formatAddStage}
              </button>
              <button
                type="button"
                onClick={reset}
                className="clip-x border border-edge bg-panel-2 px-3 py-1.5 font-display text-[10px] font-bold tracking-wider text-ink-dim transition hover:text-ink"
              >
                {labels.formatReset}
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {config.stages.map((stage, index) => (
              <div key={stage.id} className="rounded-md border border-edge bg-panel-2 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-display text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    {labels.formatStage} {index + 1}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveStage(index, -1)}
                      disabled={index === 0}
                      className="rounded border border-edge bg-bg px-2 py-1 text-[10px] font-semibold text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
                    >
                      {labels.formatMoveUp}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStage(index, 1)}
                      disabled={index === config.stages.length - 1}
                      className="rounded border border-edge bg-bg px-2 py-1 text-[10px] font-semibold text-ink-dim transition enabled:hover:text-ink disabled:opacity-40"
                    >
                      {labels.formatMoveDown}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStages(config.stages.filter((item) => item.id !== stage.id))}
                      disabled={config.stages.length <= 1}
                      className="rounded border border-atk/40 bg-atk/10 px-2 py-1 text-[10px] font-semibold text-atk transition enabled:hover:bg-atk enabled:hover:text-bg disabled:opacity-40"
                    >
                      {labels.formatRemoveStage}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatStageName}
                    </span>
                    <input
                      value={stage.name}
                      onChange={(event) => updateStage(stage.id, { name: event.target.value })}
                      maxLength={48}
                      className={rowInputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatStageType}
                    </span>
                    <select
                      value={stage.type}
                      onChange={(event) => updateStage(stage.id, { type: event.target.value as TournamentStageType })}
                      className={rowInputCls}
                    >
                      {STAGE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {stageTypeLabel(type, labels)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatEntrants}
                    </span>
                    <input
                      type="number"
                      min={2}
                      max={256}
                      value={stage.entrants}
                      onChange={(event) => updateStage(stage.id, { entrants: Number(event.target.value) })}
                      className={rowInputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatAdvance}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={256}
                      value={stage.advanceCount}
                      onChange={(event) => updateStage(stage.id, { advanceCount: Number(event.target.value) })}
                      className={rowInputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatGroups}
                    </span>
                    <input
                      type="number"
                      min={2}
                      max={32}
                      value={stage.groups ?? ""}
                      onChange={(event) => updateStage(stage.id, { groups: event.target.value ? Number(event.target.value) : undefined })}
                      className={rowInputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatRounds}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={stage.rounds ?? ""}
                      onChange={(event) => updateStage(stage.id, { rounds: event.target.value ? Number(event.target.value) : undefined })}
                      className={rowInputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatTargetScore}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={stage.targetScore}
                      onChange={(event) => updateStage(stage.id, { targetScore: Number(event.target.value) })}
                      className={rowInputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatSeeding}
                    </span>
                    <select
                      value={stage.seeding}
                      onChange={(event) => updateStage(stage.id, { seeding: event.target.value as TournamentSeedingMode })}
                      className={rowInputCls}
                    >
                      {SEEDING_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {seedingLabel(mode, labels)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
                      {labels.formatAdvanceRule}
                    </span>
                    <select
                      value={stage.advanceRule}
                      onChange={(event) => updateStage(stage.id, { advanceRule: event.target.value as TournamentAdvanceRule })}
                      className={rowInputCls}
                    >
                      {ADVANCE_RULES.map((rule) => (
                        <option key={rule} value={rule}>
                          {advanceRuleLabel(rule, labels)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-edge bg-bg px-2 py-1.5 text-xs text-ink-dim">
                    <input
                      type="checkbox"
                      checked={stage.thirdPlace}
                      onChange={(event) => updateStage(stage.id, { thirdPlace: event.target.checked })}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    {labels.formatThirdPlace}
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-edge bg-bg px-2 py-1.5 text-xs text-ink-dim">
                    <input
                      type="checkbox"
                      checked={stage.consolation}
                      onChange={(event) => updateStage(stage.id, { consolation: event.target.checked })}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    {labels.formatConsolation}
                  </label>
                </div>

                <div className="mt-2 rounded bg-bg px-2 py-1.5 text-[10px] leading-relaxed text-ink-dim">
                  {stageSummary(stage, labels)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
