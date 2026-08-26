import type { ConversationMessage, DemoProfile, InternalMessage } from "@/lib/domain/types";

export function buildProfileMessages(profile: Pick<DemoProfile, "instructionMode" | "systemPrompt">, messages: ConversationMessage[]): InternalMessage[] {
  if (profile.instructionMode === "concatenated_user") {
    return messages.map((message, index) => message.role === "user" && index === 0
      ? { ...message, content: `${profile.systemPrompt}\n\n${message.content}` }
      : message);
  }
  return [{ role: "system", content: profile.systemPrompt }, ...messages];
}
