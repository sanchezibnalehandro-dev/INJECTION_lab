export const PROVIDER_IDS = ["openai", "deepseek", "gigachat"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ClientMessageRole = "user" | "assistant" | "tool";
export type InternalMessageRole = ClientMessageRole | "system";

export type ToolMode = "native" | "unavailable";
export type RequestMode = "chat" | "document";
export type SamplingTreatment = "omitted" | "provider_default" | "adapter_configured";
export type AttackSuiteId = "vulnerable-lab" | "exploratory" | "brian-replication";
export type DemoProfileId =
  | "vulnerable-concatenated"
  | "vulnerable-context"
  | "vulnerable-records"
  | "vulnerable-document-analyzer"
  | "exploratory-roger"
  | "brian-argus"
  | "brian-private-records"
  | "brian-document-analyzer";
export type DemoFlowKind = "single_turn" | "multi_turn" | "document";
export type InstructionMode = "privileged_system" | "concatenated_user" | "document_text";
export type DocumentPresetId = "brian-document-injection" | "vulnerable-document-injection";

export interface ModelCapabilities {
  tools: "native" | "model_dependent" | "unavailable";
  structuredOutput: "not_exercised" | "model_dependent" | "unavailable";
  streaming: "not_enabled" | "model_dependent" | "unavailable";
}

export interface ModelDefinition {
  id: string;
  displayName: string;
  providerId: ProviderId;
  capabilities: ModelCapabilities;
}

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  defaultModelId: string;
  models: ModelDefinition[];
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  argumentsJson: string;
  providerState?: Record<string, string>;
}

export interface ConversationMessage {
  role: ClientMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: NormalizedToolCall[];
  providerState?: Record<string, string>;
}

export type InternalMessage = Omit<ConversationMessage, "role"> & {
  role: InternalMessageRole;
};

export interface GrantedTool {
  name: string;
  label: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AttackPreset {
  id: string;
  suiteId: AttackSuiteId;
  profileId: DemoProfileId;
  title: string;
  category: "control" | "attack";
  shortDescription: string;
  flow: DemoFlowKind;
  prompt: string;
  multiTurnSteps?: string[];
  sourceExactPrompt?: string | string[];
  runtimePrompt?: string | string[];
  sourceSection?: string;
  documentText?: string;
  architecturalFlaw?: string;
  grantedCapability?: string;
}

export interface AttackSuite {
  id: AttackSuiteId;
  title: string;
  description: string;
  presets: AttackPreset[];
}

export interface DemoProfile {
  id: DemoProfileId;
  title: string;
  assistantLabel: string;
  flow: DemoFlowKind | "chat";
  systemPrompt: string;
  instructionMode: InstructionMode;
  tools: Array<Pick<GrantedTool, "name" | "label" | "description">>;
}

export interface NormalizedRequestMetadata {
  systemLoaded: boolean;
  instructionMode: InstructionMode;
  historyCount: number;
  tools: Array<Pick<GrantedTool, "name" | "label">>;
  provider: ProviderId;
  model: string;
  profile: DemoProfileId;
  requestMode: RequestMode;
  toolMode: ToolMode;
  sampling: {
    treatment: SamplingTreatment;
    detail: string;
  };
}

export type DebugEvent =
  | { type: "request"; at: string; metadata: NormalizedRequestMetadata }
  | { type: "tool_requested"; at: string; tool: string; argumentsJson: string }
  | { type: "tool_executed"; at: string; tool: string }
  | { type: "tool_result"; at: string; tool: string; result: unknown }
  | { type: "response"; at: string; latencyMs: number; text: string; finishReason?: string; resolvedModelId?: string }
  | { type: "error"; at: string; code: string; message: string };

export interface ProviderTurnRequest {
  provider: ProviderDefinition;
  model: ModelDefinition;
  messages: InternalMessage[];
  canonicalSystemPrompt: string;
  grantedTools: GrantedTool[];
  metadata: NormalizedRequestMetadata;
}

export interface ProviderTurnResult {
  text: string;
  toolCalls: NormalizedToolCall[];
  latencyMs: number;
  finishReason?: string;
  resolvedModelId?: string;
  usage?: Record<string, number | undefined>;
}

export interface ChatResponse {
  message: ConversationMessage;
  history: ConversationMessage[];
  debugEvents: DebugEvent[];
  metadata: NormalizedRequestMetadata;
  evaluation: DisclosureEvaluation;
}

export interface DisclosureEvaluation {
  canaryLeaked: boolean;
  matchedCanaries: string[];
  employeeRecordLeaked: boolean;
  matchedEmployeeRecordIds: number[];
  disclosureObserved: boolean;
}
