import "server-only";

import type { ChatResponse, ConversationMessage, DebugEvent, DemoProfile, DemoProfileId, GrantedTool, ModelDefinition, NormalizedRequestMetadata, ProviderId, RequestMode } from "@/lib/domain/types";
import { getDemoProfile } from "@/demo/profiles";
import { findProviderModel } from "@/lib/config/models";
import { getProviderAdapter } from "@/lib/providers";
import { ProviderConfigurationError } from "@/lib/providers/types";
import { executeProfileTool } from "@/lib/tools/executeTool";
import { evaluateDisclosure } from "@/lib/server/evaluateDisclosure";
import { buildProfileMessages } from "@/lib/server/buildProfileMessages";

const MAX_TOOL_ITERATIONS = 4;

function now(): string {
  return new Date().toISOString();
}

function metadataFor(providerId: ProviderId, model: ModelDefinition, profile: Pick<DemoProfile, "id" | "instructionMode">, historyCount: number, requestMode: RequestMode, tools: GrantedTool[]): NormalizedRequestMetadata {
  return {
    systemLoaded: profile.instructionMode !== "concatenated_user",
    instructionMode: profile.instructionMode,
    historyCount,
    tools: tools.map(({ name, label }) => ({ name, label })),
    provider: providerId,
    model: model.id,
    profile: profile.id,
    requestMode,
    toolMode: model.capabilities.tools === "native" ? "native" : "unavailable",
    sampling: { treatment: "provider_default", detail: "No sampling parameters are forced by INJECTION LAB." },
  };
}

export async function runChatTurn(input: { providerId: ProviderId; modelId: string; profileId: DemoProfileId; messages: ConversationMessage[]; requestMode?: RequestMode }): Promise<ChatResponse> {
  const configured = findProviderModel(input.providerId, input.modelId);
  if (!configured) throw new ProviderConfigurationError("The selected model is not configured for this provider.");
  const profile = getDemoProfile(input.profileId);
  if (!profile) throw new ProviderConfigurationError("The selected demo profile is not configured.");

  const metadata = metadataFor(input.providerId, configured.model, profile, input.messages.length, input.requestMode ?? "chat", profile.grantedTools);
  const debugEvents: DebugEvent[] = [{ type: "request", at: now(), metadata }];
  const internalHistory = buildProfileMessages(profile, input.messages);
  const adapter = getProviderAdapter(input.providerId);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const result = await adapter.sendChat({
      provider: configured.provider,
      model: configured.model,
      messages: internalHistory,
      canonicalSystemPrompt: profile.systemPrompt,
      grantedTools: profile.grantedTools,
      metadata,
    });

    if (!result.toolCalls.length) {
      const message: ConversationMessage = { role: "assistant", content: result.text };
      debugEvents.push({ type: "response", at: now(), latencyMs: result.latencyMs, text: result.text, ...(result.finishReason ? { finishReason: result.finishReason } : {}), ...(result.resolvedModelId ? { resolvedModelId: result.resolvedModelId } : {}) });
      return { message, history: [...input.messages, message], debugEvents, metadata, evaluation: evaluateDisclosure(result.text) };
    }

    internalHistory.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
    for (const toolCall of result.toolCalls) {
      debugEvents.push({ type: "tool_requested", at: now(), tool: toolCall.name, argumentsJson: toolCall.argumentsJson });
      let output: unknown;
      try {
        debugEvents.push({ type: "tool_executed", at: now(), tool: toolCall.name });
        output = executeProfileTool(profile.id, toolCall.name, toolCall.argumentsJson);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : "Tool execution failed." };
      }
      debugEvents.push({ type: "tool_result", at: now(), tool: toolCall.name, result: output });
      internalHistory.push({ role: "tool", name: toolCall.name, toolCallId: toolCall.id, content: JSON.stringify(output), providerState: toolCall.providerState });
    }
  }

  throw new Error(`The model exceeded the ${MAX_TOOL_ITERATIONS}-step demo tool limit.`);
}
