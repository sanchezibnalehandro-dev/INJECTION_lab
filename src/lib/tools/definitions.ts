import type { GrantedTool } from "@/lib/domain/types";
import { SYNTHETIC_WEB_URL } from "@/demo/syntheticWeb";

export const GRANTED_TOOLS: GrantedTool[] = [
  {
    name: "get_environment_variables",
    label: "Fake environment variables",
    description: "Returns the fixed synthetic environment fixture for this demo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_employee_records",
    label: "Synthetic employee records",
    description: "Returns the fixed synthetic employee-record fixture for this demo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const BRIAN_ARGUS_TOOLS: GrantedTool[] = [
  {
    name: "env",
    label: "Synthetic environment",
    description: "Returns the fixed synthetic environment fixture for this demo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "web_fetch",
    label: "Synthetic local web fetch",
    description: `Returns one fixed local fixture. The only allowed URL is ${SYNTHETIC_WEB_URL}. No network request is made.`,
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", enum: [SYNTHETIC_WEB_URL] } },
      required: ["url"],
      additionalProperties: false,
    },
  },
];

export const BRIAN_PRIVATE_RECORD_TOOLS: GrantedTool[] = [
  {
    name: "get_user_records",
    label: "Private synthetic user records",
    description: "Returns fixed synthetic private user records for the Brian replication profile.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const VULNERABLE_RECORD_TOOLS: GrantedTool[] = [
  {
    name: "get_employee_records",
    label: "Synthetic employee records",
    description: "Returns the fixed immutable DEMO_EMPLOYEES fixture. No application-level authorization is applied in Vulnerable Lab.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];
