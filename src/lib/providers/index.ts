import type { ProviderId } from "@/lib/domain/types";
import { deepSeekAdapter } from "@/lib/providers/deepseek";
import { gigaChatAdapter } from "@/lib/providers/gigachat";
import { openAIAdapter } from "@/lib/providers/openai";
import { openRouterAdapter } from "@/lib/providers/openrouter";
import type { LLMProviderAdapter } from "@/lib/providers/types";

const ADAPTERS: Record<ProviderId, LLMProviderAdapter> = {
  openai: openAIAdapter,
  openrouter: openRouterAdapter,
  deepseek: deepSeekAdapter,
  gigachat: gigaChatAdapter,
};

export function getProviderAdapter(providerId: ProviderId): LLMProviderAdapter {
  return ADAPTERS[providerId];
}
