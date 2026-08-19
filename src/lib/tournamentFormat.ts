export type TournamentTemplateFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "swiss"
  | "free_for_all"
  | "leaderboard"
  | "partner"
  | "group_stage";

export type TournamentStageType =
  | "group"
  | "swiss"
  | "round_robin"
  | "knockout"
  | "free_for_all"
  | "leaderboard"
  | "finals";

export type TournamentSeedingMode = "seeded" | "random" | "manual";
export type TournamentAdvanceRule = "winners" | "top_n" | "points" | "manual";

export interface TournamentFormatStage {
  id: string;
  name: string;
  type: TournamentStageType;
  entrants: number;
  groups?: number;
  rounds?: number;
  advanceCount: number;
  targetScore: number;
  seeding: TournamentSeedingMode;
  advanceRule: TournamentAdvanceRule;
  thirdPlace: boolean;
  consolation: boolean;
}

export interface TournamentFormatConfig {
  version: 1;
  enabled: boolean;
  template: TournamentTemplateFormat;
  stages: TournamentFormatStage[];
}

const FORMATS: TournamentTemplateFormat[] = [
  "single_elimination",
  "double_elimination",
  "round_robin",
  "swiss",
  "free_for_all",
  "leaderboard",
  "partner",
  "group_stage",
];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asFormat(value: unknown, fallback: TournamentTemplateFormat) {
  return FORMATS.includes(value as TournamentTemplateFormat) ? (value as TournamentTemplateFormat) : fallback;
}

function asStageType(value: unknown, fallback: TournamentStageType) {
  return STAGE_TYPES.includes(value as TournamentStageType) ? (value as TournamentStageType) : fallback;
}

function asSeeding(value: unknown, fallback: TournamentSeedingMode) {
  return SEEDING_MODES.includes(value as TournamentSeedingMode) ? (value as TournamentSeedingMode) : fallback;
}

function asAdvanceRule(value: unknown, fallback: TournamentAdvanceRule) {
  return ADVANCE_RULES.includes(value as TournamentAdvanceRule) ? (value as TournamentAdvanceRule) : fallback;
}

export function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function stage(
  id: string,
  name: string,
  type: TournamentStageType,
  entrants: number,
  advanceCount: number,
  targetScore: number,
  extra: Partial<TournamentFormatStage> = {},
): TournamentFormatStage {
  return {
    id,
    name,
    type,
    entrants,
    advanceCount,
    targetScore,
    seeding: extra.seeding ?? "seeded",
    advanceRule: extra.advanceRule ?? "winners",
    thirdPlace: extra.thirdPlace ?? false,
    consolation: extra.consolation ?? false,
    groups: extra.groups,
    rounds: extra.rounds,
  };
}

export function defaultTournamentFormatConfig(
  format: TournamentTemplateFormat,
  maxPlayers: number,
  targetScore = 4,
  enabled = false,
): TournamentFormatConfig {
  const entrants = clampInt(maxPlayers, 16, 2, 256);
  const score = clampInt(targetScore, 4, 1, 30);
  const topCut = entrants >= 32 ? 16 : entrants >= 16 ? 8 : entrants >= 8 ? 4 : 2;

  const stages: TournamentFormatStage[] =
    format === "group_stage"
      ? [
          stage("group", "Group stage", "group", entrants, Math.min(16, Math.max(2, topCut)), score, {
            groups: Math.min(8, Math.max(2, Math.ceil(entrants / 4))),
            advanceRule: "top_n",
            seeding: "seeded",
          }),
          stage("knockout", "Top cut", "knockout", Math.min(16, Math.max(2, topCut)), 1, 7, {
            thirdPlace: true,
          }),
        ]
      : format === "double_elimination"
        ? [
            stage("main", "Winners bracket", "knockout", entrants, 1, score, { seeding: "seeded" }),
            stage("losers", "Losers bracket", "knockout", entrants, 1, score, {
              advanceRule: "manual",
              consolation: true,
            }),
            stage("grand", "Grand final", "finals", 2, 1, 7),
          ]
        : format === "round_robin"
          ? [stage("league", "Round robin", "round_robin", entrants, 1, score, { advanceRule: "points" })]
          : format === "swiss"
            ? [
                stage("swiss", "Swiss rounds", "swiss", entrants, topCut, score, {
                  rounds: Math.ceil(Math.log2(Math.max(2, entrants))),
                  advanceRule: "points",
                }),
                stage("knockout", "Top cut", "knockout", topCut, 1, 7, { thirdPlace: true }),
              ]
            : format === "free_for_all"
              ? [
                  stage("qualifier", "Free-for-all heats", "free_for_all", entrants, topCut, score, {
                    advanceRule: "top_n",
                  }),
                  stage("knockout", "Final bracket", "knockout", topCut, 1, 7, { thirdPlace: true }),
                ]
              : format === "leaderboard"
                ? [stage("ladder", "Leaderboard", "leaderboard", entrants, 1, score, { advanceRule: "points" })]
                : format === "partner"
                  ? [
                      stage("league", "Team league", "round_robin", entrants, 4, 7, {
                        advanceRule: "points",
                        seeding: "random",
                      }),
                      stage("playoff", "Title playoff", "knockout", 4, 1, 7, {
                        consolation: true,
                      }),
                    ]
                  : [stage("knockout", "Knockout", "knockout", entrants, 1, score, { thirdPlace: true })];

  return {
    version: 1,
    enabled,
    template: format,
    stages,
  };
}

function normalizeStage(value: unknown, index: number, maxPlayers: number, targetScore: number): TournamentFormatStage {
  const source = isRecord(value) ? value : {};
  const fallback = stage(
    `stage_${index + 1}`,
    `Stage ${index + 1}`,
    "knockout",
    maxPlayers,
    1,
    targetScore,
  );

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 40) : fallback.id,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 48) : fallback.name,
    type: asStageType(source.type, fallback.type),
    entrants: clampInt(source.entrants, fallback.entrants, 2, 256),
    groups: source.groups == null ? undefined : clampInt(source.groups, 2, 2, 32),
    rounds: source.rounds == null ? undefined : clampInt(source.rounds, 1, 1, 16),
    advanceCount: clampInt(source.advanceCount, fallback.advanceCount, 1, 256),
    targetScore: clampInt(source.targetScore, fallback.targetScore, 1, 30),
    seeding: asSeeding(source.seeding, fallback.seeding),
    advanceRule: asAdvanceRule(source.advanceRule, fallback.advanceRule),
    thirdPlace: Boolean(source.thirdPlace),
    consolation: Boolean(source.consolation),
  };
}

export function normalizeTournamentFormatConfig(
  value: unknown,
  format: TournamentTemplateFormat,
  maxPlayers: number,
  targetScore = 4,
): TournamentFormatConfig {
  const fallback = defaultTournamentFormatConfig(format, maxPlayers, targetScore, false);
  if (!isRecord(value)) return fallback;

  const enabled = Boolean(value.enabled);
  const template = asFormat(value.template, format);
  const rawStages = Array.isArray(value.stages) ? value.stages : fallback.stages;
  const stages = rawStages
    .slice(0, 8)
    .map((raw, index) => normalizeStage(raw, index, maxPlayers, targetScore));

  return {
    version: 1,
    enabled,
    template,
    stages: stages.length > 0 ? stages : fallback.stages,
  };
}

export function tournamentFormatConfigForSave(
  value: TournamentFormatConfig,
  format: TournamentTemplateFormat,
  maxPlayers: number,
  targetScore = 4,
) {
  const normalized = normalizeTournamentFormatConfig(value, format, maxPlayers, targetScore);
  return normalized.enabled
    ? { ...normalized, template: format }
    : { version: 1, enabled: false, template: format, stages: [] };
}

export function tournamentFormatStageSummary(stage: TournamentFormatStage) {
  const parts = [`${stage.entrants} players`, `top ${stage.advanceCount}`];
  if (stage.groups) parts.push(`${stage.groups} groups`);
  if (stage.rounds) parts.push(`${stage.rounds} rounds`);
  parts.push(`first to ${stage.targetScore}`);
  if (stage.thirdPlace) parts.push("3rd place");
  if (stage.consolation) parts.push("consolation");
  return parts.join(" · ");
}

export function tournamentFormatSummaryLines(value: unknown, format: TournamentTemplateFormat, maxPlayers: number, targetScore = 4) {
  const config = normalizeTournamentFormatConfig(value, format, maxPlayers, targetScore);
  if (!config.enabled) return [];
  return config.stages.map((stage) => `${stage.name}: ${tournamentFormatStageSummary(stage)}`);
}
