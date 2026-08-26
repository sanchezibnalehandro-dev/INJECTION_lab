import { CANONICAL_SYSTEM_PROMPT } from "@/demo/systemPrompt";
import { ATTACK_PRESETS } from "@/demo/attacks";
import { getProviderCatalog } from "@/lib/config/models";
import { GRANTED_TOOLS } from "@/lib/tools/definitions";
import { getAttackSuites, getPublicDemoProfiles } from "@/demo/profiles";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    systemPrompt: CANONICAL_SYSTEM_PROMPT,
    providers: getProviderCatalog(),
    tools: GRANTED_TOOLS.map(({ name, label, description }) => ({ name, label, description })),
    presets: ATTACK_PRESETS,
    defaultSuiteId: "vulnerable-lab",
    suites: getAttackSuites(),
    profiles: getPublicDemoProfiles(),
  }, { headers: { "Cache-Control": "no-store" } });
}
