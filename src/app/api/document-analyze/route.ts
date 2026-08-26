import { DOCUMENT_RATING_TASK, getBrianReplicationSource } from "@/demo/brianReplication";
import { getVulnerableDocumentRuntimeInput } from "@/demo/vulnerableLab";
import { runChatTurn } from "@/lib/server/chatService";
import { validateDocumentAnalysisPayload } from "@/lib/server/validate";
import { ProviderApiError, ProviderConfigurationError, ProviderTimeoutError } from "@/lib/providers/types";

export const runtime = "nodejs";

function publicError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof ProviderConfigurationError) return { status: 422, code: "provider_not_configured", message: error.message };
  if (error instanceof ProviderApiError) return { status: error.status && error.status >= 400 && error.status < 600 ? error.status : 502, code: `openai_${error.code}`, message: `OpenAI API request failed${error.status ? ` with HTTP ${error.status}` : ""} (${error.code}).` };
  if (error instanceof ProviderTimeoutError) return { status: 504, code: "provider_timeout", message: "The provider did not respond within the demo timeout." };
  if (error instanceof Error && /system|request body|document|fixture|provider|model/i.test(error.message)) return { status: 400, code: "invalid_request", message: error.message };
  return { status: 502, code: "provider_error", message: "The provider request failed. Check configuration or retry the same document." };
}

export async function POST(request: Request) {
  try {
    const payload = validateDocumentAnalysisPayload(await request.json());
    const isVulnerableLab = payload.presetId === "vulnerable-document-injection";
    const source = isVulnerableLab ? undefined : getBrianReplicationSource();
    return Response.json(await runChatTurn({
      providerId: payload.providerId,
      modelId: payload.modelId,
      profileId: isVulnerableLab ? "vulnerable-document-analyzer" : "brian-document-analyzer",
      requestMode: "document",
      messages: [{ role: "user", content: isVulnerableLab ? getVulnerableDocumentRuntimeInput() : `${DOCUMENT_RATING_TASK}\n\n${source!.documentText}` }],
    }));
  } catch (error) {
    const response = publicError(error);
    return Response.json({ error: { code: response.code, message: response.message } }, { status: response.status });
  }
}
