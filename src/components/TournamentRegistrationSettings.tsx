"use client";

import { Dict } from "@/i18n";
import {
  newTournamentRegistrationCustomField,
  TournamentRegistrationConfig,
} from "@/lib/tournamentRegistration";

const inputCls =
  "w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none transition placeholder:text-ink-dim/50 focus:border-accent";

export default function TournamentRegistrationSettings({
  value,
  onChange,
  labels,
}: {
  value: TournamentRegistrationConfig;
  onChange: (next: TournamentRegistrationConfig) => void;
  labels: Dict["tournaments"];
}) {
  const update = (patch: Partial<TournamentRegistrationConfig>) => {
    onChange({ ...value, ...patch });
  };

  const updateField = (
    index: number,
    patch: Partial<TournamentRegistrationConfig["customFields"][number]>,
  ) => {
    update({
      customFields: value.customFields.map((field, i) =>
        i === index ? { ...field, ...patch } : field,
      ),
    });
  };

  const removeField = (index: number) => {
    update({ customFields: value.customFields.filter((_, i) => i !== index) });
  };

  return (
    <div className="sm:col-span-2 rounded-md border border-edge bg-bg/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-xs font-bold uppercase tracking-[0.22em] text-accent">
            {labels.registrationSettingsTitle}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-dim">
            {labels.registrationSettingsIntro}
          </p>
        </div>
        <label className="flex items-center gap-2 rounded border border-edge bg-panel px-3 py-2 text-xs font-semibold text-ink-dim">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          {labels.registrationEnabled}
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded border border-edge bg-panel px-3 py-2 text-xs font-semibold text-ink-dim">
          <input
            type="checkbox"
            checked={value.teamNameEnabled}
            onChange={(e) => update({ teamNameEnabled: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          {labels.registrationTeamNameEnabled}
        </label>
        <label className="flex items-center gap-2 rounded border border-edge bg-panel px-3 py-2 text-xs font-semibold text-ink-dim">
          <input
            type="checkbox"
            checked={value.teamNameEnabled}
            onChange={() => update({ teamNameRequired: value.teamNameEnabled })}
            disabled={!value.teamNameEnabled}
            className="accent-[var(--color-accent)] disabled:opacity-50"
          />
          {labels.registrationTeamNameRequired}
        </label>
        <label className="flex items-center gap-2 rounded border border-edge bg-panel px-3 py-2 text-xs font-semibold text-ink-dim">
          <input
            type="checkbox"
            checked
            onChange={() => update({ paymentProofRequired: true })}
            disabled
            className="accent-[var(--color-accent)] disabled:opacity-80"
          />
          {labels.registrationPaymentProofRequired}
        </label>
      </div>

      <div className="mt-4 grid gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-dim">
            {labels.registrationPaymentInstructions}
          </label>
          <textarea
            value={value.paymentInstructions}
            onChange={(e) => update({ paymentInstructions: e.target.value })}
            rows={2}
            maxLength={300}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-dim">
            {labels.registrationPaymentRemark}
          </label>
          <textarea
            value={value.paymentRemarkHint}
            onChange={(e) => update({ paymentRemarkHint: e.target.value })}
            rows={2}
            maxLength={300}
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-edge pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-display text-xs font-bold uppercase tracking-wider text-accent-2">
              {labels.registrationCustomFields}
            </div>
            <p className="mt-1 text-xs text-ink-dim">{labels.registrationCustomFieldsHint}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              update({
                customFields: [...value.customFields, newTournamentRegistrationCustomField()].slice(0, 6),
              })
            }
            disabled={value.customFields.length >= 6}
            className="clip-x border border-edge bg-panel px-3 py-2 font-display text-[10px] font-bold tracking-wider text-accent transition hover:border-accent/60 disabled:opacity-50"
          >
            {labels.registrationAddField}
          </button>
        </div>

        {value.customFields.length > 0 && (
          <div className="mt-3 grid gap-2">
            {value.customFields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded border border-edge bg-panel p-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  placeholder={labels.registrationCustomFieldPlaceholder}
                  maxLength={80}
                  className={inputCls}
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-dim">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(index, { required: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                  {labels.registrationRequired}
                </label>
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  className="text-left text-xs font-semibold text-ink-dim underline decoration-dotted transition hover:text-atk md:text-right"
                >
                  {labels.formatRemoveStage}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
