import assert from "node:assert/strict";
import test from "node:test";
import { buildCalibrationPlan, buildSummaryRows, calibrationPresets, executeCalibrationRun, GIGACHAT_CALIBRATION_MODELS, parseCalibrationOptions, parseRunsArgument, STAGE_CALIBRATION_MODELS, STAGE_CALIBRATION_PRESET_IDS, type CalibrationChatRequester, type CalibrationResult } from "../scripts/calibrate-stage-models";
import { findProviderModel, getProviderCatalog } from "../src/lib/config/models";
import type { ChatResponse, ConversationMessage, DisclosureEvaluation } from "../src/lib/domain/types";

const NO_DISCLOSURE: DisclosureEvaluation = {
  canaryLeaked: false,
  matchedCanaries: [],
  employeeRecordLeaked: false,
  matchedEmployeeRecordIds: [],
  disclosureObserved: false,
};

function responseFor(messages: ConversationMessage[], evaluation = NO_DISCLOSURE): ChatResponse {
  const message = { role: "assistant" as const, content: "synthetic response" };
  return {
    message,
    history: [...messages, message],
    debugEvents: [{ type: "response", at: "2026-01-01T00:00:00.000Z", latencyMs: 1, text: message.content, resolvedModelId: "resolved-model" }],
    metadata: {
      systemLoaded: false,
      instructionMode: "concatenated_user",
      historyCount: messages.length,
      tools: [],
      provider: "openai",
      model: "gpt-4o-mini",
      profile: "vulnerable-context",
      requestMode: "chat",
      toolMode: "native",
      sampling: { treatment: "provider_default", detail: "test" },
    },
    evaluation,
  };
}

test("calibration CLI defaults to one run and validates --runs=N", () => {
  assert.equal(parseRunsArgument([]), 1);
  assert.equal(parseRunsArgument(["--runs=3"]), 3);
  assert.throws(() => parseRunsArgument(["--runs=0"]), /positive integer/);
  assert.throws(() => parseRunsArgument(["--runs=1.5"]), /positive integer/);
  assert.throws(() => parseRunsArgument(["--other=2"]), /Usage/);
});

test("calibration CLI preserves OpenAI defaults and accepts explicit GigaChat selection", () => {
  assert.deepEqual(parseCalibrationOptions([]), {
    providerId: "openai",
    models: [...STAGE_CALIBRATION_MODELS],
    runsPerPair: 1,
  });
  assert.deepEqual(parseCalibrationOptions(["--provider=gigachat", "--models=GigaChat-2,GigaChat-3-Ultra", "--runs=2"]), {
    providerId: "gigachat",
    models: ["GigaChat-2", "GigaChat-3-Ultra"],
    runsPerPair: 2,
  });
  assert.deepEqual(parseCalibrationOptions(["--provider=gigachat"]).models, [...GIGACHAT_CALIBRATION_MODELS]);
  assert.throws(() => parseCalibrationOptions(["--provider=deepseek"]), /openai or gigachat/);
  assert.throws(() => parseCalibrationOptions(["--models=gpt-3.5-turbo"]), /accepted five-model set/);
});

test("plan contains only the five requested models and three frozen presets", () => {
  const plan = buildCalibrationPlan(2);
  assert.equal(plan.length, STAGE_CALIBRATION_MODELS.length * STAGE_CALIBRATION_PRESET_IDS.length * 2);
  assert.equal(new Set(plan.map((run) => run.runId)).size, plan.length);
  assert.equal(plan[0].runId, "gpt-4o-mini::vulnerable-direct-override::1");
  assert.equal(STAGE_CALIBRATION_MODELS.includes("gpt-3.5-turbo" as never), false);
  assert.deepEqual(calibrationPresets().map((preset) => preset.id), [...STAGE_CALIBRATION_PRESET_IDS]);
});

test("GigaChat plan accepts unsupported model IDs so provider errors stay per-run", () => {
  const plan = buildCalibrationPlan(1, calibrationPresets(), { providerId: "gigachat", models: ["GigaChat-2", "Unsupported-Model"] });
  assert.equal(plan.length, 6);
  assert.equal(plan.every((run) => run.providerId === "gigachat"), true);
  assert.equal(plan.some((run) => run.modelRequested === "Unsupported-Model"), true);
});

test("multi-turn run keeps ordered history inside one fresh combination", async () => {
  const multiTurn = buildCalibrationPlan(1).find((run) => run.modelRequested === "gpt-4o-mini" && run.preset.id === "vulnerable-multi-turn");
  assert.ok(multiTurn);
  const calls: ConversationMessage[][] = [];
  const request: CalibrationChatRequester = async ({ messages }) => {
    calls.push(messages);
    return { response: responseFor(messages), latencyMs: 1 };
  };

  const result = await executeCalibrationRun(multiTurn, request);
  assert.equal(result.providerError, null);
  assert.equal(result.providerId, "openai");
  assert.deepEqual(calls.map((messages) => messages.length), [1, 3, 5]);
  assert.deepEqual(calls.map((messages) => messages.at(-1)?.content), multiTurn.preset.prompts);
  assert.deepEqual(calls[0], [{ role: "user", content: multiTurn.preset.prompts[0] }]);
});

test("final DisclosureEvaluation is retained without a second evaluator", async () => {
  const direct = buildCalibrationPlan(1)[0];
  const leaked: DisclosureEvaluation = { ...NO_DISCLOSURE, canaryLeaked: true, matchedCanaries: ["DEMO-ORCHID-7F3A-91C2"], disclosureObserved: true };
  const request: CalibrationChatRequester = async ({ messages }) => ({ response: responseFor(messages, leaked), latencyMs: 1 });
  const result = await executeCalibrationRun(direct, request);
  assert.equal(result.providerError, null);
  assert.equal(result.disclosureObserved, true);
  assert.equal(result.canaryLeaked, true);
  assert.equal(result.employeeRecordLeaked, false);
});

test("summary reports leaks, no-disclosure, and provider errors distinctly", () => {
  const base: CalibrationResult = {
    runId: "id",
    runNumber: 1,
    providerId: "openai",
    modelRequested: "gpt-4o-mini",
    resolvedModelId: "resolved",
    presetId: "vulnerable-direct-override",
    disclosureObserved: true,
    canaryLeaked: true,
    employeeRecordLeaked: false,
    latencyMs: 1,
    providerError: null,
    finalAssistantResponse: "response",
    turns: [],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
  const rows = buildSummaryRows([
    base,
    { ...base, runId: "id-2", runNumber: 2, disclosureObserved: false, canaryLeaked: false },
    { ...base, runId: "id-3", presetId: "vulnerable-combined", disclosureObserved: null, canaryLeaked: null, employeeRecordLeaked: null, providerError: { httpStatus: 429, code: "rate_limit", message: "limited" } },
  ], 2);
  assert.equal(rows[0].DIRECT, "LEAK 1/2");
  assert.equal(rows[0].COMBINED, "ERROR 1/2");
});

test("calibration can resolve additional GigaChat models beyond the public Stage catalog", () => {
  const previousProvider = process.env.INJECTION_LAB_CALIBRATION_PROVIDER;
  const previousModels = process.env.INJECTION_LAB_CALIBRATION_MODELS;
  try {
    process.env.INJECTION_LAB_CALIBRATION_PROVIDER = "gigachat";
    process.env.INJECTION_LAB_CALIBRATION_MODELS = "GigaChat-2,Unsupported-Model";
    assert.deepEqual(getProviderCatalog().map((provider) => provider.id), ["gigachat", "openai"]);
    assert.equal(findProviderModel("gigachat", "GigaChat-2")?.model.capabilities.tools, "native");
    assert.equal(findProviderModel("gigachat", "Unsupported-Model")?.model.id, "Unsupported-Model");
    assert.equal(findProviderModel("gigachat", "Not-Selected"), undefined);
  } finally {
    if (previousProvider === undefined) delete process.env.INJECTION_LAB_CALIBRATION_PROVIDER;
    else process.env.INJECTION_LAB_CALIBRATION_PROVIDER = previousProvider;
    if (previousModels === undefined) delete process.env.INJECTION_LAB_CALIBRATION_MODELS;
    else process.env.INJECTION_LAB_CALIBRATION_MODELS = previousModels;
  }
});
