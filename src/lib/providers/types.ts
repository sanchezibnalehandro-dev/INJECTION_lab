import type { ProviderId, ProviderTurnRequest, ProviderTurnResult } from "@/lib/domain/types";

export interface LLMProviderAdapter {
  id: ProviderId;
  sendChat(input: ProviderTurnRequest): Promise<ProviderTurnResult>;
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export class ProviderApiError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly status: number | undefined,
    public readonly code: string,
  ) {
    super(`${provider} API request failed${status ? ` with HTTP ${status}` : ""} (${code}).`);
    this.name = "ProviderApiError";
  }
}

export class ProviderTimeoutError extends Error {
  constructor(provider: ProviderId) {
    super(`${provider} did not respond within the demo timeout.`);
    this.name = "ProviderTimeoutError";
  }
}
