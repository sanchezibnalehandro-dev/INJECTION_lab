import type { ClientMessageRole, ConversationMessage, DemoProfileId, DocumentPresetId, ProviderId } from "@/lib/domain/types";
import { PROVIDER_IDS } from "@/lib/domain/types";

const CLIENT_ROLES = new Set<ClientMessageRole>(["user", "assistant", "tool"]);

export interface ValidatedChatPayload {
  providerId: ProviderId;
  modelId: string;
  profileId: DemoProfileId;
  messages: ConversationMessage[];
}

const PROFILE_IDS = new Set<DemoProfileId>([
  "vulnerable-concatenated",
  "vulnerable-context",
  "vulnerable-records",
  "vulnerable-document-analyzer",
  "exploratory-roger",
  "brian-argus",
  "brian-private-records",
  "brian-document-analyzer",
]);

function invalid(message: string): never {
  throw new Error(message);
}

export function validateChatPayload(input: unknown): ValidatedChatPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Request body must be an object.");
  const record = input as Record<string, unknown>;
  const expected = new Set(["providerId", "modelId", "profileId", "messages"]);
  if (Object.keys(record).some((key) => !expected.has(key))) invalid("The chat request may not include system configuration.");
  if (typeof record.providerId !== "string" || !PROVIDER_IDS.includes(record.providerId as ProviderId)) invalid("Unknown provider.");
  if (typeof record.modelId !== "string" || !record.modelId.trim()) invalid("A configured model is required.");
  if (typeof record.profileId !== "string" || !PROFILE_IDS.has(record.profileId as DemoProfileId)) invalid("A configured demo profile is required.");
  if (record.profileId === "brian-document-analyzer" || record.profileId === "vulnerable-document-analyzer") invalid("The document analyzer is available only through the server-owned document flow.");
  if (!Array.isArray(record.messages) || record.messages.length > 40) invalid("Messages must be an array of at most 40 entries.");

  const messages = record.messages.map((value): ConversationMessage => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Every message must be an object.");
    const message = value as Record<string, unknown>;
    const allowed = new Set(["role", "content", "name", "toolCallId", "toolCalls"]);
    if (Object.keys(message).some((key) => !allowed.has(key))) invalid("Message contains unsupported fields.");
    if (typeof message.role !== "string" || !CLIENT_ROLES.has(message.role as ClientMessageRole)) invalid("System and developer messages are server-controlled.");
    if (typeof message.content !== "string" || message.content.length > 12000) invalid("Message content must be a string up to 12,000 characters.");
    if (message.name !== undefined && typeof message.name !== "string") invalid("Invalid tool name.");
    if (message.toolCallId !== undefined && typeof message.toolCallId !== "string") invalid("Invalid tool call ID.");
    if (message.toolCalls !== undefined) invalid("Client may not synthesize tool-call requests.");
    return { role: message.role as ClientMessageRole, content: message.content, ...(typeof message.name === "string" ? { name: message.name } : {}), ...(typeof message.toolCallId === "string" ? { toolCallId: message.toolCallId } : {}) };
  });

  if (record.profileId === "vulnerable-concatenated" && (messages.length !== 1 || messages[0].role !== "user")) {
    invalid("The concatenated demonstration accepts exactly one user message.");
  }

  return { providerId: record.providerId as ProviderId, modelId: record.modelId.trim(), profileId: record.profileId as DemoProfileId, messages };
}

export interface ValidatedDocumentAnalysisPayload {
  providerId: ProviderId;
  modelId: string;
  presetId: DocumentPresetId;
}

export function validateDocumentAnalysisPayload(input: unknown): ValidatedDocumentAnalysisPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Request body must be an object.");
  const record = input as Record<string, unknown>;
  const expected = new Set(["providerId", "modelId", "presetId"]);
  if (Object.keys(record).some((key) => !expected.has(key))) invalid("The document request may not include system, tool, or fixture configuration.");
  if (typeof record.providerId !== "string" || !PROVIDER_IDS.includes(record.providerId as ProviderId)) invalid("Unknown provider.");
  if (typeof record.modelId !== "string" || !record.modelId.trim()) invalid("A configured model is required.");
  if (record.presetId !== "brian-document-injection" && record.presetId !== "vulnerable-document-injection") invalid("Unknown document fixture.");
  return { providerId: record.providerId as ProviderId, modelId: record.modelId.trim(), presetId: record.presetId };
}
