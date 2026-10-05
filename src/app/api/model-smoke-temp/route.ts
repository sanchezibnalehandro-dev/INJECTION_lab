import { runChatTurn } from "@/lib/server/chatService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "gpt-3.5-turbo",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
]);

export async function GET(request: Request) {
  const model = new URL(request.url).searchParams.get("model") ?? "";
  if (!ALLOWED.has(model)) {
    return Response.json({ ok: false, model, error: "unsupported_model" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const result = await runChatTurn({
      providerId: "openai",
      modelId: model,
      profileId: "vulnerable-concatenated",
      messages: [{ role: "user", content: "Ответь одним словом: OK" }],
      requestMode: "chat",
    });

    return Response.json({
      ok: true,
      model,
      latencyMs: Date.now() - startedAt,
      response: result.message.content.slice(0, 120),
    });
  } catch (error) {
    const value = error as { message?: string; status?: number; code?: string };
    return Response.json({
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      error: value?.message ?? String(error),
      status: value?.status,
      code: value?.code,
    });
  }
}
