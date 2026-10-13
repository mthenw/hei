"use client";

import type { ModelRef } from "@earendil-works/pi-durable";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ModelChoice } from "@/agent/model-catalog";
import { getModels } from "@/lib/chat-api";

type Models = {
  /** The models a chat can run on right now. */
  models: ModelChoice[];
  /** The model new chats start on; unknown until the list arrives. */
  defaultModel: ModelRef | undefined;
  /** A short display name for a model, available or not. */
  nameOf: (model: ModelRef) => string;
};

const ModelsContext = createContext<Models | null>(null);

/** Loads the available models once for everything under it. */
export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [defaultModel, setDefaultModel] = useState<ModelRef>();

  useEffect(() => {
    let current = true;
    getModels()
      .then((available) => {
        if (!current) return;
        setModels(available.models);
        setDefaultModel(available.defaultModel);
      })
      .catch((error) => console.warn("Could not load models:", error));
    return () => {
      current = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      models,
      defaultModel,
      nameOf: (model: ModelRef) =>
        models.find((choice) => sameModel(choice, model))?.name ??
        model.modelId,
    }),
    [models, defaultModel],
  );
  return <ModelsContext value={value}>{children}</ModelsContext>;
}

export function useModels(): Models {
  const models = useContext(ModelsContext);
  if (models === null)
    throw new Error("useModels must be used inside ModelsProvider");
  return models;
}

export function sameModel(a: ModelRef, b: ModelRef): boolean {
  return a.provider === b.provider && a.modelId === b.modelId;
}
