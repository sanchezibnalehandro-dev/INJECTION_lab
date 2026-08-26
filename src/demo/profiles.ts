import "server-only";

import { ATTACK_PRESETS } from "@/demo/attacks";
import { getBrianReplicationSource, DOCUMENT_ANALYZER_SYSTEM_PROMPT } from "@/demo/brianReplication";
import { CANONICAL_SYSTEM_PROMPT } from "@/demo/systemPrompt";
import { getVulnerableLabPresets, VULNERABLE_CONTEXT_SYSTEM_PROMPT, VULNERABLE_DIRECT_INSTRUCTIONS, VULNERABLE_DOCUMENT_SYSTEM_PROMPT, VULNERABLE_RECORDS_SYSTEM_PROMPT } from "@/demo/vulnerableLab";
import type { AttackSuite, DemoProfile, DemoProfileId, GrantedTool } from "@/lib/domain/types";
import { BRIAN_ARGUS_TOOLS, BRIAN_PRIVATE_RECORD_TOOLS, GRANTED_TOOLS, VULNERABLE_RECORD_TOOLS } from "@/lib/tools/definitions";

type InternalDemoProfile = Omit<DemoProfile, "tools"> & { grantedTools: GrantedTool[] };

export function getAttackSuites(): AttackSuite[] {
  return [
    {
      id: "vulnerable-lab",
      title: "Vulnerable Lab",
      description: "Intentionally vulnerable educational flows using synthetic canaries and records only.",
      presets: getVulnerableLabPresets(),
    },
    {
      id: "exploratory",
      title: "Exploratory",
      description: "Original INJECTION LAB presets retained unchanged.",
      presets: ATTACK_PRESETS,
    },
    {
      id: "brian-replication",
      title: "Brian replication",
      description: "Verbatim prompts extracted from the approved Brian source Markdown.",
      presets: getBrianReplicationSource().presets,
    },
  ];
}

export function getInternalDemoProfiles(): InternalDemoProfile[] {
  const brian = getBrianReplicationSource();
  return [
    {
      id: "vulnerable-concatenated",
      title: "Vulnerable · Concatenated context",
      assistantLabel: "VULN-DIRECT",
      flow: "chat",
      systemPrompt: VULNERABLE_DIRECT_INSTRUCTIONS,
      instructionMode: "concatenated_user",
      grantedTools: [],
    },
    {
      id: "vulnerable-context",
      title: "Vulnerable · Context disclosure",
      assistantLabel: "VULN-CONTEXT",
      flow: "chat",
      systemPrompt: VULNERABLE_CONTEXT_SYSTEM_PROMPT,
      instructionMode: "privileged_system",
      grantedTools: [],
    },
    {
      id: "vulnerable-records",
      title: "Vulnerable · Employee records",
      assistantLabel: "VULN-RECORDS",
      flow: "chat",
      systemPrompt: VULNERABLE_RECORDS_SYSTEM_PROMPT,
      instructionMode: "privileged_system",
      grantedTools: VULNERABLE_RECORD_TOOLS,
    },
    {
      id: "vulnerable-document-analyzer",
      title: "Vulnerable · Document analyzer",
      assistantLabel: "VULN-DOCUMENT",
      flow: "document",
      systemPrompt: VULNERABLE_DOCUMENT_SYSTEM_PROMPT,
      instructionMode: "document_text",
      grantedTools: [],
    },
    {
      id: "exploratory-roger",
      title: "Exploratory ROGER",
      assistantLabel: "ROGER",
      flow: "chat",
      systemPrompt: CANONICAL_SYSTEM_PROMPT,
      instructionMode: "privileged_system",
      grantedTools: GRANTED_TOOLS,
    },
    {
      id: "brian-argus",
      title: "Brian · ARGUS",
      assistantLabel: "ARGUS",
      flow: "chat",
      systemPrompt: brian.argusSystemPrompt,
      instructionMode: "privileged_system",
      grantedTools: BRIAN_ARGUS_TOOLS,
    },
    {
      id: "brian-private-records",
      title: "Brian · Librarian AI",
      assistantLabel: "Librarian AI",
      flow: "chat",
      systemPrompt: brian.librarianSystemPrompt,
      instructionMode: "privileged_system",
      grantedTools: BRIAN_PRIVATE_RECORD_TOOLS,
    },
    {
      id: "brian-document-analyzer",
      title: "Brian · Document analyzer",
      assistantLabel: "Document analyzer",
      flow: "document",
      systemPrompt: DOCUMENT_ANALYZER_SYSTEM_PROMPT,
      instructionMode: "document_text",
      grantedTools: [],
    },
  ];
}

export function getDemoProfile(profileId: DemoProfileId): InternalDemoProfile | undefined {
  return getInternalDemoProfiles().find((profile) => profile.id === profileId);
}

export function getPublicDemoProfiles(): DemoProfile[] {
  return getInternalDemoProfiles().map(({ grantedTools, ...profile }) => ({
    ...profile,
    tools: grantedTools.map(({ name, label, description }) => ({ name, label, description })),
  }));
}
