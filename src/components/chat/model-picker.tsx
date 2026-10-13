"use client";

import type { ModelRef } from "@earendil-works/pi-durable";
import type { ModelChoice } from "@/agent/model-catalog";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import { SelectGroup, SelectLabel } from "@/components/ui/select";
import { sameModel, useModels } from "./models";

const keyOf = (model: ModelRef) => `${model.provider}/${model.modelId}`;

type ModelPickerProps = {
  value: ModelRef | undefined;
  onChange: (model: ModelRef) => void;
  disabled?: boolean;
};

/** Pick the model a chat runs on, grouped by account. */
export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const { models, nameOf } = useModels();
  if (models.length === 0 || value === undefined) return null;

  // A chat may sit on a model that is no longer available, for example after disconnecting ChatGPT. Keep it listed so
  // the picker still shows what the chat runs on.
  const current = models.some((choice) => sameModel(choice, value))
    ? undefined
    : value;
  const families = groupByFamily(models);

  return (
    <PromptInputSelect
      value={keyOf(value)}
      disabled={disabled}
      onValueChange={(key) => {
        const chosen = models.find((choice) => keyOf(choice) === key);
        if (chosen)
          onChange({ provider: chosen.provider, modelId: chosen.modelId });
      }}
    >
      <PromptInputSelectTrigger aria-label="Model">
        <PromptInputSelectValue />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {current && (
          <SelectGroup>
            <SelectLabel>Unavailable</SelectLabel>
            <PromptInputSelectItem value={keyOf(current)} disabled>
              {nameOf(current)}
            </PromptInputSelectItem>
          </SelectGroup>
        )}
        {families.map(([family, choices]) => (
          <SelectGroup key={family}>
            <SelectLabel>{family}</SelectLabel>
            {choices.map((choice) => (
              <PromptInputSelectItem key={keyOf(choice)} value={keyOf(choice)}>
                {choice.name}
              </PromptInputSelectItem>
            ))}
          </SelectGroup>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

function groupByFamily(models: ModelChoice[]) {
  const groups = new Map<string, ModelChoice[]>();
  for (const model of models)
    groups.set(model.family, [...(groups.get(model.family) ?? []), model]);
  return [...groups];
}
