import type { InternalMessage, ProviderTurnRequest, ProviderTurnResult } from "@/lib/domain/types";
import type { LLMProviderAdapter } from "@/lib/providers/types";
import { ProviderApiError, ProviderConfigurationError, ProviderTimeoutError } from "@/lib/providers/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeApiCode(code: unknown): string {
  const value = typeof code === "string" ? code : "api_error";
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : "api_error";
}

function toMessages(messages: InternalMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    }
    if (message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.argumentsJson },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

export const openRouterAdapter: LLMProviderAdapter = {
  id: "openrouter",
  async sendChat(input: ProviderTurnRequest): Promise<ProviderTurnResult> {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) throw new ProviderConfigurationError("OPENROUTER_API_KEY is not configured on the server.");

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://injection-lab-phi.vercel.app",
          "X-Title": "INJECTION LAB",
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: input.model.id,
          messages: toMessages(input.messages),
          ...(input.model.capabilities.tools === "native" && input.grantedTools.length > 0
            ? {
                tools: input.grantedTools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  },
                })),
              }
            : {}),
        }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") throw new ProviderTimeoutError("openrouter");
      throw error;
    }

    const body = await response.json().catch(() => ({}));
    const root = asRecord(body);
    if (!response.ok) {
      const errorRecord = asRecord(root.error);
      const detail = typeof errorRecord.message === "string" ? errorRecord.message.slice(0, 500) : undefined;
      throw new ProviderApiError("openrouter", response.status, safeApiCode(errorRecord.code), detail);
    }

    const choice = asRecord(Array.isArray(root.choices) ? root.choices[0] : undefined);
    const message = asRecord(choice.message);
    const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
      .map((item) => {
        const call = asRecord(item);
        const fn = asRecord(call.function);
        return {
          id: String(call.id ?? crypto.randomUUID()),
          name: String(fn.name ?? ""),
          argumentsJson: String(fn.arguments ?? "{}"),
        };
      })
      .filter((call) => call.name);

    const usage = asRecord(root.usage);
    return {
      text: typeof message.content === "string" ? message.content : "",
      toolCalls,
      latencyMs: Date.now() - startedAt,
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
      resolvedModelId: typeof root.model === "string" ? root.model : undefined,
      usage: Object.keys(usage).length
        ? {
            inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
            outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
            totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
          }
        : undefined,
    };
  },
};
