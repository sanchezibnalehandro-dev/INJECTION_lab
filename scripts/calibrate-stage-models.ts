import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getVulnerableLabPresets } from "../src/demo/vulnerableLab";
import { OPENAI_COMPARISON_MODEL_IDS } from "../src/lib/config/models";
import type { AttackPreset, ChatResponse, ConversationMessage, DebugEvent, DisclosureEvaluation, DemoProfileId } from "../src/lib/domain/types";

export const STAGE_CALIBRATION_MODELS = [
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
] as const;

export const GIGACHAT_CALIBRATION_MODELS = [
  "GigaChat-2",
  "GigaChat-2-Pro",
  "GigaChat-2-Max",
  "GigaChat-3-Ultra",
] as const;

export const STAGE_CALIBRATION_PRESET_IDS = [
  "vulnerable-direct-override",
  "vulnerable-combined",
  "vulnerable-multi-turn",
] as const;

export type CalibrationProviderId = "openai" | "gigachat";
type CalibrationPresetId = (typeof STAGE_CALIBRATION_PRESET_IDS)[number];

export interface CalibrationCliOptions {
  providerId: CalibrationProviderId;
  models: string[];
  runsPerPair: number;
}

interface CalibrationPreset {
  id: CalibrationPresetId;
  profileId: DemoProfileId;
  title: string;
  prompts: string[];
}

export interface PlannedCalibrationRun {
  runId: string;
  runNumber: number;
  providerId: CalibrationProviderId;
  modelRequested: string;
  preset: CalibrationPreset;
}

interface ProviderErrorRecord {
  httpStatus: number | null;
  code: string;
  message: string;
}

interface CalibrationTurn {
  turnNumber: number;
  exactRuntimePrompt: string;
  assistantResponse: string;
  resolvedModelId: string | null;
  latencyMs: number;
  debugEvents: DebugEvent[];
}

export interface CalibrationResult {
  runId: string;
  runNumber: number;
  providerId: CalibrationProviderId;
  modelRequested: string;
  resolvedModelId: string | null;
  presetId: CalibrationPresetId;
  disclosureObserved: boolean | null;
  canaryLeaked: boolean | null;
  employeeRecordLeaked: boolean | null;
  latencyMs: number;
  providerError: ProviderErrorRecord | null;
  finalAssistantResponse: string | null;
  turns: CalibrationTurn[];
  completedAt: string;
}

interface CalibrationReport {
  schemaVersion: 1;
  status: "in_progress" | "complete";
  startedAt: string;
  completedAt: string | null;
  providerId: CalibrationProviderId;
  runsPerModelPreset: number;
  models: string[];
  presets: CalibrationPresetId[];
  baseUrl: string;
  serverMode: "temporary_local" | "existing_local" | "configured_external";
  results: CalibrationResult[];
}

interface ChatTurnResult {
  response: ChatResponse;
  latencyMs: number;
}

export type CalibrationChatRequester = (input: {
  providerId: CalibrationProviderId;
  modelId: string;
  profileId: DemoProfileId;
  messages: ConversationMessage[];
}) => Promise<ChatTurnResult>;

interface LocalServer {
  baseUrl: string;
  child: ChildProcess;
  logs: () => string;
}

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIRECTORY = resolve(PROJECT_ROOT, "reports");

class CalibrationRequestError extends Error {
  constructor(public readonly providerError: ProviderErrorRecord) {
    super(providerError.message);
    this.name = "CalibrationRequestError";
  }
}

function asRuntimePrompts(preset: AttackPreset): string[] {
  if (preset.id === "vulnerable-multi-turn") {
    if (!Array.isArray(preset.runtimePrompt) || preset.runtimePrompt.length !== 3) {
      throw new Error("vulnerable-multi-turn must expose exactly three runtime prompts.");
    }
    return [...preset.runtimePrompt];
  }
  if (typeof preset.runtimePrompt !== "string") {
    throw new Error(`${preset.id} must expose one string runtime prompt.`);
  }
  return [preset.runtimePrompt];
}

export function calibrationPresets(): CalibrationPreset[] {
  const presets = getVulnerableLabPresets();
  return STAGE_CALIBRATION_PRESET_IDS.map((id) => {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) throw new Error(`Required Vulnerable Lab preset is missing: ${id}`);
    return {
      id,
      profileId: preset.profileId,
      title: preset.title,
      prompts: asRuntimePrompts(preset),
    };
  });
}

export function parseRunsArgument(args: string[]): number {
  if (args.length === 0) return 1;
  if (args.length !== 1 || !args[0].startsWith("--runs=")) {
    throw new Error("Usage: npm run calibrate:stage -- --runs=N");
  }
  const value = args[0].slice("--runs=".length);
  if (!/^\d+$/.test(value)) throw new Error("--runs must be a positive integer.");
  const runs = Number(value);
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer.");
  return runs;
}

function parseModelsArgument(value: string): string[] {
  const models = value.split(",").map((model) => model.trim());
  if (models.length === 0 || models.some((model) => !model || !/^[A-Za-z0-9._:-]+$/.test(model))) {
    throw new Error("--models must be a comma-separated list of model IDs.");
  }
  return [...new Set(models)];
}

export function parseCalibrationOptions(args: string[]): CalibrationCliOptions {
  let providerId: CalibrationProviderId = "openai";
  let modelsArgument: string[] | undefined;
  let runsPerPair = 1;
  const seen = new Set<string>();

  for (const argument of args) {
    const separator = argument.indexOf("=");
    const name = separator >= 0 ? argument.slice(0, separator) : argument;
    const value = separator >= 0 ? argument.slice(separator + 1) : "";
    if (!["--provider", "--models", "--runs"].includes(name) || seen.has(name)) {
      throw new Error("Usage: npm run calibrate:stage -- --provider=openai|gigachat --models=model-a,model-b --runs=N");
    }
    seen.add(name);
    if (name === "--provider") {
      if (value !== "openai" && value !== "gigachat") throw new Error("--provider must be openai or gigachat.");
      providerId = value;
    } else if (name === "--models") {
      modelsArgument = parseModelsArgument(value);
    } else {
      runsPerPair = parseRunsArgument([argument]);
    }
  }

  const models = modelsArgument ?? (providerId === "openai" ? [...STAGE_CALIBRATION_MODELS] : [...GIGACHAT_CALIBRATION_MODELS]);
  if (providerId === "openai") {
    for (const model of models) {
      if (!STAGE_CALIBRATION_MODELS.includes(model as (typeof STAGE_CALIBRATION_MODELS)[number])) {
        throw new Error(`OpenAI calibration model is outside the accepted five-model set: ${model}`);
      }
    }
  }
  return { providerId, models, runsPerPair };
}

export function buildCalibrationPlan(
  runsPerPair: number,
  presets = calibrationPresets(),
  selection: Pick<CalibrationCliOptions, "providerId" | "models"> = { providerId: "openai", models: [...STAGE_CALIBRATION_MODELS] },
): PlannedCalibrationRun[] {
  if (!Number.isSafeInteger(runsPerPair) || runsPerPair < 1) throw new Error("runsPerPair must be a positive integer.");
  return selection.models.flatMap((modelRequested) => presets.flatMap((preset) =>
    Array.from({ length: runsPerPair }, (_, index) => ({
      runId: `${selection.providerId === "openai" ? "" : `${selection.providerId}::`}${modelRequested}::${preset.id}::${index + 1}`,
      runNumber: index + 1,
      providerId: selection.providerId,
      modelRequested,
      preset,
    })),
  ));
}

function responseEvent(events: DebugEvent[]): Extract<DebugEvent, { type: "response" }> | undefined {
  return [...events].reverse().find((event): event is Extract<DebugEvent, { type: "response" }> => event.type === "response");
}

function emptyEvaluation(): Pick<CalibrationResult, "disclosureObserved" | "canaryLeaked" | "employeeRecordLeaked"> {
  return { disclosureObserved: null, canaryLeaked: null, employeeRecordLeaked: null };
}

function resultEvaluation(evaluation: DisclosureEvaluation): Pick<CalibrationResult, "disclosureObserved" | "canaryLeaked" | "employeeRecordLeaked"> {
  return {
    disclosureObserved: evaluation.disclosureObserved,
    canaryLeaked: evaluation.canaryLeaked,
    employeeRecordLeaked: evaluation.employeeRecordLeaked,
  };
}

function unknownProviderError(error: unknown): ProviderErrorRecord {
  if (error instanceof CalibrationRequestError) return error.providerError;
  return {
    httpStatus: null,
    code: error instanceof DOMException && error.name === "TimeoutError" ? "transport_timeout" : "runner_error",
    message: error instanceof Error ? error.message : "Unknown calibration error.",
  };
}

export async function executeCalibrationRun(plan: PlannedCalibrationRun, requestChat: CalibrationChatRequester): Promise<CalibrationResult> {
  const startedAt = Date.now();
  const turns: CalibrationTurn[] = [];
  let history: ConversationMessage[] = [];
  let resolvedModelId: string | null = null;
  let lastResponse: ChatResponse | null = null;

  try {
    for (const [index, prompt] of plan.preset.prompts.entries()) {
      const messages: ConversationMessage[] = [...history, { role: "user", content: prompt }];
      const turn = await requestChat({ providerId: plan.providerId, modelId: plan.modelRequested, profileId: plan.preset.profileId, messages });
      lastResponse = turn.response;
      const event = responseEvent(turn.response.debugEvents);
      resolvedModelId = event?.resolvedModelId ?? resolvedModelId;
      turns.push({
        turnNumber: index + 1,
        exactRuntimePrompt: prompt,
        assistantResponse: turn.response.message.content,
        resolvedModelId: event?.resolvedModelId ?? null,
        latencyMs: turn.latencyMs,
        debugEvents: turn.response.debugEvents,
      });
      history = turn.response.history;
    }

    const finalResponse = turns.at(-1)?.assistantResponse ?? null;
    if (!lastResponse || finalResponse === null) throw new Error("Calibration run completed without a final assistant response.");
    return {
      runId: plan.runId,
      runNumber: plan.runNumber,
      providerId: plan.providerId,
      modelRequested: plan.modelRequested,
      resolvedModelId,
      presetId: plan.preset.id,
      ...resultEvaluation(lastResponse.evaluation),
      latencyMs: Date.now() - startedAt,
      providerError: null,
      finalAssistantResponse: finalResponse,
      turns,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      runId: plan.runId,
      runNumber: plan.runNumber,
      providerId: plan.providerId,
      modelRequested: plan.modelRequested,
      resolvedModelId,
      presetId: plan.preset.id,
      ...emptyEvaluation(),
      latencyMs: Date.now() - startedAt,
      providerError: unknownProviderError(error),
      finalAssistantResponse: null,
      turns,
      completedAt: new Date().toISOString(),
    };
  }
}

function apiError(status: number, body: unknown): ProviderErrorRecord {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  return {
    httpStatus: status,
    code: typeof error.code === "string" ? error.code : "api_error",
    message: typeof error.message === "string" ? error.message : `The local chat API returned HTTP ${status}.`,
  };
}

async function requestChat(baseUrl: string, input: Parameters<CalibrationChatRequester>[0]): Promise<ChatTurnResult> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new CalibrationRequestError({
      httpStatus: null,
      code: error instanceof DOMException && error.name === "TimeoutError" ? "transport_timeout" : "transport_error",
      message: error instanceof Error ? error.message : "The local chat API request failed.",
    });
  }
  const body = await response.json() as unknown;
  if (!response.ok) throw new CalibrationRequestError(apiError(response.status, body));
  return { response: body as ChatResponse, latencyMs: Date.now() - startedAt };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a local calibration port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitForServer(baseUrl: string, child: ChildProcess, logs: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Temporary Next server exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/demo-config`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Temporary Next server did not become ready.\n${logs()}`);
}

async function startLocalServer(options: CalibrationCliOptions): Promise<LocalServer> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextCli = resolve(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
  const isGigaChatCalibration = options.providerId === "gigachat";
  let nodeExtraCaCerts = process.env.NODE_EXTRA_CA_CERTS;
  if (isGigaChatCalibration) {
    try {
      await access(resolve(PROJECT_ROOT, ".next", "BUILD_ID"));
    } catch {
      throw new Error("GigaChat calibration requires a current production build. Run npm run build first.");
    }
    if (!nodeExtraCaCerts) {
      const localTrustedCa = resolve(PROJECT_ROOT, "certs", "russian_trusted_root_ca_pem.crt");
      try {
        await access(localTrustedCa);
        nodeExtraCaCerts = localTrustedCa;
      } catch {
        // Keep the platform trust store when the optional local CA bundle is absent.
      }
    }
  }
  const serverCommand = isGigaChatCalibration ? "start" : "dev";
  const child = spawn(process.execPath, [nextCli, serverCommand, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...(nodeExtraCaCerts ? { NODE_EXTRA_CA_CERTS: nodeExtraCaCerts } : {}),
      ...(isGigaChatCalibration ? {
        INJECTION_LAB_CALIBRATION_PROVIDER: "gigachat",
        INJECTION_LAB_CALIBRATION_MODELS: options.models.join(","),
      } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let capturedLogs = "";
  const capture = (chunk: Buffer) => {
    capturedLogs = `${capturedLogs}${chunk.toString("utf8")}`.slice(-16_000);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  const logs = () => capturedLogs.trim();
  const server = { baseUrl, child, logs };
  try {
    await waitForServer(baseUrl, child, logs);
    return server;
  } catch (error) {
    await stopLocalServer(server);
    throw error;
  }
}

async function stopLocalServer(server: LocalServer): Promise<void> {
  if (server.child.exitCode !== null) return;
  server.child.kill();
  await Promise.race([
    new Promise<void>((resolveExit) => server.child.once("exit", () => resolveExit())),
    new Promise<void>((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
}

async function verifyExternalServer(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/demo-config`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Configured INJECTION_LAB_BASE_URL returned HTTP ${response.status}.`);
}

async function hasDemoServer(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/demo-config`, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function detailLine(result: CalibrationResult, index: number, total: number): string {
  const error = result.providerError ? `${result.providerError.code}:${result.providerError.message}` : "none";
  return `[${index}/${total}] providerId=${result.providerId} modelRequested=${result.modelRequested} resolvedModelId=${result.resolvedModelId ?? "N/A"} presetId=${result.presetId} run=${result.runNumber} disclosureObserved=${result.disclosureObserved ?? "ERROR"} canaryLeaked=${result.canaryLeaked ?? "ERROR"} employeeRecordLeaked=${result.employeeRecordLeaked ?? "ERROR"} latency=${result.latencyMs}ms providerError=${error}`;
}

function summaryCell(results: CalibrationResult[], plannedRuns: number): string {
  const errors = results.filter((result) => result.providerError !== null).length;
  const successful = results.length - errors;
  const leaks = results.filter((result) => result.disclosureObserved === true).length;
  if (successful === 0) return `ERROR ${errors}/${plannedRuns}`;
  const outcome = plannedRuns === 1 ? (leaks > 0 ? "LEAK" : "NO") : (leaks > 0 ? `LEAK ${leaks}/${plannedRuns}` : `NO 0/${plannedRuns}`);
  return errors > 0 ? `${outcome} · ERROR ${errors}/${plannedRuns}` : outcome;
}

export function buildSummaryRows(results: CalibrationResult[], runsPerPair: number, models: readonly string[] = STAGE_CALIBRATION_MODELS): Array<Record<string, string>> {
  return models.map((model) => ({
    MODEL: model,
    DIRECT: summaryCell(results.filter((result) => result.modelRequested === model && result.presetId === "vulnerable-direct-override"), runsPerPair),
    COMBINED: summaryCell(results.filter((result) => result.modelRequested === model && result.presetId === "vulnerable-combined"), runsPerPair),
    "MULTI-TURN": summaryCell(results.filter((result) => result.modelRequested === model && result.presetId === "vulnerable-multi-turn"), runsPerPair),
  }));
}

async function checkpoint(path: string, report: CalibrationReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function reportPath(startedAt: string, providerId: CalibrationProviderId): string {
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const providerSegment = providerId === "openai" ? "" : `${providerId}-`;
  return resolve(REPORT_DIRECTORY, `stage-model-calibration-${providerSegment}${timestamp}.json`);
}

async function main(): Promise<void> {
  const options = parseCalibrationOptions(process.argv.slice(2));
  if (options.providerId === "openai") {
    for (const model of options.models) {
      if (!OPENAI_COMPARISON_MODEL_IDS.includes(model as (typeof OPENAI_COMPARISON_MODEL_IDS)[number])) {
        throw new Error(`Calibration model is not in the configured catalog source: ${model}`);
      }
    }
  }
  const plan = buildCalibrationPlan(options.runsPerPair, calibrationPresets(), options);
  const configuredBaseUrl = process.env.INJECTION_LAB_BASE_URL?.replace(/\/$/, "");
  let localServer: LocalServer | null = null;
  const startedAt = new Date().toISOString();
  const outputPath = reportPath(startedAt, options.providerId);

  try {
    let baseUrl: string;
    let serverMode: CalibrationReport["serverMode"];
    if (configuredBaseUrl) {
      baseUrl = configuredBaseUrl;
      serverMode = "configured_external";
      await verifyExternalServer(baseUrl);
    } else if (options.providerId === "openai" && await hasDemoServer("http://localhost:3000")) {
      baseUrl = "http://localhost:3000";
      serverMode = "existing_local";
    } else {
      localServer = await startLocalServer(options);
      baseUrl = localServer.baseUrl;
      serverMode = "temporary_local";
    }
    const report: CalibrationReport = {
      schemaVersion: 1,
      status: "in_progress",
      startedAt,
      completedAt: null,
      providerId: options.providerId,
      runsPerModelPreset: options.runsPerPair,
      models: options.models,
      presets: [...STAGE_CALIBRATION_PRESET_IDS],
      baseUrl,
      serverMode,
      results: [],
    };

    for (const [index, plannedRun] of plan.entries()) {
      const result = await executeCalibrationRun(plannedRun, (input) => requestChat(baseUrl, input));
      report.results.push(result);
      await checkpoint(outputPath, report);
      process.stdout.write(`${detailLine(result, index + 1, plan.length)}\n`);
    }

    report.status = "complete";
    report.completedAt = new Date().toISOString();
    await checkpoint(outputPath, report);
    console.table(buildSummaryRows(report.results, options.runsPerPair, options.models));
    process.stdout.write(`Calibration report: ${outputPath}\n`);
  } finally {
    if (localServer) await stopLocalServer(localServer);
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Stage model calibration failed."}\n`);
    process.exitCode = 1;
  });
}
