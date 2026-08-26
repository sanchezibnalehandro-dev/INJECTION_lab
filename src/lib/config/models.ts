import type { ModelCapabilities, ModelDefinition, ProviderDefinition, ProviderId } from "@/lib/domain/types";

export const OPENAI_COMPARISON_MODEL_IDS = [
  "gpt-3.5-turbo",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
] as const;

type OpenAIComparisonModelId = (typeof OPENAI_COMPARISON_MODEL_IDS)[number];

const TEXT_ONLY_CAPABILITIES: ModelCapabilities = {
  tools: "unavailable",
  structuredOutput: "unavailable",
  streaming: "unavailable",
};

const NATIVE_TOOL_CAPABILITIES: ModelCapabilities = {
  tools: "native",
  structuredOutput: "not_exercised",
  streaming: "not_enabled",
};

const OPENAI_MODEL_CAPABILITIES: Record<OpenAIComparisonModelId, ModelCapabilities> = {
  "gpt-3.5-turbo": TEXT_ONLY_CAPABILITIES,
  "gpt-4o-mini": NATIVE_TOOL_CAPABILITIES,
  "gpt-4.1": NATIVE_TOOL_CAPABILITIES,
  "gpt-4o": NATIVE_TOOL_CAPABILITIES,
  "gpt-5.6-luna": NATIVE_TOOL_CAPABILITIES,
  "gpt-5.6-sol": NATIVE_TOOL_CAPABILITIES,
};

function configuredModelIds(): OpenAIComparisonModelId[] {
  const requested = (process.env.OPENAI_MODELS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const configuredDefault = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const candidates = requested.length ? [...requested, configuredDefault] : [...OPENAI_COMPARISON_MODEL_IDS];
  const known = candidates.filter((id): id is OpenAIComparisonModelId => OPENAI_COMPARISON_MODEL_IDS.includes(id as OpenAIComparisonModelId));
  const fallback: OpenAIComparisonModelId[] = ["gpt-4o-mini"];
  return [...new Set<OpenAIComparisonModelId>(known.length ? known : fallback)];
}

function modelDefinition(id: OpenAIComparisonModelId): ModelDefinition {
  return {
    id,
    displayName: id,
    providerId: "openai",
    capabilities: OPENAI_MODEL_CAPABILITIES[id],
  };
}

/** The current live comparison surface deliberately exposes only OpenAI. */
export function getProviderCatalog(): ProviderDefinition[] {
  const models = configuredModelIds().map(modelDefinition);
  const configuredDefault = process.env.OPENAI_MODEL?.trim();
  const defaultModelId = models.some((model) => model.id === configuredDefault)
    ? configuredDefault!
    : models.some((model) => model.id === "gpt-4o-mini")
      ? "gpt-4o-mini"
      : models[0].id;
  return [{ id: "openai", displayName: "OpenAI", defaultModelId, models }];
}

export function findProviderModel(providerId: ProviderId, modelId: string): { provider: ProviderDefinition; model: ModelDefinition } | undefined {
  const provider = getProviderCatalog().find((candidate) => candidate.id === providerId);
  const model = provider?.models.find((candidate) => candidate.id === modelId);
  return provider && model ? { provider, model } : undefined;
}
