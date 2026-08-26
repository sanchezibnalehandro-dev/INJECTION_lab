import type { InternalMessage, ProviderTurnRequest, ProviderTurnResult } from "@/lib/domain/types";
import type { LLMProviderAdapter } from "@/lib/providers/types";
import { ProviderConfigurationError } from "@/lib/providers/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toMessages(messages: InternalMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    if (message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.argumentsJson } })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

export const deepSeekAdapter: LLMProviderAdapter = {
  id: "deepseek",
  async sendChat(input: ProviderTurnRequest): Promise<ProviderTurnResult> {
    if (!process.env.DEEPSEEK_API_KEY) throw new ProviderConfigurationError("DEEPSEEK_API_KEY is not configured on the server.");
    const startedAt = Date.now();
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: input.model.id,
        messages: toMessages(input.messages),
        tools: input.grantedTools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`DeepSeek request failed with HTTP ${response.status}.`);
    const root = asRecord(body);
    const choice = asRecord(Array.isArray(root.choices) ? root.choices[0] : undefined);
    const message = asRecord(choice.message);
    const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).map((item) => {
      const call = asRecord(item);
      const fn = asRecord(call.function);
      return { id: String(call.id ?? crypto.randomUUID()), name: String(fn.name ?? ""), argumentsJson: String(fn.arguments ?? "{}") };
    }).filter((call) => call.name);
    const usage = asRecord(root.usage);
    return {
      text: typeof message.content === "string" ? message.content : "",
      toolCalls,
      latencyMs: Date.now() - startedAt,
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
      usage: Object.keys(usage).length ? { inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined, outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined, totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined } : undefined,
    };
  },
};
