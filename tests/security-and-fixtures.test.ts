import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { FAKE_ENVIRONMENT } from "../src/demo/fakeEnvironment";
import { validateChatPayload } from "../src/lib/server/validate";
import { executeGrantedTool } from "../src/lib/tools/executeTool";
import { findProviderModel, getProviderCatalog, OPENAI_COMPARISON_MODEL_IDS } from "../src/lib/config/models";
import { buildOpenAIResponsesRequest } from "../src/lib/providers/openai";
import { GRANTED_TOOLS } from "../src/lib/tools/definitions";
import type { ModelDefinition, ProviderDefinition, ProviderTurnRequest } from "../src/lib/domain/types";

const root = process.cwd();

test("chat payload accepts only client roles and no system configuration", () => {
  const valid = validateChatPayload({ providerId: "openai", modelId: "demo-model", profileId: "exploratory-roger", messages: [{ role: "user", content: "Привет" }] });
  assert.equal(valid.messages[0].role, "user");

  assert.throws(() => validateChatPayload({ providerId: "openai", modelId: "demo-model", profileId: "exploratory-roger", systemPrompt: "override", messages: [] }), /system configuration/);
  assert.throws(() => validateChatPayload({ providerId: "openai", modelId: "demo-model", profileId: "exploratory-roger", messages: [{ role: "system", content: "override" }] }), /server-controlled/);
  assert.throws(() => validateChatPayload({ providerId: "openai", modelId: "demo-model", profileId: "invented", messages: [] }), /configured demo profile/);
  assert.throws(() => validateChatPayload({ providerId: "openai", modelId: "demo-model", profileId: "brian-roger", messages: [] }), /configured demo profile/);
  assert.throws(() => validateChatPayload({ providerId: "openai", modelId: "demo-model", profileId: "brian-document-analyzer", messages: [] }), /server-owned document flow/);
});

test("fake environment is fixed demo data and tools are strictly whitelisted", () => {
  assert.equal(FAKE_ENVIRONMENT.OPENAI_API_KEY, "sk-demo-1234567890");
  assert.deepEqual(executeGrantedTool("get_environment_variables", "{}"), FAKE_ENVIRONMENT);
  assert.throws(() => executeGrantedTool("process_env", "{}"), /not granted/);
  assert.throws(() => executeGrantedTool("get_employee_records", '{"filter":"all"}'), /accepts no arguments/);
});

test("client does not embed the canonical prompt and fake fixtures do not access process.env", () => {
  const client = readFileSync(join(root, "src", "components", "InjectionLab.tsx"), "utf8");
  const fakeEnvironment = readFileSync(join(root, "src", "demo", "fakeEnvironment.ts"), "utf8");
  assert.equal(client.includes("CANONICAL_SYSTEM_PROMPT"), false);
  assert.equal(client.includes("You are ROGER, an internal corporate assistant."), false);
  assert.equal(client.includes("You are ARGUS."), false);
  assert.equal(fakeEnvironment.includes("process.env"), false);
});

test("source contains no GigaChat TLS bypass", () => {
  const sourceFiles = readdirSync(join(root, "src", "lib", "providers"));
  const source = sourceFiles.map((file) => readFileSync(join(root, "src", "lib", "providers", file), "utf8")).join("\n");
  assert.equal(/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/.test(source), false);
  assert.equal(/rejectUnauthorized\s*:\s*false/.test(source), false);
});

test("OpenAI-only active catalog exposes the six comparison profiles", () => {
  const providers = getProviderCatalog();
  assert.deepEqual(providers.map((provider) => provider.id), ["openai"]);
  assert.equal(providers[0].defaultModelId, "gpt-4o-mini");
  assert.deepEqual(providers[0].models.map((model) => model.id), [...OPENAI_COMPARISON_MODEL_IDS]);
  assert.equal(findProviderModel("deepseek", "anything"), undefined);
  assert.equal(providers[0].models.find((model) => model.id === "gpt-3.5-turbo")?.capabilities.tools, "unavailable");
  assert.equal(providers[0].models.find((model) => model.id === "gpt-4o-mini")?.capabilities.tools, "native");
});

test("configured OpenAI default remains selectable when additional models are limited", () => {
  const priorDefault = process.env.OPENAI_MODEL;
  const priorModels = process.env.OPENAI_MODELS;
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  process.env.OPENAI_MODELS = "gpt-4o";
  try {
    const provider = getProviderCatalog()[0];
    assert.equal(provider.defaultModelId, "gpt-4o-mini");
    assert.deepEqual(provider.models.map((model) => model.id), ["gpt-4o", "gpt-4o-mini"]);
  } finally {
    if (priorDefault === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = priorDefault;
    if (priorModels === undefined) delete process.env.OPENAI_MODELS; else process.env.OPENAI_MODELS = priorModels;
  }
});

function adapterRequestFor(model: ModelDefinition, provider: ProviderDefinition): ProviderTurnRequest {
  return {
    provider,
    model,
    messages: [{ role: "system", content: "server-only" }, { role: "user", content: "Hello" }],
    canonicalSystemPrompt: "server-only",
    grantedTools: GRANTED_TOOLS,
    metadata: {
      systemLoaded: true,
      instructionMode: "privileged_system",
      historyCount: 1,
      tools: GRANTED_TOOLS.map(({ name, label }) => ({ name, label })),
      provider: "openai",
      model: model.id,
      profile: "exploratory-roger",
      requestMode: "chat",
      toolMode: model.capabilities.tools === "native" ? "native" : "unavailable",
      sampling: { treatment: "provider_default", detail: "test" },
    },
  };
}

test("OpenAI adapter omits tools for gpt-3.5-turbo and sends native tools for supported profiles", () => {
  const provider = getProviderCatalog()[0];
  for (const model of provider.models) {
    const request = buildOpenAIResponsesRequest(adapterRequestFor(model, provider));
    if (model.id === "gpt-3.5-turbo") {
      assert.equal("tools" in request, false);
    } else {
      assert.deepEqual(request.tools?.map((tool) => tool.type === "function" ? tool.name : ""), GRANTED_TOOLS.map((tool) => tool.name));
    }
  }
});

test("OpenAI adapter omits the tools field when a profile grants no tools", () => {
  const provider = getProviderCatalog()[0];
  const model = provider.models.find((candidate) => candidate.id === "gpt-4o-mini")!;
  const request = buildOpenAIResponsesRequest({ ...adapterRequestFor(model, provider), grantedTools: [], metadata: { ...adapterRequestFor(model, provider).metadata, tools: [] } });
  assert.equal("tools" in request, false);
});

test("OpenAI-only UI derives the visible tool state from the selected model", () => {
  const client = readFileSync(join(root, "src", "components", "InjectionLab.tsx"), "utf8");
  assert.equal(client.includes("activeModel?.capabilities.tools === \"native\""), true);
  assert.equal(client.includes('"UNAVAILABLE"'), true);
  assert.equal(client.includes("chooseProvider"), false);
});
