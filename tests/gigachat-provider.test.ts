import assert from "node:assert/strict";
import test from "node:test";
import { buildGigaChatMessages, buildGigaChatRequestBody, resolveGigaChatAuthorizationKey } from "../src/lib/providers/gigachat";
import type { ProviderTurnRequest } from "../src/lib/domain/types";
import { VULNERABLE_RECORD_TOOLS } from "../src/lib/tools/definitions";

function turnRequest(grantedTools: ProviderTurnRequest["grantedTools"]): ProviderTurnRequest {
  const model = {
    id: "GigaChat-2",
    displayName: "GigaChat-2",
    providerId: "gigachat" as const,
    capabilities: { tools: "native" as const, structuredOutput: "not_exercised" as const, streaming: "not_enabled" as const },
  };
  return {
    provider: { id: "gigachat", displayName: "GigaChat", defaultModelId: model.id, models: [model], configured: true, configurationHint: "" },
    model,
    messages: [{ role: "user", content: "test" }],
    canonicalSystemPrompt: "test",
    grantedTools,
    metadata: {
      systemLoaded: false,
      instructionMode: "concatenated_user",
      historyCount: 1,
      tools: grantedTools.map(({ name, label }) => ({ name, label })),
      provider: "gigachat",
      model: model.id,
      profile: "vulnerable-records",
      requestMode: "chat",
      toolMode: "native",
      sampling: { treatment: "provider_default", detail: "test" },
    },
  };
}

test("GigaChat Authorization Key takes precedence over client credential fallback", () => {
  assert.equal(resolveGigaChatAuthorizationKey({
    GIGACHAT_AUTHORIZATION_KEY: " ready-base64-key ",
    GIGACHAT_CLIENT_ID: "client-id",
    GIGACHAT_CLIENT_SECRET: "client-secret",
  }), "ready-base64-key");
  assert.equal(resolveGigaChatAuthorizationKey({
    GIGACHAT_CLIENT_ID: "client-id",
    GIGACHAT_CLIENT_SECRET: "client-secret",
  }), Buffer.from("client-id:client-secret").toString("base64"));
  assert.throws(() => resolveGigaChatAuthorizationKey({}), /GIGACHAT_AUTHORIZATION_KEY/);
});

test("GigaChat request enables native functions only for profiles that grant tools", () => {
  const withoutTools = buildGigaChatRequestBody(turnRequest([]));
  assert.equal("function_call" in withoutTools, false);
  assert.equal("functions" in withoutTools, false);

  const withTools = buildGigaChatRequestBody(turnRequest(VULNERABLE_RECORD_TOOLS));
  assert.equal(withTools.function_call, "auto");
  assert.deepEqual((withTools.functions as Array<{ name: string }>).map((tool) => tool.name), ["get_employee_records"]);
});

test("GigaChat native function history returns the function name in the result message", () => {
  const messages = buildGigaChatMessages([
    { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "get_employee_records", argumentsJson: "{}", providerState: { functions_state_id: "state-1" } }] },
    { role: "tool", content: "[]", name: "get_employee_records", toolCallId: "call-1", providerState: { functions_state_id: "state-1" } },
  ]);
  assert.deepEqual(messages, [
    { role: "assistant", content: "", function_call: { name: "get_employee_records", arguments: {} }, functions_state_id: "state-1" },
    { role: "function", content: "[]", name: "get_employee_records" },
  ]);
});
