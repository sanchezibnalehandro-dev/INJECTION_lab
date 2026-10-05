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

function configuredGigaChatModelIds(): string[] {
  const requested = (process.env.GIGACHAT_MODELS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const configuredDefault = process.env.GIGACHAT_MODEL?.trim() || "GigaChat-2";
  return [...new Set(requested.length ? [...requested, configuredDefault] : [configuredDefault])];
}

function hasGigaChatCredentials(): boolean {
  return Boolean(
    process.env.GIGACHAT_AUTHORIZATION_KEY?.trim()
    || (process.env.GIGACHAT_CLIENT_ID?.trim() && process.env.GIGACHAT_CLIENT_SECRET?.trim()),
  );
}

function gigaChatProvider(): ProviderDefinition {
  const models = configuredGigaChatModelIds().map((id): ModelDefinition => ({
    id,
    displayName: id,
    providerId: "gigachat",
    capabilities: NATIVE_TOOL_CAPABILITIES,
  }));
  const configuredDefault = process.env.GIGACHAT_MODEL?.trim() || "GigaChat-2";
  return {
    id: "gigachat",
    displayName: "GigaChat",
    defaultModelId: models.some((model) => model.id === configuredDefault) ? configuredDefault : models[0].id,
    models,
    configured: hasGigaChatCredentials(),
    configurationHint: "Configure GIGACHAT_AUTHORIZATION_KEY on the server.",
  };
}

function findCalibrationGigaChatModel(modelId: string): { provider: ProviderDefinition; model: ModelDefinition } | undefined {
  if (process.env.INJECTION_LAB_CALIBRATION_PROVIDER !== "gigachat") return undefined;
  const configuredIds = (process.env.INJECTION_LAB_CALIBRATION_MODELS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!configuredIds.includes(modelId)) return undefined;
  const models: ModelDefinition[] = configuredIds.map((id) => ({
    id,
    displayName: id,
    providerId: "gigachat",
    capabilities: NATIVE_TOOL_CAPABILITIES,
  }));
  const provider: ProviderDefinition = {
    id: "gigachat",
    displayName: "GigaChat",
    defaultModelId: models[0].id,
    models,
    configured: hasGigaChatCredentials(),
    configurationHint: "Configure GIGACHAT_AUTHORIZATION_KEY on the server.",
  };
  const model = models.find((candidate) => candidate.id === modelId);
  return model ? { provider, model } : undefined;
}

export function getProviderCatalog(): ProviderDefinition[] {
  const models = configuredModelIds().map(modelDefinition);
  const configuredDefault = process.env.OPENAI_MODEL?.trim();
  const defaultModelId = models.some((model) => model.id === configuredDefault)
    ? configuredDefault!
    : models.some((model) => model.id === "gpt-4o-mini")
      ? "gpt-4o-mini"
      : models[0].id;
  const openAIProvider: ProviderDefinition = {
    id: "openai",
    displayName: "OpenAI",
    defaultModelId,
    models,
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    configurationHint: "Configure OPENAI_API_KEY on the server.",
  };
  const gigaChat = gigaChatProvider();
  const hideUnconfiguredGigaChatOnVercel = Boolean(process.env.VERCEL) && !gigaChat.configured;
  return hideUnconfiguredGigaChatOnVercel ? [openAIProvider] : [gigaChat, openAIProvider];
}

export function findProviderModel(providerId: ProviderId, modelId: string): { provider: ProviderDefinition; model: ModelDefinition } | undefined {
  const provider = getProviderCatalog().find((candidate) => candidate.id === providerId);
  const model = provider?.models.find((candidate) => candidate.id === modelId);
  if (provider && model) return { provider, model };
  return providerId === "gigachat" ? findCalibrationGigaChatModel(modelId) : undefined;
}
