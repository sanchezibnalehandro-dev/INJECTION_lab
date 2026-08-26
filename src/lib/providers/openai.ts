import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import type { InternalMessage, ProviderTurnRequest, ProviderTurnResult } from "@/lib/domain/types";
import type { LLMProviderAdapter } from "@/lib/providers/types";
import { ProviderApiError, ProviderConfigurationError, ProviderTimeoutError } from "@/lib/providers/types";

function safeApiCode(code: string | null | undefined): string {
  return code && /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? code : "api_error";
}

function toInput(messages: InternalMessage[]): OpenAI.Responses.ResponseInputItem[] {
  const items: OpenAI.Responses.ResponseInputItem[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      items.push({ type: "function_call_output", call_id: message.toolCallId ?? "", output: message.content } as OpenAI.Responses.ResponseInputItem);
      continue;
    }
    if (message.toolCalls?.length) {
      for (const call of message.toolCalls) items.push({ type: "function_call", call_id: call.id, name: call.name, arguments: call.argumentsJson } as OpenAI.Responses.ResponseInputItem);
      continue;
    }
    items.push({ role: message.role as "user" | "assistant", content: message.content } as OpenAI.Responses.ResponseInputItem);
  }
  return items;
}

/** OpenAI wire construction remains adapter-local. */
export function buildOpenAIResponsesRequest(input: ProviderTurnRequest): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  const request: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: input.model.id,
    input: toInput(input.messages),
  };

  if (input.metadata.instructionMode !== "concatenated_user") {
    request.instructions = input.canonicalSystemPrompt;
  }

  if (input.model.capabilities.tools === "native" && input.grantedTools.length > 0) {
    request.tools = input.grantedTools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: true,
    }));
  }

  return request;
}

export const openAIAdapter: LLMProviderAdapter = {
  id: "openai",
  async sendChat(input: ProviderTurnRequest): Promise<ProviderTurnResult> {
    if (!process.env.OPENAI_API_KEY) throw new ProviderConfigurationError("OPENAI_API_KEY is not configured on the server.");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
    const startedAt = Date.now();
    let response: OpenAI.Responses.Response;
    try {
      response = await client.responses.create(buildOpenAIResponsesRequest(input));
    } catch (error) {
      if (error instanceof APIConnectionTimeoutError) throw new ProviderTimeoutError("openai");
      if (error instanceof APIError) throw new ProviderApiError("openai", error.status, safeApiCode(error.code));
      throw error;
    }
    const toolCalls = response.output.filter((item) => item.type === "function_call").map((item) => ({ id: item.call_id, name: item.name, argumentsJson: item.arguments }));
    return {
      text: response.output_text,
      toolCalls,
      latencyMs: Date.now() - startedAt,
      finishReason: response.status,
      resolvedModelId: response.model,
      usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens } : undefined,
    };
  },
};
