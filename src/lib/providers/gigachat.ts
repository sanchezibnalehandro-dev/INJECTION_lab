import type { InternalMessage, ProviderTurnRequest, ProviderTurnResult } from "@/lib/domain/types";
import type { LLMProviderAdapter } from "@/lib/providers/types";
import { ProviderConfigurationError } from "@/lib/providers/types";

type CachedToken = { value: string; expiresAt: number } | undefined;
let cachedToken: CachedToken;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const clientId = process.env.GIGACHAT_CLIENT_ID;
  const clientSecret = process.env.GIGACHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ProviderConfigurationError("GIGACHAT_CLIENT_ID and GIGACHAT_CLIENT_SECRET must be configured on the server.");
  const oauthUrl = process.env.GIGACHAT_OAUTH_URL || "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
  const authorizationKey = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(oauthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", RqUID: crypto.randomUUID(), Authorization: `Basic ${authorizationKey}` },
    body: new URLSearchParams({ scope: process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS" }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok || typeof body.access_token !== "string") throw new Error(`GigaChat authorization failed with HTTP ${response.status}.`);
  const expiresAt = typeof body.expires_at === "number" ? body.expires_at * 1000 : Date.now() + 25 * 60_000;
  cachedToken = { value: body.access_token, expiresAt };
  return cachedToken.value;
}

function toMessages(messages: InternalMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") return { role: "function", content: message.content, functions_state_id: message.providerState?.functions_state_id };
    if (message.toolCalls?.length) {
      const call = message.toolCalls[0];
      let args: unknown = {};
      try { args = JSON.parse(call.argumentsJson); } catch { args = {}; }
      return { role: "assistant", content: message.content, function_call: { name: call.name, arguments: args }, functions_state_id: call.providerState?.functions_state_id };
    }
    return { role: message.role, content: message.content };
  });
}

export const gigaChatAdapter: LLMProviderAdapter = {
  id: "gigachat",
  async sendChat(input: ProviderTurnRequest): Promise<ProviderTurnResult> {
    const token = await getAccessToken();
    const startedAt = Date.now();
    const baseUrl = (process.env.GIGACHAT_API_BASE_URL || "https://api.giga.chat").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: input.model.id,
        messages: toMessages(input.messages),
        function_call: "auto",
        functions: input.grantedTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })),
      }),
    });
    const body = asRecord(await response.json().catch(() => ({})));
    if (!response.ok) throw new Error(`GigaChat request failed with HTTP ${response.status}.`);
    const choice = asRecord(Array.isArray(body.choices) ? body.choices[0] : undefined);
    const message = asRecord(choice.message);
    const functionCall = asRecord(message.function_call);
    const functionsStateId = typeof message.functions_state_id === "string" ? message.functions_state_id : undefined;
    const toolCalls = typeof functionCall.name === "string" ? [{
      id: crypto.randomUUID(),
      name: functionCall.name,
      argumentsJson: JSON.stringify(functionCall.arguments ?? {}),
      ...(functionsStateId ? { providerState: { functions_state_id: functionsStateId } } : {}),
    }] : [];
    const usage = asRecord(body.usage);
    return {
      text: typeof message.content === "string" ? message.content : "",
      toolCalls,
      latencyMs: Date.now() - startedAt,
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
      usage: Object.keys(usage).length ? { inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined, outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined, totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined } : undefined,
    };
  },
};
