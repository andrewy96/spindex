export const TOURNAMENT_REGISTRATION_PROOF_BUCKET = "tournament-registration-proofs";

export const TOURNAMENT_REGISTRATION_PROOF_ACCEPT = "image/png,image/jpeg,image/webp";
export const TOURNAMENT_REGISTRATION_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const TOURNAMENT_REGISTRATION_PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const DEFAULT_TOURNAMENT_PAYMENT_INSTRUCTIONS =
  "TNG Payment- 0126262802 (ANDREW YAP JIUN HERNG)";
export const DEFAULT_TOURNAMENT_PAYMENT_REMARK =
  "MENTION TEAM NAME - EXAMPLE Team main maju - SPINDEX team event";

export interface TournamentRegistrationCustomField {
  id: string;
  label: string;
  required: boolean;
}

export interface TournamentRegistrationConfig {
  enabled: boolean;
  teamNameEnabled: boolean;
  teamNameRequired: boolean;
  paymentInstructions: string;
  paymentRemarkHint: string;
  paymentProofRequired: boolean;
  customFields: TournamentRegistrationCustomField[];
}

export const TEAM_BLADER_CUSTOM_FIELDS: TournamentRegistrationCustomField[] = [
  { id: "blader_2_name", label: "Blader 2 name", required: true },
  { id: "blader_3_name", label: "Blader 3 name", required: true },
];

export const DEFAULT_TOURNAMENT_REGISTRATION_CONFIG: TournamentRegistrationConfig = {
  enabled: true,
  teamNameEnabled: true,
  teamNameRequired: true,
  paymentInstructions: DEFAULT_TOURNAMENT_PAYMENT_INSTRUCTIONS,
  paymentRemarkHint: DEFAULT_TOURNAMENT_PAYMENT_REMARK,
  paymentProofRequired: true,
  customFields: [],
};

function comparableFieldLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeTournamentRegistrationConfig(value: unknown): TournamentRegistrationConfig {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const customFields = Array.isArray(input.customFields)
    ? input.customFields
        .map((raw, index) => {
          const field =
            raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : {};
          const label = cleanText(field.label).slice(0, 80);
          if (!label) return null;
          const id = cleanText(field.id, `field_${index + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40);
          return {
            id: id || `field_${index + 1}`,
            label,
            required: cleanBool(field.required, false),
          };
        })
        .filter((field): field is TournamentRegistrationCustomField => !!field)
        .slice(0, 6)
    : [];

  const teamNameEnabled = cleanBool(input.teamNameEnabled, DEFAULT_TOURNAMENT_REGISTRATION_CONFIG.teamNameEnabled);

  return {
    enabled: cleanBool(input.enabled, DEFAULT_TOURNAMENT_REGISTRATION_CONFIG.enabled),
    teamNameEnabled,
    teamNameRequired: teamNameEnabled,
    paymentInstructions:
      cleanText(input.paymentInstructions) || DEFAULT_TOURNAMENT_REGISTRATION_CONFIG.paymentInstructions,
    paymentRemarkHint:
      cleanText(input.paymentRemarkHint) || DEFAULT_TOURNAMENT_REGISTRATION_CONFIG.paymentRemarkHint,
    paymentProofRequired: true,
    customFields,
  };
}

export function tournamentRegistrationConfigForSave(
  config: TournamentRegistrationConfig,
): TournamentRegistrationConfig {
  const normalized = normalizeTournamentRegistrationConfig(config);
  return {
    ...normalized,
    teamNameRequired: normalized.teamNameEnabled,
    paymentProofRequired: true,
    customFields: normalized.customFields.map((field, index) => ({
      ...field,
      id: field.id || `field_${index + 1}`,
    })),
  };
}

export function ensureTeamBladerCustomFields(
  fields: TournamentRegistrationCustomField[],
): TournamentRegistrationCustomField[] {
  const templates = TEAM_BLADER_CUSTOM_FIELDS;
  const templateLabels = new Set(templates.map((field) => comparableFieldLabel(field.label)));
  const templateIds = new Set(templates.map((field) => field.id));
  const templateFields = templates.map((template) => {
    const existing = fields.find(
      (field) =>
        field.id === template.id ||
        templateLabels.has(comparableFieldLabel(field.label)),
    );
    return {
      ...(existing ?? template),
      id: existing?.id || template.id,
      label: existing?.label || template.label,
      required: true,
    };
  });
  const extras = fields.filter(
    (field) =>
      !templateIds.has(field.id) &&
      !templateLabels.has(comparableFieldLabel(field.label)),
  );
  return [...templateFields, ...extras].slice(0, 6);
}

export function newTournamentRegistrationCustomField(
  index?: number,
): TournamentRegistrationCustomField {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : String(Date.now()).slice(-8);
  return { id: `field_${suffix}`, label: `Question ${index ?? ""}`.trim(), required: false };
}

export function checkTournamentRegistrationProof(file: File): "type" | "size" | null {
  if (!TOURNAMENT_REGISTRATION_PROOF_TYPES.has(file.type)) return "type";
  if (file.size > TOURNAMENT_REGISTRATION_PROOF_MAX_BYTES) return "size";
  return null;
}

export function tournamentRegistrationProofExtension(file: Blob) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
